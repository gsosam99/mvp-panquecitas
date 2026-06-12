import { createSupabaseServerClient } from "@/lib/supabase/server";

export class PriceCalculatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceCalculatorError";
  }
}

interface AnaquelAuditRow {
  unit_price_observed: number | null;
  variants: { units_per_bulk: number } | null;
}

/**
 * Busca el precio de anaquel más reciente del día para calcular el valor de bodega.
 * Lanza error si no existe auditoría de anaquel hoy para ese location+variant.
 */
export async function calcBodegaValue(
  locationId: string,
  variantId: string,
  quantityBulks: number
): Promise<number> {
  const supabase = await createSupabaseServerClient();

  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("inventory_audits")
    .select("unit_price_observed, variants(units_per_bulk)")
    .eq("location_id", locationId)
    .eq("variant_id", variantId)
    .eq("zone", "ANAQUEL")
    .gte("created_at", `${today}T00:00:00.000Z`)
    .lt("created_at", `${today}T23:59:59.999Z`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new PriceCalculatorError("Error al buscar auditoría de anaquel.");

  const anaquelAudit = data as AnaquelAuditRow | null;

  if (!anaquelAudit || anaquelAudit.unit_price_observed === null) {
    throw new PriceCalculatorError(
      "Debes auditar el Anaquel primero para poder registrar la Bodega. El precio de anaquel se usa para calcular el valor del inventario en bodega."
    );
  }

  if (!anaquelAudit.variants) {
    throw new PriceCalculatorError("Variante no encontrada.");
  }

  return anaquelAudit.unit_price_observed * anaquelAudit.variants.units_per_bulk * quantityBulks;
}
