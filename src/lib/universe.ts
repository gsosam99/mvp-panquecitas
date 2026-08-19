import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { LOCATION_COLUMNS, LOCATION_COLUMNS_CON_SEGMENTO } from "@/lib/location-columns";
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
  isExcludedDistribuidor,
  type Sector,
} from "@/lib/sectors";

import { sectorGroup as _sectorGroup, isExcludedDistribuidor as _isExcludedDistribuidor } from "@/lib/sectors";

/** Universo total seleccionado de PDVs (k): locations en los sectores piloto. */
export async function getUniverseLocations(): Promise<Location[]> {
  const supabase = createSupabaseServiceClient();

  // segmento_cliente es columna nueva (migration 016). Si todavía no se corrió,
  // la query falla completa y el dashboard se queda sin datos, así que se
  // reintenta sin ella en vez de devolver vacío.
  //
  // El acumulador va como unknown[] a propósito: supabase-js deriva el tipo de
  // la fila del string del .select(), así que los dos intentos devuelven formas
  // distintas (una con segmento_cliente y otra sin) y no son asignables entre
  // sí. El cast a Location[] de abajo es el mismo que ya se hacía.
  let rows: unknown[] | null = null;

  const conSegmento = await supabase.from("locations").select(LOCATION_COLUMNS_CON_SEGMENTO);
  if (conSegmento.data) {
    rows = conSegmento.data;
  } else {
    const base = await supabase.from("locations").select(LOCATION_COLUMNS);
    rows = base.data;
  }

  // Filtrado en JS (no en la query) porque oficina_venta puede venir en
  // distinta capitalización según la carga — ver sectorGroup(). Además se
  // excluyen las distribuidoras intermediarias conocidas (ver
  // isExcludedDistribuidor) aunque su oficina_venta caiga en un sector piloto.
  return ((rows ?? []) as Location[]).filter(
    (l) => _sectorGroup(l.oficina_venta) !== null && !_isExcludedDistribuidor(l.sap_code)
  );
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

  // Paginado: PostgREST corta las respuestas (1000 filas por defecto en
  // Supabase) y sap_sell_in_records supera ese tope con pocos meses de carga
  // (una fila por cliente + presentación + mes). Sin paginar, los totales
  // salían incompletos en silencio — y como el recorte depende del orden que
  // devuelva la base, podía castigar sistemáticamente a unos clientes sobre
  // otros, hundiendo el total de una ciudad entera.
  const PAGINA = 1000;
  const totals = new Map<string, number>();

  for (let desde = 0; ; desde += PAGINA) {
    let query = supabase.from("sap_sell_in_records").select("location_id, quantity_kg").eq("product_id", productId);

    if (filter?.from) query = query.gte("date_of_sale", filter.from);
    if (filter?.to) query = query.lte("date_of_sale", filter.to);

    const { data } = await query.order("location_id", { ascending: true }).range(desde, desde + PAGINA - 1);
    const pagina = (data ?? []) as { location_id: string; quantity_kg: number }[];
    if (pagina.length === 0) break;

    for (const row of pagina) {
      totals.set(row.location_id, (totals.get(row.location_id) ?? 0) + row.quantity_kg);
    }
    if (pagina.length < PAGINA) break;
  }

  return totals;
}
