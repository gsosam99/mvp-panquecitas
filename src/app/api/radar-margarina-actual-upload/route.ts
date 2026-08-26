import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { PRODUCT_IDS, SAP_RADAR_MAVESA_MATERIAL_PRODUCT_MAP } from "@/data/catalog";
import { processRadarCategoriaUpload, errorDetail } from "@/lib/radar-categoria-upload";
import type { ParsedSapRadarRow } from "@/types";

// Radar de Margarina (Mavesa) — período ACTUAL (agosto en adelante, el mes
// vivo). Alimenta SOLO el gráfico de barras de totales acumulados — nunca el
// promedio del ratio, que usa radar_margarina_referencia_records (ver
// radar-margarina-referencia-upload). Tabla propia: cargar este archivo no
// puede afectar a Mayonesa ni a la referencia de esta misma categoría.

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

    const result = await processRadarCategoriaUpload(
      supabase,
      "radar_margarina_actual_records",
      SAP_RADAR_MAVESA_MATERIAL_PRODUCT_MAP,
      PRODUCT_IDS.MARGARINA,
      rows,
      batchId
    );
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result);
  } catch (error) {
    console.error("[POST /api/radar-margarina-actual-upload]", error);
    return Response.json({ error: "Error interno del servidor", detail: errorDetail(error) }, { status: 500 });
  }
}
