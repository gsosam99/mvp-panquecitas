import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getFieldWorker } from "@/lib/session";
import { TICKETS_PER_ROLL } from "@/types";

// El cierre de jornada de la promotora solo captura dos cifras: los tickets
// que le devolvieron (regalos canjeados) y los que le sobraron del rollo.
// Los entregados se derivan aquí — TICKETS_PER_ROLL − sobrantes — para que
// la columna tickets_entregados, que alimenta la tasa de conversión del
// dashboard de DIENN, no dependa de un tercer conteo manual que podía
// contradecir a los otros dos.
interface PromotionPayload {
  location_id: string;
  report_date: string;
  tickets_recibidos: number;
  tickets_intactos: number;
}

export async function POST(req: Request) {
  try {
    const worker = await getFieldWorker();
    if (!worker || worker.role !== "PROMOTORA") {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json()) as PromotionPayload;
    const { location_id, report_date, tickets_recibidos, tickets_intactos } = body;

    if (!location_id || !report_date || tickets_recibidos === undefined || tickets_intactos === undefined) {
      return Response.json({ error: "Datos incompletos" }, { status: 400 });
    }

    if (!Number.isInteger(tickets_recibidos) || !Number.isInteger(tickets_intactos)) {
      return Response.json({ error: "Los tickets deben ser números enteros." }, { status: 400 });
    }

    if (tickets_recibidos < 0 || tickets_intactos < 0) {
      return Response.json({ error: "Los tickets no pueden ser negativos." }, { status: 400 });
    }

    if (tickets_intactos > TICKETS_PER_ROLL) {
      return Response.json(
        { error: `Los tickets sobrantes no pueden superar ${TICKETS_PER_ROLL}.` },
        { status: 400 }
      );
    }

    // Validaciones de negocio (defensa en profundidad — el formulario ya las
    // aplica del lado del cliente, ver PromotionTracker.tsx).
    if (tickets_recibidos > TICKETS_PER_ROLL) {
      return Response.json(
        { error: `Error de conversión: Los tickets recibidos por compra no pueden superar ${TICKETS_PER_ROLL}.` },
        { status: 400 }
      );
    }

    const tickets_entregados = TICKETS_PER_ROLL - tickets_intactos;

    if (tickets_recibidos > tickets_entregados) {
      return Response.json(
        { error: "Error de conversión: los tickets recibidos no pueden superar a los tickets entregados." },
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
      tickets_entregados,
      tickets_recibidos,
      tickets_intactos,
    });

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/promotions]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
