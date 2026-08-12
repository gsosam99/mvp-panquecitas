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

    // Última asignación gana si un código se repite en el archivo.
    const dataByCode = new Map<string, { esquema: string; dias: string }>();
    for (const r of rows) {
      const code = r.sap_code?.trim();
      const esquema = r.esquema_atencion?.trim();
      if (code && esquema) dataByCode.set(code, { esquema, dias: (r.dias_visita ?? "").trim() });
    }
    const codes = [...dataByCode.keys()];

    // Solo se tocan clientes existentes en la cartera.
    const { data: existing, error: fetchError } = await supabase
      .from("locations")
      .select("id, sap_code")
      .in("sap_code", codes);
    if (fetchError) throw fetchError;
    const existingCodes = new Set(((existing ?? []) as { sap_code: string }[]).map((l) => l.sap_code));
    const sinCartera = codes.filter((c) => !existingCodes.has(c)).length;

    // Agrupar por combo (esquema + plan de visita) → un update por combo.
    const combos = new Map<string, { esquema: string; dias: string; codes: string[] }>();
    for (const [code, d] of dataByCode) {
      if (!existingCodes.has(code)) continue;
      const key = `${d.esquema}||${d.dias}`;
      if (!combos.has(key)) combos.set(key, { esquema: d.esquema, dias: d.dias, codes: [] });
      combos.get(key)!.codes.push(code);
    }

    // Troceado: un update por (combo, lote de ≤100 códigos) para no exceder el
    // largo de la URL del filtro .in cuando hay cientos de clientes.
    const CHUNK = 100;
    let updated = 0;
    for (const combo of combos.values()) {
      for (let i = 0; i < combo.codes.length; i += CHUNK) {
        const chunk = combo.codes.slice(i, i + CHUNK);
        if (chunk.length === 0) continue;
        const { data, error } = await supabase
          .from("locations")
          .update({ esquema_atencion: combo.esquema, dias_visita: combo.dias || null })
          .in("sap_code", chunk)
          .select("id");
        if (error) throw error;
        updated += (data ?? []).length;
      }
    }

    const esquemas = [...new Set([...combos.values()].map((c) => c.esquema))];
    return Response.json({ updated, clientes_sin_cartera: sinCartera, esquemas });
  } catch (error) {
    console.error("[POST /api/modelo-upload]", error);
    return Response.json({ error: "Error interno del servidor", detail: errorDetail(error) }, { status: 500 });
  }
}
