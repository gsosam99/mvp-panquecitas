import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Location } from "@/types";

// Clusters piloto evaluados por DIENN para el modelo de escalamiento
// (ver "Modificaciones en Indicadores app Panquecitas" §3). El universo de
// PDVs es dinámico: toda location cuyo centro_poblado caiga en uno de estos
// clusters, no un conteo fijo (el "439" del doc es solo el ejemplo de la
// foto del momento en que se escribió).
//
// La carga real (carteras de cliente SAP) trae "centro_poblado" en MAYÚSCULAS
// (ej. "CUMANÁ", "CABUDARE") — la comparación es case-insensitive a propósito
// para no depender de qué capitalización traiga cada carga.
export const CUMANA_CLUSTER = ["Cumaná", "Marigüitar", "Güirintal"] as const;
export const CABUDARE_CLUSTER = "Cabudare" as const;

export const PILOT_CLUSTERS = [...CUMANA_CLUSTER, CABUDARE_CLUSTER] as const;

const CUMANA_CLUSTER_UPPER = CUMANA_CLUSTER.map((c) => c.toUpperCase());
const CABUDARE_CLUSTER_UPPER = CABUDARE_CLUSTER.toUpperCase();

export function clusterGroup(centroPoblado: string | null): "cumana" | "cabudare" | null {
  if (!centroPoblado) return null;
  const upper = centroPoblado.trim().toUpperCase();
  if (CUMANA_CLUSTER_UPPER.includes(upper)) return "cumana";
  if (upper === CABUDARE_CLUSTER_UPPER) return "cabudare";
  return null;
}

/** Universo total seleccionado de PDVs (k): locations en los clusters piloto. */
export async function getUniverseLocations(): Promise<Location[]> {
  const supabase = createSupabaseServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("locations")
    .select(
      "id, name, type, sap_code, address, region, centro_poblado, municipio, tipo_cliente, lat, lng"
    );

  // Filtrado en JS (no en la query) porque centro_poblado puede venir en
  // distinta capitalización según la carga — ver clusterGroup().
  return ((data ?? []) as Location[]).filter((l) => clusterGroup(l.centro_poblado) !== null);
}

interface SellInFilter {
  from?: string;
  to?: string;
}

/** Suma de sell-in (kg) por PDV para un producto dado, en el rango dado. */
export async function getSellInTotalsByLocation(
  productId: string,
  filter?: SellInFilter
): Promise<Map<string, number>> {
  const supabase = createSupabaseServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("sap_sell_in_records")
    .select("location_id, quantity_kg")
    .eq("product_id", productId);

  if (filter?.from) query = query.gte("date_of_sale", filter.from);
  if (filter?.to) query = query.lte("date_of_sale", filter.to);

  const { data } = await query;

  const totals = new Map<string, number>();
  for (const row of (data ?? []) as { location_id: string; quantity_kg: number }[]) {
    totals.set(row.location_id, (totals.get(row.location_id) ?? 0) + row.quantity_kg);
  }
  return totals;
}
