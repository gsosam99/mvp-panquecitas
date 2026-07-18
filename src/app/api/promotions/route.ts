import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getFieldWorker } from "@/lib/session";

interface PromotionPayload {
  location_id: string;
  report_date: string;
  samples_given: number;
  conversions_tracked: number;
}

export async function POST(req: Request) {
  try {
    const worker = await getFieldWorker();
    if (!worker || worker.role !== "PROMOTORA") {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json()) as PromotionPayload;
    const { location_id, report_date, samples_given, conversions_tracked } = body;

    if (
      !location_id ||
      !report_date ||
      samples_given === undefined ||
      conversions_tracked === undefined
    ) {
      return Response.json({ error: "Datos incompletos" }, { status: 400 });
    }

    if (conversions_tracked > samples_given) {
      return Response.json(
        { error: "Las compras confirmadas no pueden superar las muestras entregadas." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("promotion_activities").insert({
      worker_first_name: worker.firstName,
      worker_last_name: worker.lastName,
      worker_cedula: worker.cedula,
      location_id,
      report_date,
      samples_given,
      conversions_tracked,
    });

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/promotions]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
