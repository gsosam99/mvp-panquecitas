import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import type { ParsedPendingOrderRow } from "@/types";

// Ver decisión #13 en docs/decisiones-implementacion.md: formato del
// reporte SAP de pedidos pendientes aún no confirmado — este endpoint y
// el parser (parsePendingOrdersExcel) son "best-effort" y se deben
// ajustar cuando llegue un archivo real.
export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = (await req.json()) as { rows: ParsedPendingOrderRow[] };
    const { rows } = body;
    if (!rows?.length) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const sapCodes = Array.from(new Set(rows.map((r) => r.sap_code)));
    const { data: locData, error: locError } = await supabase
      .from("locations")
      .select("id, sap_code")
      .in("sap_code", sapCodes);
    if (locError) throw locError;

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
          quantity: r.quantity,
          order_date: r.order_date,
          notes: r.notes ?? null,
        },
      ];
    });

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase.from("sap_pending_orders").insert(insertRows);
      if (insertError) throw insertError;
    }

    return Response.json({
      inserted: insertRows.length,
      unmatched_sap_codes: Array.from(unmatched),
    });
  } catch (error) {
    console.error("[POST /api/pending-orders-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
