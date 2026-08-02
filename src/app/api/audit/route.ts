import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getFieldWorker } from "@/lib/session";
import type { PopMaterialOption, PopMessageOption } from "@/types";

interface DepositoLine {
  variant_id: string;
  quantity: number;
  unit_price?: number;
}
interface AuditPayload {
  location_id: string;
  pop_present: boolean;
  pop_message: PopMessageOption | null;
  pop_price_tag: boolean | null;
  pop_materials: PopMaterialOption[] | null;
  pop_materials_other?: string;
  product_present: boolean;
  product_location?: string[];
  product_location_other?: string;
  price_400: number | null;
  price_400_na: boolean;
  price_800: number | null;
  price_800_na: boolean;
  total_units_anaquel: number | null;
  anaquel_400_units: number | null;
  anaquel_800_units: number | null;
  front_faces: number | null;
  harina_trigo_faces: number | null;
  deposit_access: boolean;
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
      pop_message,
      pop_price_tag,
      pop_materials,
      pop_materials_other,
      product_present,
      product_location,
      product_location_other,
      price_400,
      price_400_na,
      price_800,
      price_800_na,
      total_units_anaquel,
      anaquel_400_units,
      anaquel_800_units,
      front_faces,
      harina_trigo_faces,
      deposit_access,
      deposito,
    } = body;

    if (
      !location_id ||
      typeof pop_present !== "boolean" ||
      typeof product_present !== "boolean" ||
      typeof deposit_access !== "boolean" ||
      (product_present && (total_units_anaquel === undefined || front_faces === undefined))
    ) {
      return Response.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // Validaciones de negocio (defensa en profundidad — el wizard ya las
    // aplica del lado del cliente, ver AuditWizard.tsx).
    if (product_present) {
      if (!price_400_na && !price_800_na && price_400 !== null && price_800 !== null && price_400 > price_800) {
        return Response.json(
          { error: "El precio de 400g no puede ser mayor al de 800g. Revisa los datos ingresados." },
          { status: 400 }
        );
      }
      if (total_units_anaquel !== null && front_faces !== null && total_units_anaquel < front_faces) {
        return Response.json(
          { error: "El total de unidades en el anaquel no puede ser menor que las caras frontales." },
          { status: 400 }
        );
      }
      if (
        total_units_anaquel !== null &&
        anaquel_400_units !== null &&
        anaquel_800_units !== null &&
        anaquel_400_units + anaquel_800_units !== total_units_anaquel
      ) {
        return Response.json(
          { error: "El desglose 400g + 800g del anaquel debe sumar el total de unidades ingresado." },
          { status: 400 }
        );
      }
    }

    const supabase = createSupabaseServiceClient();

    // 1. Crear la visita — nivel de visita: POP (mensaje/preciador/materiales),
    // presencia/ubicación de producto, precio por presentación, conteo en
    // anaquel y acceso a depósito. El total en anaquel (pregunta del
    // documento original) se mantiene, y se agrega el desglose 400g/800g
    // (anaquel_400_units/anaquel_800_units) que necesita el motor de
    // Sell-Out y el Mix de Producto — ver migración 005 y decisión #1 de
    // "Arreglos app Panquecitas" en docs/decisiones-implementacion.md. El
    // depósito sigue sin pasar por aquí: se inserta abajo en
    // inventory_audits (zona BODEGA), que sí es por presentación.
    const { data: visitData, error: visitError } = await supabase
      .from("mercaderista_visits")
      .insert({
        worker_first_name: worker.firstName,
        worker_last_name: worker.lastName,
        worker_cedula: worker.cedula,
        location_id,
        pop_present,
        pop_message: pop_present ? pop_message : null,
        pop_price_tag: pop_present ? pop_price_tag : null,
        pop_materials: pop_present ? pop_materials ?? [] : null,
        pop_materials_other: pop_present ? pop_materials_other ?? null : null,
        product_present,
        product_location: product_present ? product_location ?? [] : null,
        product_location_other: product_present ? product_location_other ?? null : null,
        price_400: product_present ? price_400 : null,
        price_400_na: product_present ? price_400_na : false,
        price_800: product_present ? price_800 : null,
        price_800_na: product_present ? price_800_na : false,
        total_units_anaquel: product_present ? total_units_anaquel : null,
        anaquel_400_units: product_present ? anaquel_400_units : null,
        anaquel_800_units: product_present ? anaquel_800_units : null,
        front_faces: product_present ? front_faces : null,
        harina_trigo_faces: product_present ? harina_trigo_faces : null,
        deposit_access,
      })
      .select("id")
      .single();

    if (visitError || !visitData) throw visitError ?? new Error("No se creó la visita");
    const visitId = (visitData as { id: string }).id;

    // 2. Resolver units_per_bulk para el valor calculado del depósito
    const variantIds = Array.from(new Set(deposito.map((d) => d.variant_id)));
    const upbMap = new Map<string, number>();
    if (variantIds.length > 0) {
      const { data: variantsData } = await supabase
        .from("variants")
        .select("id, units_per_bulk")
        .in("id", variantIds);
      for (const v of (variantsData ?? []) as { id: string; units_per_bulk: number }[]) {
        upbMap.set(v.id, v.units_per_bulk);
      }
    }

    // 3. Filas de inventario — solo BODEGA (depósito), por presentación.
    const rows: {
      visit_id: string;
      location_id: string;
      variant_id: string;
      zone: "BODEGA";
      quantity: number;
      unit_price_observed: number | null;
      calculated_value: number | null;
    }[] = [];

    if (deposit_access) {
      for (const d of deposito) {
        const upb = upbMap.get(d.variant_id) ?? 1;
        const calculated_value = d.unit_price && d.unit_price > 0 ? d.unit_price * upb * d.quantity : null;
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
