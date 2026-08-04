import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { LOCATION_COLUMNS } from "@/lib/location-columns";
import type { Location } from "@/types";

// Sectores de venta piloto evaluados por DIENN para el modelo de escalamiento
// (ver "Cambios en app Panquecitas - Versión Ale" — antes se clasificaba por
// centro poblado (Cumaná/Marigüitar/Güirintal vs Cabudare); ahora se clasifica
// por Oficina de Venta, para que Cumaná, Marigüitar y Güirintal (todos
// atendidos por la oficina "CUMANA") queden en un solo sector, y todo lo
// atendido por la oficina "BARQUISIMETO ESTE" quede en el otro. El universo
// de PDVs es dinámico: toda location cuya oficina_venta caiga en uno de estos
// sectores, no un conteo fijo.
//
// Las constantes puras (sin dependencia de Supabase) viven en src/lib/sectors.ts
// para poder importarse también desde Client Components.
export {
  CUMANA_SECTOR,
  BARQUISIMETO_ESTE_SECTOR,
  PILOT_SECTORS,
  SECTOR_LABELS,
  sectorGroup,
  type Sector,
} from "@/lib/sectors";

import { sectorGroup as _sectorGroup } from "@/lib/sectors";

/** Universo total seleccionado de PDVs (k): locations en los sectores piloto. */
export async function getUniverseLocations(): Promise<Location[]> {
  const supabase = createSupabaseServiceClient();

  const { data } = await supabase.from("locations").select(LOCATION_COLUMNS);

  // Filtrado en JS (no en la query) porque oficina_venta puede venir en
  // distinta capitalización según la carga — ver sectorGroup().
  return ((data ?? []) as Location[]).filter((l) => _sectorGroup(l.oficina_venta) !== null);
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

  let query = supabase.from("sap_sell_in_records").select("location_id, quantity_kg").eq("product_id", productId);

  if (filter?.from) query = query.gte("date_of_sale", filter.from);
  if (filter?.to) query = query.lte("date_of_sale", filter.to);

  const { data } = await query;

  const totals = new Map<string, number>();
  for (const row of (data ?? []) as { location_id: string; quantity_kg: number }[]) {
    totals.set(row.location_id, (totals.get(row.location_id) ?? 0) + row.quantity_kg);
  }
  return totals;
}
