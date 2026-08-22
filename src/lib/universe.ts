import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { LOCATION_COLUMNS, LOCATION_COLUMNS_COMPLETO } from "@/lib/location-columns";
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

// El universo tiene además dimensión de TIEMPO: cada cliente cuenta desde su
// fecha_incorporacion (migration 020). getUniverseLocations() devuelve la
// cartera completa de hoy; para cualquier cálculo por período hay que
// recortarla con vigentesAl(universo, cierreDelBucket) — si no, los clientes
// incorporados después entran a semanas en las que todavía no existían y
// hunden las tasas hacia atrás. Ver src/lib/cohortes.ts.
export {
  COHORTES,
  COHORTE_PILOTO_ORIGINAL,
  COHORTES_NUEVAS,
  PILOTO_INICIO,
  cohorteParaClienteNuevo,
  cohortePorNombre,
  estabaIncorporado,
  vigentesAl,
  type Cohorte,
} from "@/lib/cohortes";

/**
 * Universo total seleccionado de PDVs (k): locations en los sectores piloto.
 *
 * Es la cartera COMPLETA, sin recortar por fecha — el consumidor decide a qué
 * corte la acota con vigentesAl(). Para las tarjetas de "ahora mismo" el corte
 * es hoy, así que la lista completa ya es la correcta; para las series
 * temporales hay que recortar bucket por bucket.
 */
export async function getUniverseLocations(): Promise<Location[]> {
  const supabase = createSupabaseServiceClient();

  // segmento_cliente (migration 016) y fecha_incorporacion/cohorte (020) son
  // columnas nuevas. Si alguna todavía no se corrió, la query falla completa y
  // el dashboard se queda sin datos, así que se reintenta con la lista base en
  // vez de devolver vacío. Sin fecha_incorporacion todos quedan vigentes desde
  // siempre, o sea el comportamiento anterior al migration 020.
  //
  // El acumulador va como unknown[] a propósito: supabase-js deriva el tipo de
  // la fila del string del .select(), así que los dos intentos devuelven formas
  // distintas (una con segmento_cliente y otra sin) y no son asignables entre
  // sí. El cast a Location[] de abajo es el mismo que ya se hacía.
  //
  // Paginado obligatorio: `locations` superó las 1000 filas al ampliarse la
  // cartera (1112 en agosto 2026) y PostgREST corta ahí sin avisar. Sin
  // paginar, el dashboard calculaba sobre 1000 de 1112 clientes y el volumen
  // de los 112 restantes desaparecía de TODAS las métricas — el total de
  // Radar bajaba cada vez que la cartera crecía. Ver fetch-all.ts.
  let rows: unknown[] | null = null;

  try {
    rows = await fetchAllRows<unknown>(() => supabase.from("locations").select(LOCATION_COLUMNS_COMPLETO));
  } catch {
    rows = await fetchAllRows<unknown>(() => supabase.from("locations").select(LOCATION_COLUMNS));
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
