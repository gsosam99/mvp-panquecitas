import { createSupabaseServerClient } from "@/lib/supabase/server";

interface PromotionPayload {
  location_id: string;
  report_date: string;
  samples_given: number;
  conversions_tracked: number;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json() as PromotionPayload;
    const { location_id, report_date, samples_given, conversions_tracked } = body;

    if (!location_id || !report_date || samples_given === undefined || conversions_tracked === undefined) {
      return Response.json({ error: "Datos incompletos" }, { status: 400 });
    }

    if (conversions_tracked > samples_given) {
      return Response.json({
        error: "Las compras confirmadas no pueden superar las muestras entregadas."
      }, { status: 400 });
    }

    // Upsert: solo un reporte por (usuario, localidad, día)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("promotion_activities")
      .upsert(
        {
          user_id: user.id,
          location_id,
          report_date,
          samples_given,
          conversions_tracked,
        },
        { onConflict: "user_id,location_id,report_date" }
      );

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/promotions]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
