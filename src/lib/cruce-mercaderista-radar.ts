import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRowsChunked } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS } from "@/data/catalog";
import { getUniverseLocations, vigentesAl, sectorGroup, type Sector } from "@/lib/universe";
import { todayISO } from "@/lib/date-buckets";
import { presentacionFromVariant } from "@/lib/sellout-utils";

// ── Cruce: lo que reporta el mercaderista vs lo que dice el Radar ────
// (pedido de DIENN, 14-09-2026)
//
// Responde: ¿en qué PDV hay producto que no se está vendiendo? Por cada PDV
// de la cartera vigente con visita de mercaderista se ponen lado a lado:
//
//   - INVENTARIO REPORTADO: lo que contó el mercaderista en su ÚLTIMA visita
//     (anaquel 400 g + 800 g, más depósito si tuvo acceso), en kg.
//   - VENDIDO SEGÚN RADAR: el acumulado de Panquecitas del PDV en la Carga
//     Radar, en kg.
//
// y la PROPORCIÓN = inventario ÷ Radar × 100: qué parte de lo que le llegó
// al PDV sigue en la tienda. Una proporción alta es producto estancado — el
// PDV que más apoyo necesita (exhibición, POP, degustación). Mismo inventario
// y mismo Radar que "Sell-Out por cliente" (getSellOutPorClienteDiff), así
// que los dos cuadros cuadran entre sí; ese lista la diferencia, este la
// ordena por proporción.
//
// Los PDV visitados con inventario 0 no entran: sin producto no hay nada
// estancado — esos son stock out y ya tienen su propia lista. Se cuentan
// aparte para que no desaparezcan en silencio.

/** Desde esta proporción el producto se considera estancado. */
export const CRUCE_UMBRAL_ALTO_PCT = 50;
/** Entre este umbral y el alto, rotación lenta. Debajo, rotando. */
export const CRUCE_UMBRAL_MEDIO_PCT = 20;

/**
 * - SIN_VENTA_RADAR: el mercaderista ve producto pero el Radar no registra
 *   venta al PDV (le llegó por otra vía o el código no cruza).
 * - ALTO / MEDIO / ROTANDO: según la proporción inventario ÷ Radar.
 */
export type NivelApoyo = "SIN_VENTA_RADAR" | "ALTO" | "MEDIO" | "ROTANDO";

export interface CruceInventarioRadarRow {
  locationId: string;
  name: string;
  sapCode: string;
  sector: Sector | null;
  zona: string | null;
  asesor: string | null;
  segmento: string | null;
  esquema: string | null;
  /** Fecha de la última visita ("YYYY-MM-DD"). */
  fechaVisita: string;
  mercaderista: string;
  unidades400: number;
  unidades800: number;
  anaquelKg: number;
  depositoKg: number;
  /** false = el mercaderista no tuvo acceso al depósito; el inventario es solo anaquel. */
  depositoIncluido: boolean;
  inventarioKg: number;
  radarKg: number;
  /** inventario ÷ Radar × 100. null si el Radar no registra venta. */
  proporcionPct: number | null;
  nivel: NivelApoyo;
}

export interface CruceInventarioRadarResult {
  filas: CruceInventarioRadarRow[];
  /** PDV de la cartera vigente con al menos una visita. */
  visitados: number;
  /** De esos, los que en su última visita no tenían producto (fuera del cruce). */
  visitadosSinInventario: number;
  umbralAltoPct: number;
  umbralMedioPct: number;
}

interface VisitaCruce {
  id: string;
  location_id: string;
  created_at: string;
  worker_first_name: string | null;
  worker_last_name: string | null;
  anaquel_400_units: number | null;
  anaquel_800_units: number | null;
  deposit_access: boolean;
}

function nivelDe(proporcionPct: number | null): NivelApoyo {
  if (proporcionPct === null) return "SIN_VENTA_RADAR";
  if (proporcionPct >= CRUCE_UMBRAL_ALTO_PCT) return "ALTO";
  if (proporcionPct >= CRUCE_UMBRAL_MEDIO_PCT) return "MEDIO";
  return "ROTANDO";
}

export async function getCruceInventarioRadar(): Promise<CruceInventarioRadarResult> {
  const vacio: CruceInventarioRadarResult = {
    filas: [],
    visitados: 0,
    visitadosSinInventario: 0,
    umbralAltoPct: CRUCE_UMBRAL_ALTO_PCT,
    umbralMedioPct: CRUCE_UMBRAL_MEDIO_PCT,
  };

  // Cartera vigente hoy, igual que Sell-Out por cliente.
  const universo = vigentesAl(await getUniverseLocations(), todayISO());
  if (universo.length === 0) return vacio;
  const locationIds = universo.map((l) => l.id);

  const supabase = createSupabaseServiceClient();
  const [visitas, radar] = await Promise.all([
    fetchAllRowsChunked<VisitaCruce>(
      (lote) =>
        supabase
          .from("mercaderista_visits")
          .select(
            "id, location_id, created_at, worker_first_name, worker_last_name, anaquel_400_units, anaquel_800_units, deposit_access"
          )
          .in("location_id", lote),
      locationIds
    ),
    fetchAllRowsChunked<{ location_id: string; quantity_kg: number }>(
      (lote) =>
        supabase
          .from("sap_sell_in_records")
          .select("location_id, quantity_kg")
          .eq("product_id", PRODUCT_IDS.PANQUECITAS)
          .in("location_id", lote),
      locationIds
    ),
  ]);

  // Última visita por PDV, comparando la fecha y no el orden de llegada: la
  // lista viene partida en lotes y paginada por id.
  const ultimaVisita = new Map<string, VisitaCruce>();
  for (const v of visitas) {
    const actual = ultimaVisita.get(v.location_id);
    if (!actual || v.created_at > actual.created_at) ultimaVisita.set(v.location_id, v);
  }
  if (ultimaVisita.size === 0) return vacio;

  const radarKgPorLoc = new Map<string, number>();
  for (const r of radar) {
    radarKgPorLoc.set(r.location_id, (radarKgPorLoc.get(r.location_id) ?? 0) + Number(r.quantity_kg));
  }

  // Depósito (BODEGA) de esas visitas, en kg — solo presentaciones de Panquecitas.
  const visitIds = Array.from(ultimaVisita.values()).map((v) => v.id);
  const depositoKgPorVisita = new Map<string, number>();
  const { data: variantsData } = await supabase.from("variants").select("id, presentation_kg, units_per_bulk");
  const kgPorUnidad = new Map<string, number>(
    ((variantsData ?? []) as { id: string; presentation_kg: number; units_per_bulk: number }[]).map((v) => [
      v.id,
      v.presentation_kg * v.units_per_bulk,
    ])
  );
  const audits = await fetchAllRowsChunked<{ visit_id: string; variant_id: string; quantity: number }>(
    (lote) =>
      supabase.from("inventory_audits").select("visit_id, variant_id, quantity").eq("zone", "BODEGA").in("visit_id", lote),
    visitIds
  );
  for (const a of audits) {
    if (!presentacionFromVariant(a.variant_id)) continue;
    const kg = a.quantity * (kgPorUnidad.get(a.variant_id) ?? 0);
    depositoKgPorVisita.set(a.visit_id, (depositoKgPorVisita.get(a.visit_id) ?? 0) + kg);
  }

  const r1 = (v: number) => Math.round(v * 10) / 10;
  const filas: CruceInventarioRadarRow[] = [];
  let visitadosSinInventario = 0;

  for (const l of universo) {
    const v = ultimaVisita.get(l.id);
    if (!v) continue;

    const unidades400 = v.anaquel_400_units ?? 0;
    const unidades800 = v.anaquel_800_units ?? 0;
    const anaquelKg = unidades400 * 0.4 + unidades800 * 0.8;
    const depositoKg = v.deposit_access ? depositoKgPorVisita.get(v.id) ?? 0 : 0;
    const inventarioKg = anaquelKg + depositoKg;
    if (inventarioKg <= 0) {
      visitadosSinInventario += 1;
      continue;
    }

    const radarKg = radarKgPorLoc.get(l.id) ?? 0;
    const proporcionPct = radarKg > 0 ? r1((inventarioKg / radarKg) * 100) : null;

    filas.push({
      locationId: l.id,
      name: l.name,
      sapCode: l.sap_code,
      sector: sectorGroup(l.oficina_venta),
      zona: l.region,
      asesor: l.asesor_encargado,
      segmento: l.segmento_cliente?.trim() || null,
      esquema: l.esquema_atencion,
      fechaVisita: v.created_at.slice(0, 10),
      mercaderista: `${v.worker_first_name ?? ""} ${v.worker_last_name ?? ""}`.trim(),
      unidades400,
      unidades800,
      anaquelKg: r1(anaquelKg),
      depositoKg: r1(depositoKg),
      depositoIncluido: !!v.deposit_access,
      inventarioKg: r1(inventarioKg),
      radarKg: r1(radarKg),
      proporcionPct,
      nivel: nivelDe(proporcionPct),
    });
  }

  filas.sort((a, b) => b.inventarioKg - a.inventarioKg);

  return {
    filas,
    visitados: ultimaVisita.size,
    visitadosSinInventario,
    umbralAltoPct: CRUCE_UMBRAL_ALTO_PCT,
    umbralMedioPct: CRUCE_UMBRAL_MEDIO_PCT,
  };
}
