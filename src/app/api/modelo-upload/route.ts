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
    const esquemaByCode = new Map<string, string>();
    for (const r of rows) {
      const code = r.sap_code?.trim();
      const esquema = r.esquema_atencion?.trim();
      if (code && esquema) esquemaByCode.set(code, esquema);
    }
    const codes = [...esquemaByCode.keys()];

    // Solo se tocan clientes existentes en la cartera.
    const { data: existing, error: fetchError } = await supabase
      .from("locations")
      .select("id, sap_code")
      .in("sap_code", codes);
    if (fetchError) throw fetchError;
    const existingCodes = new Set(((existing ?? []) as { sap_code: string }[]).map((l) => l.sap_code));
    const sinCartera = codes.filter((c) => !existingCodes.has(c)).length;

    // Agrupar por valor de esquema → una actualización por grupo (pocos
    // valores: Directo / Indirecto / Mixto / …).
    const codesByEsquema = new Map<string, string[]>();
    for (const [code, esquema] of esquemaByCode) {
      if (!existingCodes.has(code)) continue;
      if (!codesByEsquema.has(esquema)) codesByEsquema.set(esquema, []);
      codesByEsquema.get(esquema)!.push(code);
    }

    // Troceado: un update por (esquema, lote de ≤100 códigos) para no exceder
    // el largo de la URL del filtro .in cuando hay cientos de clientes.
    const CHUNK = 100;
    let updated = 0;
    for (const [esquema, groupCodes] of codesByEsquema) {
      for (let i = 0; i < groupCodes.length; i += CHUNK) {
        const chunk = groupCodes.slice(i, i + CHUNK);
        if (chunk.length === 0) continue;
        const { data, error } = await supabase
          .from("locations")
          .update({ esquema_atencion: esquema })
          .in("sap_code", chunk)
          .select("id");
        if (error) throw error;
        updated += (data ?? []).length;
      }
    }

    return Response.json({ updated, clientes_sin_cartera: sinCartera, esquemas: [...codesByEsquema.keys()] });
  } catch (error) {
    console.error("[POST /api/modelo-upload]", error);
    return Response.json({ error: "Error interno del servidor", detail: errorDetail(error) }, { status: 500 });
  }
}
