import { fetchAllRowsChunked } from "@/lib/supabase/fetch-all";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { resolveVariantFromSku } from "@/data/catalog";
import type { ParsedDispatchRow } from "@/types";

// Despachos SAP con fecha real, usados por el motor de Sell-Out (corte
// D-1) — ver decisión #2 en docs/decisiones-implementacion.md. Formato
// del reporte aún no confirmado: este endpoint y el parser
// (parseDispatchesExcel) son "best-effort".
export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = (await req.json()) as { rows: ParsedDispatchRow[] };
    const { rows } = body;
    if (!rows?.length) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const sapCodes = Array.from(new Set(rows.map((r) => r.sap_code)));
    // Por lotes: un `.in()` con más de 1000 códigos se corta sin avisar y los
    // clientes que no resuelven se ignoran en silencio, perdiendo sus filas.
    const locData = await fetchAllRowsChunked<{ id: string; sap_code: string }>(
      (lote) => supabase.from("locations").select("id, sap_code").in("sap_code", lote),
      sapCodes
    );

    const locationIdByCode = new Map(
      ((locData ?? []) as { id: string; sap_code: string }[]).map((l) => [l.sap_code, l.id])
    );

    const batchId = crypto.randomUUID();
    const unmatched = new Set<string>();
    const insertRows = rows.flatMap((r) => {
      const location_id = locationIdByCode.get(r.sap_code);
      if (!location_id) {
        unmatched.add(r.sap_code);
        return [];
      }
      return [
        {
          upload_batch_id: batchId,
          location_id,
          variant_id: resolveVariantFromSku(r.variant_sku),
          quantity: r.quantity,
          dispatch_date: r.dispatch_date,
        },
      ];
    });

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase.from("sap_dispatches").insert(insertRows);
      if (insertError) throw insertError;
    }

    return Response.json({ inserted: insertRows.length, unmatched_sap_codes: Array.from(unmatched) });
  } catch (error) {
    console.error("[POST /api/dispatches-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
