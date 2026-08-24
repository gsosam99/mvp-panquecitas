import { fetchAllRowsChunked } from "@/lib/supabase/fetch-all";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import type { ParsedModeloRow } from "@/types";

// Carga del Modelo de Atención (Esquema): actualiza locations.esquema_atencion
// por código SAP. Dos fuentes posibles (parseadas en el cliente): el maestro
// SAP N7_V_SD56 (MHTML) o el maestro de indirectos de la distribuidora (xlsx).
// NO crea clientes nuevos — solo actualiza los que ya viven en la cartera; los
// códigos que no calzan se reportan como "sin cartera".

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorDetail(error: any): string {
  if (error && typeof error === "object") {
    const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
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

    const body = (await req.json()) as { rows: ParsedModeloRow[] };
    const rows = body?.rows;
    if (!rows?.length) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // Este upload ahora solo escribe el PLAN DE VISITA (dias_visita). El modelo
    // (Directo/Indirecto/Mixto) es autoritativo desde la Cartera de Clientes
    // (columna "Directo o Indirecto"), así que aquí NO se toca esquema_atencion.
    // Última asignación gana si un código se repite en el archivo.
    const diasByCode = new Map<string, string>();
    for (const r of rows) {
      const code = r.sap_code?.trim();
      if (code) diasByCode.set(code, (r.dias_visita ?? "").trim());
    }
    const codes = [...diasByCode.keys()];

    // Solo se tocan clientes existentes en la cartera.
    //
    // Por lotes: un `.in()` con más de 1000 códigos se corta sin avisar. Acá
    // el efecto es especialmente dañino — los clientes que no resuelven se
    // quedan sin `dias_visita`, y sin plan de visita nunca cuentan como
    // "programados", así que desaparecen del denominador de efectividad sin
    // que nada lo reporte.
    const existing = await fetchAllRowsChunked<{ id: string; sap_code: string }>(
      (lote) => supabase.from("locations").select("id, sap_code").in("sap_code", lote),
      codes
    );
    const existingCodes = new Set(existing.map((l) => l.sap_code));
    const sinCartera = codes.filter((c) => !existingCodes.has(c)).length;

    // Agrupar por plan de visita → un update por grupo.
    const combos = new Map<string, string[]>();
    for (const [code, dias] of diasByCode) {
      if (!existingCodes.has(code)) continue;
      if (!combos.has(dias)) combos.set(dias, []);
      combos.get(dias)!.push(code);
    }

    // Troceado: un update por (plan, lote de ≤100 códigos) para no exceder el
    // largo de la URL del filtro .in cuando hay cientos de clientes.
    const CHUNK = 100;
    let updated = 0;
    for (const [dias, groupCodes] of combos) {
      for (let i = 0; i < groupCodes.length; i += CHUNK) {
        const chunk = groupCodes.slice(i, i + CHUNK);
        if (chunk.length === 0) continue;
        const { data, error } = await supabase
          .from("locations")
          .update({ dias_visita: dias || null })
          .in("sap_code", chunk)
          .select("id");
        if (error) throw error;
        updated += (data ?? []).length;
      }
    }

    return Response.json({ updated, clientes_sin_cartera: sinCartera });
  } catch (error) {
    console.error("[POST /api/modelo-upload]", error);
    return Response.json({ error: "Error interno del servidor", detail: errorDetail(error) }, { status: 500 });
  }
}
