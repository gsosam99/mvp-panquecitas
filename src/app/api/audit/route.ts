import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getFieldWorker } from "@/lib/session";

interface AnaquelLine {
  variant_id: string;
  quantity: number;
  unit_price_observed: number;
}
interface DepositoLine {
  variant_id: string;
  quantity: number;
  unit_price?: number;
}
interface AuditPayload {
  location_id: string;
  pop_present: boolean;
  product_present: boolean;
  product_location?: string[];
  product_location_other?: string;
  front_faces: number | null;
  deposit_access: boolean;
  anaquel: AnaquelLine[];
  deposito: DepositoLine[];
}

export async function POST(req: Request) {
  try {
    const worker = await getFieldWorker();
    if (!worker || worker.role !== "MERCADERISTA") {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json()) as AuditPayload;
    const {
      location_id,
      pop_present,
      product_present,
      product_location,
      product_location_other,
      front_faces,
      deposit_access,
      anaquel,
      deposito,
    } = body;

    if (
      !location_id ||
      typeof pop_present !== "boolean" ||
      typeof product_present !== "boolean" ||
      typeof deposit_access !== "boolean" ||
      (product_present && front_faces === undefined)
    ) {
      return Response.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();

    // 1. Crear la visita (nivel de visita: POP, caras frontales, acceso a depósito)
    const { data: visitData, error: visitError } = await supabase
      .from("mercaderista_visits")
      .insert({
        worker_first_name: worker.firstName,
        worker_last_name: worker.lastName,
        worker_cedula: worker.cedula,
        location_id,
        pop_present,
        product_present,
        product_location: product_present ? product_location ?? [] : null,
        product_location_other: product_present
          ? product_location_other ?? null
          : null,
        front_faces: product_present ? front_faces : null,
        deposit_access,
      })
      .select("id")
      .single();

    if (visitError || !visitData) throw visitError ?? new Error("No se creó la visita");
    const visitId = (visitData as { id: string }).id;

    // 2. Resolver units_per_bulk para el valor calculado del depósito
    const variantIds = Array.from(
      new Set([
        ...anaquel.map((a) => a.variant_id),
        ...deposito.map((d) => d.variant_id),
      ])
    );
    const upbMap = new Map<string, number>();
    if (variantIds.length > 0) {
      const { data: variantsData } = await supabase
        .from("variants")
        .select("id, units_per_bulk")
        .in("id", variantIds);
      for (const v of (variantsData ?? []) as {
        id: string;
        units_per_bulk: number;
      }[]) {
        upbMap.set(v.id, v.units_per_bulk);
      }
    }

    // 3. Construir filas de inventario
    const rows: {
      visit_id: string;
      location_id: string;
      variant_id: string;
      zone: "ANAQUEL" | "BODEGA";
      quantity: number;
      unit_price_observed: number | null;
      calculated_value: number | null;
    }[] = [];

    for (const a of anaquel) {
      rows.push({
        visit_id: visitId,
        location_id,
        variant_id: a.variant_id,
        zone: "ANAQUEL",
        quantity: a.quantity,
        unit_price_observed: a.unit_price_observed,
        calculated_value: null,
      });
    }

    if (deposit_access) {
      for (const d of deposito) {
        const upb = upbMap.get(d.variant_id) ?? 1;
        const calculated_value =
          d.unit_price && d.unit_price > 0 ? d.unit_price * upb * d.quantity : null;
        rows.push({
          visit_id: visitId,
          location_id,
          variant_id: d.variant_id,
          zone: "BODEGA",
          quantity: d.quantity,
          unit_price_observed: null,
          calculated_value,
        });
      }
    }

    if (rows.length > 0) {
      const { error: rowsError } = await supabase.from("inventory_audits").insert(rows);
      if (rowsError) throw rowsError;
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/audit]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
