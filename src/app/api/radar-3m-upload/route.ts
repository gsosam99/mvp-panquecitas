import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { SAP_RADAR_MATERIAL_PRODUCT_MAP } from "@/data/catalog";
import type { ParsedSapRadarRow } from "@/types";

// ── "Radar últimos 3 Meses" ────────────────────────────────────────
// Mismo formato de archivo que la Carga Radar, pero va a su propia tabla
// (radar_3m_records, migrations 017 y 018) y NO toca sap_sell_in_records: es el
// histórico de Harina PAN que sirve de referencia fija en el gráfico de
// rendimiento diario, no venta viva del piloto.
//
// El archivo trae "Venta Acumulada" por cliente+material, que se reinicia cada
// mes, así que se colapsa por cliente+material+MES quedándose con el corte más
// reciente de cada mes — mismo criterio que handleRadarUpload. Sumar los meses
// da el total del período.
//
// Cada carga REEMPLAZA la anterior: el reporte se exporta completo.

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = (await req.json()) as { rows?: ParsedSapRadarRow[]; batchId?: string };
    const { rows, batchId } = body;
    if (!rows?.length || !batchId) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // Se resuelve el cliente contra la cartera solo para poder marcar
    // location_id (lo usa el filtro "PAN Cliente"). Los que no calzan igual se
    // guardan: el promedio de referencia es la venta total del reporte.
    const sapCodes = [...new Set(rows.map((r) => r.sap_code))];
    // Por tandas: el .in() viaja en la URL y con ~700 códigos se pasa del largo
    // máximo de una petición, que la haría fallar entera.
    const locationIds = new Map<string, string>();
    const TANDA_CODIGOS = 200;
    for (let i = 0; i < sapCodes.length; i += TANDA_CODIGOS) {
      const { data: locs, error: locError } = await supabase
        .from("locations")
        .select("id, sap_code")
        .in("sap_code", sapCodes.slice(i, i + TANDA_CODIGOS));
      if (locError) throw locError;
      for (const l of (locs ?? []) as { id: string; sap_code: string }[]) {
        locationIds.set(l.sap_code, l.id);
      }
    }

    // Colapsar por cliente+MATERIAL+mes, quedándose con la fecha más reciente:
    // "Venta Acumulada" se reinicia cada mes, así que el último corte de cada
    // mes ES el total de ese mes, y sumar los meses da el total del período.
    //
    // Por MATERIAL y no por producto: Harina PAN tiene dos (H187 de 1 kg y H439
    // de 2 kg). Colapsando por producto, un cliente con las dos presentaciones
    // perdía el volumen de una — es el "aunque estén repetidos en el reporte".
    const byKey = new Map<
      string,
      {
        sap_code: string;
        material_code: string;
        location_id: string | null;
        product_id: string;
        quantity_kg: number;
        date_of_sale: string;
      }
    >();
    // Se cuentan CLIENTES distintos, no filas: un cliente aparece muchas veces
    // (una por corte diario) y contar filas daba un número sin significado.
    const codigosFuera = new Set<string>();
    const materialesNoMapeados = new Set<string>();

    for (const r of rows) {
      // Los clientes fuera de la cartera se guardan igual (para poder reportarlos),
      // pero quedan sin location_id y por eso NO entran en el promedio: PAN
      // Universo son los clientes de la cartera. Ver getRendimiento3M.
      const location_id = locationIds.get(r.sap_code) ?? null;
      if (!location_id) codigosFuera.add(r.sap_code);

      const product_id = SAP_RADAR_MATERIAL_PRODUCT_MAP[r.material_code];
      if (!product_id) {
        materialesNoMapeados.add(`${r.material_code} (${r.material_name})`);
        continue;
      }
      const key = `${r.sap_code}|${r.material_code}|${monthKey(r.fecha)}`;
      const prev = byKey.get(key);
      if (!prev || r.fecha > prev.date_of_sale) {
        byKey.set(key, {
          sap_code: r.sap_code,
          material_code: r.material_code,
          location_id,
          product_id,
          quantity_kg: r.quantity_kg,
          date_of_sale: r.fecha,
        });
      }
    }

    if (materialesNoMapeados.size > 0) {
      return Response.json(
        {
          error: `Materiales SAP no mapeados: ${[...materialesNoMapeados].join(", ")}. Actualiza SAP_RADAR_MATERIAL_PRODUCT_MAP en catalog.ts.`,
        },
        { status: 422 }
      );
    }

    const colapsadas = [...byKey.values()];
    const toInsert = colapsadas
      .filter((r) => r.quantity_kg > 0)
      .map((r) => ({ ...r, upload_batch_id: batchId }));

    // Diagnóstico fino: distingue "el mes no venía en el archivo" de "el mes
    // venía pero su columna de volumen se leyó en 0". Sin esto no se puede
    // saber si el problema es del parser o del reporte.
    const mesesEnArchivo = [...new Set(colapsadas.map((r) => monthKey(r.date_of_sale)))].sort();
    const sinVolumenPorMes: Record<string, number> = {};
    for (const r of colapsadas) {
      if (r.quantity_kg > 0) continue;
      const m = monthKey(r.date_of_sale);
      sinVolumenPorMes[m] = (sinVolumenPorMes[m] ?? 0) + 1;
    }

    if (toInsert.length === 0) {
      return Response.json({ error: "El archivo no trajo ninguna fila con volumen." }, { status: 422 });
    }

    // Primero inserta/marca y después borra lo de cargas anteriores, para no
    // quedar sin datos si el insert falla (no hay transacción vía REST).
    // También por tandas: ~700 clientes × 3 meses son miles de filas en un solo
    // cuerpo de petición.
    const TANDA_FILAS = 500;
    for (let i = 0; i < toInsert.length; i += TANDA_FILAS) {
      const { error: upsertError } = await supabase
        .from("radar_3m_records")
        .upsert(toInsert.slice(i, i + TANDA_FILAS), {
          onConflict: "sap_code,material_code,date_of_sale",
          ignoreDuplicates: false,
        });
      if (upsertError) throw upsertError;
    }

    const { data: borradas, error: staleError } = await supabase
      .from("radar_3m_records")
      .delete()
      .or(`upload_batch_id.is.null,upload_batch_id.neq.${batchId}`)
      .select("id");
    if (staleError) throw staleError;

    // Diagnóstico: sin esto, un "10 registros" no dice si el archivo venía
    // corto, si los clientes no calzan con la cartera o si faltan meses.
    const fechas = toInsert.map((r) => r.date_of_sale).sort();
    return Response.json({
      inserted: toInsert.length,
      reemplazadas: (borradas ?? []).length,
      clientes_en_cartera: new Set(toInsert.filter((r) => r.location_id).map((r) => r.location_id)).size,
      clientes_fuera_cartera: codigosFuera.size,
      clientes_en_archivo: sapCodes.length,
      meses: [...new Set(toInsert.map((r) => monthKey(r.date_of_sale)))].sort(),
      meses_en_archivo: mesesEnArchivo,
      sin_volumen_por_mes: sinVolumenPorMes,
      // Total por mes: se compara de un vistazo contra el reporte y dice si
      // algún mes se está leyendo corto.
      total_kg_por_mes: Object.fromEntries(
        mesesEnArchivo.map((m) => [
          m,
          Math.round(
            toInsert.filter((r) => monthKey(r.date_of_sale) === m).reduce((s, r) => s + r.quantity_kg, 0) * 10
          ) / 10,
        ])
      ),
      desde: fechas[0],
      hasta: fechas[fechas.length - 1],
      total_kg: Math.round(toInsert.reduce((s, r) => s + r.quantity_kg, 0) * 10) / 10,
    });
  } catch (error) {
    console.error("[POST /api/radar-3m-upload]", error);
    return Response.json({ error: "Error interno del servidor", detail: errorDetail(error) }, { status: 500 });
  }
}
