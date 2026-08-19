import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { SAP_RADAR_MATERIAL_PRODUCT_MAP } from "@/data/catalog";
import type { ParsedSapRadarRow } from "@/types";

// ── "Radar últimos 3 Meses" ────────────────────────────────────────
// Mismo formato de archivo que la Carga Radar, pero va a su propia tabla
// (radar_3m_records, migration 017) y NO toca sap_sell_in_records: es el
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

    // Solo clientes que ya están en la cartera (no se crean localidades acá).
    const sapCodes = [...new Set(rows.map((r) => r.sap_code))];
    const { data: locs, error: locError } = await supabase
      .from("locations")
      .select("id, sap_code")
      .in("sap_code", sapCodes);
    if (locError) throw locError;
    const locationIds = new Map(
      ((locs ?? []) as { id: string; sap_code: string }[]).map((l) => [l.sap_code, l.id])
    );

    // Colapsar por cliente+producto+mes, quedándose con la fecha más reciente:
    // "Venta Acumulada" se reinicia cada mes, así que el último corte de cada
    // mes ES el total de ese mes, y sumar los meses da el total del período.
    const byKey = new Map<string, { location_id: string; product_id: string; quantity_kg: number; date_of_sale: string }>();
    // Se cuentan CLIENTES distintos, no filas: un cliente aparece muchas veces
    // (una por corte diario) y contar filas daba un número sin significado.
    const codigosFuera = new Set<string>();
    const materialesNoMapeados = new Set<string>();

    for (const r of rows) {
      const location_id = locationIds.get(r.sap_code);
      if (!location_id) {
        codigosFuera.add(r.sap_code);
        continue;
      }
      const product_id = SAP_RADAR_MATERIAL_PRODUCT_MAP[r.material_code];
      if (!product_id) {
        materialesNoMapeados.add(`${r.material_code} (${r.material_name})`);
        continue;
      }
      const key = `${location_id}|${product_id}|${monthKey(r.fecha)}`;
      const prev = byKey.get(key);
      if (!prev || r.fecha > prev.date_of_sale) {
        byKey.set(key, { location_id, product_id, quantity_kg: r.quantity_kg, date_of_sale: r.fecha });
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

    const toInsert = [...byKey.values()]
      .filter((r) => r.quantity_kg > 0)
      .map((r) => ({ ...r, upload_batch_id: batchId }));

    if (toInsert.length === 0) {
      return Response.json({ error: "El archivo no trajo filas con volumen para clientes de la cartera." }, { status: 422 });
    }

    // Primero inserta/marca y después borra lo de cargas anteriores, para no
    // quedar sin datos si el insert falla (no hay transacción vía REST).
    const { error: upsertError } = await supabase
      .from("radar_3m_records")
      .upsert(toInsert, { onConflict: "location_id,product_id,date_of_sale", ignoreDuplicates: false });
    if (upsertError) throw upsertError;

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
      clientes_en_cartera: new Set(toInsert.map((r) => r.location_id)).size,
      clientes_fuera_cartera: codigosFuera.size,
      clientes_en_archivo: sapCodes.length,
      meses: [...new Set(toInsert.map((r) => monthKey(r.date_of_sale)))].sort(),
      desde: fechas[0],
      hasta: fechas[fechas.length - 1],
      total_kg: Math.round(toInsert.reduce((s, r) => s + r.quantity_kg, 0) * 10) / 10,
    });
  } catch (error) {
    console.error("[POST /api/radar-3m-upload]", error);
    return Response.json({ error: "Error interno del servidor", detail: errorDetail(error) }, { status: 500 });
  }
}
