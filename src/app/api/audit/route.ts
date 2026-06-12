import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calcBodegaValue, PriceCalculatorError } from "@/lib/price-calculator";
import type { AuditZone } from "@/types";

interface AuditPayload {
  location_id: string;
  variant_id: string;
  zone: AuditZone;
  quantity: number;
  unit_price_observed?: number;
  unit_price?: number; // BODEGA: pass directly to skip DB lookup
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json() as AuditPayload;
    const { location_id, variant_id, zone, quantity, unit_price_observed, unit_price } = body;

    if (!location_id || !variant_id || !zone || quantity === undefined) {
      return Response.json({ error: "Datos incompletos" }, { status: 400 });
    }

    let calculated_value: number | null = null;

    if (zone === "BODEGA") {
      const { data: variantData } = await supabase
        .from("variants")
        .select("units_per_bulk")
        .eq("id", variant_id)
        .single();

      const variant = variantData as { units_per_bulk: number } | null;
      if (!variant) return Response.json({ error: "Variante no encontrada" }, { status: 404 });

      if (unit_price !== undefined && unit_price > 0) {
        // Price passed directly from frontend (same-session ANAQUEL data)
        calculated_value = unit_price * variant.units_per_bulk * quantity;
      } else {
        try {
          calculated_value = await calcBodegaValue(location_id, variant_id, quantity);
        } catch (err) {
          if (err instanceof PriceCalculatorError) {
            return Response.json({ error: err.message }, { status: 422 });
          }
          throw err;
        }
      }
    }

    if (zone === "ANAQUEL" && !unit_price_observed) {
      return Response.json({ error: "El precio de venta es obligatorio para el anaquel." }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("inventory_audits")
      .insert({
        user_id: user.id,
        location_id,
        variant_id,
        zone,
        quantity,
        unit_price_observed: zone === "ANAQUEL" ? unit_price_observed : null,
        calculated_value,
      });

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/audit]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
