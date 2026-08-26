import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { PRODUCT_IDS, SAP_RADAR_MAVESA_MATERIAL_PRODUCT_MAP } from "@/data/catalog";
import { processRadarCategoriaUpload, errorDetail } from "@/lib/radar-categoria-upload";
import type { ParsedSapRadarRow } from "@/types";

// Radar de Mayonesa (Mavesa) — período de REFERENCIA (mayo-julio, igual
// ventana que radar_3m_records de PAN). Alimenta SOLO el promedio del
// gráfico de ratio diario — nunca las barras de totales, que usan
// radar_mayonesa_actual_records (ver radar-mayonesa-actual-upload). Tabla
// propia: cargar este archivo no puede afectar a Margarina ni al "actual" de
// esta misma categoría.

export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = (await req.json()) as { rows?: ParsedSapRadarRow[]; batchId?: string; finalizar?: boolean };
    const { rows, batchId, finalizar } = body;
    if (!rows?.length || !batchId) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const result = await processRadarCategoriaUpload(
      supabase,
      "radar_mayonesa_referencia_records",
      SAP_RADAR_MAVESA_MATERIAL_PRODUCT_MAP,
      PRODUCT_IDS.MAYONESA,
      rows,
      batchId,
      finalizar ?? true,
      false // universo completo del reporte, no solo cartera — ver plan/migration 023
    );
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result);
  } catch (error) {
    console.error("[POST /api/radar-mayonesa-referencia-upload]", error);
    return Response.json({ error: "Error interno del servidor", detail: errorDetail(error) }, { status: 500 });
  }
}
