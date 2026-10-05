import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { PRODUCT_IDS, SAP_RADAR_MATERIAL_PRODUCT_MAP } from "@/data/catalog";

// Carga "Facturado Harina PAN": el reporte SAP Pedidos y Facturado
// (N7_V_SD83_WEB_001) corrido para Harina PAN. Escribe SOLO en
// facturado_hpm_dia (migration 027) y alimenta el botón "Facturado" del
// gráfico de baseline de PAN de DIENN. No toca sap_pedidos_facturados ni
// `locations`: a diferencia de la carga de Panquecitas, no refresca la cartera.
//
// Llega partida en tandas por CLIENTE (Vercel corta los cuerpos de más de
// ~4,5 MB). Todas comparten batchId, y el borrado de lo viejo corre una sola
// vez, en la última ("finalizar"), sobre los MESES que trae el archivo: así se
// puede subir mes por mes sin pisar los otros meses.

/** Fila liviana que manda el navegador: solo lo que se guarda. */
type FilaFacturadoHpm = {
  sap_code: string;
  material_code: string;
  material_name: string;
  fecha: string;
  cantidad_pedido_kg: number;
  cantidad_facturada_kg: number;
};

/**
 * Código de material sin el prefijo "CR/": este reporte trae "CR/H187" y el
 * Radar "H187" (ver SAP_RADAR_MATERIAL_PRODUCT_MAP). Se guarda así, sin prefijo.
 */
function materialSinPrefijo(materialCode: string): string {
  return materialCode.trim().replace(/^CR\//i, "");
}

/**
 * Materiales de Harina PAN: los mismos que cuenta la Carga Radar (H187, H439),
 * para que el ratio facturado sea comparable con el de Radar. El reporte trae
 * más (H188 amarillo, H173 mezcla con arroz, H098 integral…): se ignoran.
 */
function esHarinaPan(materialCode: string): boolean {
  return SAP_RADAR_MATERIAL_PRODUCT_MAP[materialSinPrefijo(materialCode)] === PRODUCT_IDS.HARINA_PAN;
}

function errorDetail(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint, e.code].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  return String(error);
}

export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = (await req.json()) as {
      rows?: FilaFacturadoHpm[];
      batchId?: string;
      /** Todos los meses ("YYYY-MM") del archivo, no solo los de esta tanda. */
      meses?: string[];
      /** `false` mientras queden tandas: el borrado de lo viejo corre una sola vez, en la última. */
      finalizar?: boolean;
    };
    const { rows, batchId, meses = [], finalizar = true } = body;
    if (!rows?.length || !batchId) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // ── 1. Solo Harina PAN. El resto de materiales se ignora y se informa.
    const materialesIgnorados = new Set<string>();
    const filasPan: FilaFacturadoHpm[] = [];
    for (const r of rows) {
      if (esHarinaPan(r.material_code)) filasPan.push(r);
      else materialesIgnorados.add(`${r.material_code} (${r.material_name})`);
    }

    // ── 2. Solo clientes que existen en `locations`. Por tandas: el .in() viaja
    // en la URL y con cientos de códigos se pasa del largo permitido.
    const sapCodes = [...new Set(filasPan.map((r) => r.sap_code.trim()))];
    const conocidos = new Set<string>();
    const TANDA_CODIGOS = 200;
    for (let i = 0; i < sapCodes.length; i += TANDA_CODIGOS) {
      const { data, error } = await supabase
        .from("locations")
        .select("sap_code")
        .in("sap_code", sapCodes.slice(i, i + TANDA_CODIGOS));
      if (error) throw error;
      for (const l of (data ?? []) as { sap_code: string }[]) conocidos.add(l.sap_code.trim());
    }
    const clientesIgnorados = sapCodes.filter((c) => !conocidos.has(c)).length;

    // ── 3. Sumar por cliente + material + día: el reporte trae varias filas
    // por esa llave (facturas distintas del mismo día) y NO son duplicados.
    const porDia = new Map<
      string,
      {
        sap_code: string;
        material_code: string;
        cantidad_pedido_kg: number;
        cantidad_facturada_kg: number;
        fecha: string;
        upload_batch_id: string;
      }
    >();
    for (const r of filasPan) {
      const sap_code = r.sap_code.trim();
      if (!conocidos.has(sap_code)) continue;
      const material_code = materialSinPrefijo(r.material_code);
      const fecha = r.fecha.slice(0, 10);
      const clave = `${sap_code}|${material_code}|${fecha}`;
      const previa = porDia.get(clave);
      if (previa) {
        previa.cantidad_pedido_kg += Number(r.cantidad_pedido_kg) || 0;
        previa.cantidad_facturada_kg += Number(r.cantidad_facturada_kg) || 0;
        continue;
      }
      porDia.set(clave, {
        sap_code,
        material_code,
        cantidad_pedido_kg: Number(r.cantidad_pedido_kg) || 0,
        cantidad_facturada_kg: Number(r.cantidad_facturada_kg) || 0,
        fecha,
        upload_batch_id: batchId,
      });
    }
    // Sin cantidad en ninguna de las dos columnas no hay nada que guardar.
    const filas = [...porDia.values()].filter((r) => r.cantidad_pedido_kg !== 0 || r.cantidad_facturada_kg !== 0);

    // ── 4. Guardar. Upsert: si el mismo día ya venía de una carga anterior,
    // queda con el valor nuevo y el batch nuevo (el reporte no es inmutable:
    // un pedido se factura días después).
    const TANDA_FILAS = 500;
    for (let i = 0; i < filas.length; i += TANDA_FILAS) {
      const { error } = await supabase
        .from("facturado_hpm_dia")
        .upsert(filas.slice(i, i + TANDA_FILAS), { onConflict: "sap_code,material_code,fecha", ignoreDuplicates: false });
      if (error) throw error;
    }

    // ── 5. Última tanda: lo de cargas anteriores en los meses del archivo que
    // este archivo ya no trae (un pedido anulado, un cliente que salió).
    let reemplazadas = 0;
    if (finalizar) {
      for (const mes of [...new Set(meses)].filter((m) => /^\d{4}-\d{2}$/.test(m))) {
        const [anio, mm] = mes.split("-").map(Number);
        const hasta = new Date(Date.UTC(anio, mm, 0)).toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from("facturado_hpm_dia")
          .delete()
          .gte("fecha", `${mes}-01`)
          .lte("fecha", hasta)
          .or(`upload_batch_id.is.null,upload_batch_id.neq.${batchId}`)
          .select("id");
        if (error) throw error;
        reemplazadas += (data ?? []).length;
      }
    }

    // Diagnóstico por mes, para poder auditar la carga.
    const totalKgPorMes: Record<string, number> = {};
    for (const r of filas) {
      const m = r.fecha.slice(0, 7);
      totalKgPorMes[m] = Math.round(((totalKgPorMes[m] ?? 0) + r.cantidad_facturada_kg) * 10) / 10;
    }
    const fechas = filas.map((r) => r.fecha).sort();

    return Response.json({
      guardadas: filas.length,
      reemplazadas,
      clientes_guardados: new Set(filas.map((r) => r.sap_code)).size,
      clientes_ignorados: clientesIgnorados,
      materiales_ignorados: [...materialesIgnorados],
      total_kg_por_mes: totalKgPorMes,
      desde: fechas[0] ?? "",
      hasta: fechas[fechas.length - 1] ?? "",
    });
  } catch (error) {
    console.error("[POST /api/facturado-hpm-upload]", error);
    return Response.json({ error: "Error interno del servidor", detail: errorDetail(error) }, { status: 500 });
  }
}
