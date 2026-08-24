import { fetchAllRowsChunked } from "@/lib/supabase/fetch-all";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { resolveVariantFromSku } from "@/data/catalog";
import type { ParsedSellOutReportadoRow } from "@/types";

// Sell-Out reportado directo por Cadenas (Key Accounts) — se usa en vez de
// la fórmula calculada para los clientes marcados fuente_sell_out =
// 'Reportado_B2B' (columna en la cartera de clientes). Ver decisión #7 en
// docs/decisiones-implementacion.md.
export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = (await req.json()) as { rows: ParsedSellOutReportadoRow[] };
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
          fecha_inicio: r.fecha_inicio,
          fecha_fin: r.fecha_fin,
          volumen: r.volumen,
        },
      ];
    });

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase.from("sell_out_reportado").insert(insertRows);
      if (insertError) throw insertError;
    }

    return Response.json({ inserted: insertRows.length, unmatched_sap_codes: Array.from(unmatched) });
  } catch (error) {
    console.error("[POST /api/sell-out-reportado-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
