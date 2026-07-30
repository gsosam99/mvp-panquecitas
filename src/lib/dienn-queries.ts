import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PRODUCT_IDS } from "@/data/catalog";
import {
  CABUDARE_CLUSTER,
  CUMANA_CLUSTER,
  clusterGroup,
  getSellInTotalsByLocation,
  getUniverseLocations,
} from "@/lib/universe";
import type { Location, LocationType } from "@/types";

// ────────────────────────────────────────────────────────────────
// Perfil DIENN — Dashboard estratégico y modelo de escalamiento.
// Ver doc §3. Único perfil con acceso a cifras de Sell-in y al
// ratio Panquecitas/HMP.
// ────────────────────────────────────────────────────────────────

// ── 1. Penetración de mercado ─────────────────────────────────────

export interface PenetracionResult {
  compradores: number;
  universo: number;
  pct: number;
  cumana: { compradores: number; universo: number; pct: number };
  cabudare: { compradores: number; universo: number; pct: number };
}

export async function getPenetracionMercado(): Promise<PenetracionResult> {
  const universo = await getUniverseLocations();
  const panqTotals = await getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS);

  const compradores = universo.filter((l) => (panqTotals.get(l.id) ?? 0) > 0);

  const cumanaUniverso = universo.filter((l) => clusterGroup(l.centro_poblado) === "cumana");
  const cabudareUniverso = universo.filter((l) => clusterGroup(l.centro_poblado) === "cabudare");
  const cumanaCompradores = compradores.filter((l) => clusterGroup(l.centro_poblado) === "cumana");
  const cabudareCompradores = compradores.filter(
    (l) => clusterGroup(l.centro_poblado) === "cabudare"
  );

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100 * 10) / 10 : 0);

  return {
    compradores: compradores.length,
    universo: universo.length,
    pct: pct(compradores.length, universo.length),
    cumana: {
      compradores: cumanaCompradores.length,
      universo: cumanaUniverso.length,
      pct: pct(cumanaCompradores.length, cumanaUniverso.length),
    },
    cabudare: {
      compradores: cabudareCompradores.length,
      universo: cabudareUniverso.length,
      pct: pct(cabudareCompradores.length, cabudareUniverso.length),
    },
  };
}

// ── 2. Pedido promedio por segmento ───────────────────────────────
// Nota: el reporte SAP actual no distingue formato (400g/800g) a nivel
// de fila, solo kg totales por cliente/mes — se expresa en KG (no se
// inventa una conversión a bultos sin esa granularidad).

export interface PedidoPromedioSegmento {
  segment: LocationType;
  avgKg: number;
  orders: number;
}

export async function getPedidoPromedioPorSegmento(): Promise<PedidoPromedioSegmento[]> {
  const supabase = createSupabaseServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("sap_sell_in_records")
    .select("location_id, quantity_kg")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0);

  const rows = (data ?? []) as { location_id: string; quantity_kg: number }[];
  if (rows.length === 0) return [];

  const locationIds = Array.from(new Set(rows.map((r) => r.location_id)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: locData } = await (supabase as any)
    .from("locations")
    .select("id, type")
    .in("id", locationIds);

  const typeById = new Map(
    ((locData ?? []) as { id: string; type: LocationType }[]).map((l) => [l.id, l.type])
  );

  const bySegment = new Map<LocationType, { sum: number; count: number }>();
  for (const row of rows) {
    const type = typeById.get(row.location_id);
    if (!type) continue;
    if (!bySegment.has(type)) bySegment.set(type, { sum: 0, count: 0 });
    const entry = bySegment.get(type)!;
    entry.sum += row.quantity_kg;
    entry.count += 1;
  }

  return Array.from(bySegment.entries()).map(([segment, { sum, count }]) => ({
    segment,
    avgKg: Math.round((sum / count) * 10) / 10,
    orders: count,
  }));
}

// ── 3. Tiempo promedio de recompra ────────────────────────────────

export async function getTiempoPromedioRecompra(): Promise<number> {
  const supabase = createSupabaseServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("sap_sell_in_records")
    .select("location_id, date_of_sale")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0)
    .order("date_of_sale");

  const rows = (data ?? []) as { location_id: string; date_of_sale: string }[];

  const datesByLocation = new Map<string, string[]>();
  for (const row of rows) {
    if (!datesByLocation.has(row.location_id)) datesByLocation.set(row.location_id, []);
    const arr = datesByLocation.get(row.location_id)!;
    if (arr[arr.length - 1] !== row.date_of_sale) arr.push(row.date_of_sale);
  }

  const avgGaps: number[] = [];
  for (const dates of datesByLocation.values()) {
    if (dates.length < 2) continue;
    const first = new Date(dates[0]).getTime();
    const last = new Date(dates[dates.length - 1]).getTime();
    const days = (last - first) / (1000 * 60 * 60 * 24);
    avgGaps.push(days / (dates.length - 1));
  }

  if (avgGaps.length === 0) return 0;
  return Math.round(avgGaps.reduce((a, b) => a + b, 0) / avgGaps.length);
}

// ── 4. Volumen vendido (Sell-In) por cluster ──────────────────────
// Nota: mismo límite de granularidad que §2 — se agrupa por producto
// y cluster/ciudad, no por formato 400g/800g.

export interface VolumenClusterPoint {
  cluster: string;
  pan_kg: number;
  panquecitas_kg: number;
}

export async function getVolumenVendidoPorCluster(): Promise<VolumenClusterPoint[]> {
  const supabase = createSupabaseServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("sap_sell_in_records")
    .select("quantity_kg, product_id, locations(centro_poblado)")
    .in("product_id", [PRODUCT_IDS.HARINA_PAN, PRODUCT_IDS.PANQUECITAS]);

  const rows = (data ?? []) as {
    quantity_kg: number;
    product_id: string;
    locations: { centro_poblado: string | null } | null;
  }[];

  const byCluster = new Map<string, { pan_kg: number; panquecitas_kg: number }>();
  for (const row of rows) {
    const cluster = row.locations?.centro_poblado ?? "Sin cluster";
    if (!byCluster.has(cluster)) byCluster.set(cluster, { pan_kg: 0, panquecitas_kg: 0 });
    const entry = byCluster.get(cluster)!;
    if (row.product_id === PRODUCT_IDS.HARINA_PAN) entry.pan_kg += row.quantity_kg;
    else if (row.product_id === PRODUCT_IDS.PANQUECITAS) entry.panquecitas_kg += row.quantity_kg;
  }

  return Array.from(byCluster.entries())
    .map(([cluster, { pan_kg, panquecitas_kg }]) => ({
      cluster,
      pan_kg: Math.round(pan_kg * 10) / 10,
      panquecitas_kg: Math.round(panquecitas_kg * 10) / 10,
    }))
    .sort((a, b) => b.panquecitas_kg - a.panquecitas_kg);
}

// ── 5. Tasa de conversión en degustaciones ────────────────────────

export interface ConversionDegustaciones {
  samples: number;
  conversions: number;
  rate: number;
}

export async function getConversionDegustaciones(): Promise<ConversionDegustaciones> {
  const supabase = createSupabaseServiceClient();

  const { data } = await supabase
    .from("promotion_activities")
    .select("samples_given, conversions_tracked");

  const rows = (data ?? []) as { samples_given: number; conversions_tracked: number }[];
  const samples = rows.reduce((sum, r) => sum + r.samples_given, 0);
  const conversions = rows.reduce((sum, r) => sum + r.conversions_tracked, 0);

  return {
    samples,
    conversions,
    rate: samples > 0 ? Math.round((conversions / samples) * 100 * 10) / 10 : 0,
  };
}

// ── 6. Modelo de escalamiento (Panquecitas vs HMP) ────────────────

export interface EscalamientoPdvDetail {
  location: Location;
  panquecitasKg: number;
  hmpKg: number;
  shareMvp: number; // 0..1
}

export interface ModeloEscalamiento {
  volumenCapturadoKg: number;
  volumenOportunidadKg: number;
  hmpUniverseKg: number;
  panquecitasUniverseKg: number;
  pctOportunidadHmp: number;
  pctPenetracionReal: number;
  pctEficienciaPdvs: number;
  compradores: number;
  totalUniverso: number;
  detail: EscalamientoPdvDetail[];
}

export async function getModeloEscalamiento(): Promise<ModeloEscalamiento> {
  const universo = await getUniverseLocations();
  const panqTotals = await getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS);
  const hmpTotals = await getSellInTotalsByLocation(PRODUCT_IDS.HARINA_PAN);

  const detail: EscalamientoPdvDetail[] = universo.map((location) => {
    const panquecitasKg = panqTotals.get(location.id) ?? 0;
    const hmpKg = hmpTotals.get(location.id) ?? 0;
    return {
      location,
      panquecitasKg,
      hmpKg,
      shareMvp: hmpKg > 0 ? panquecitasKg / hmpKg : 0,
    };
  });

  const compradores = detail.filter((d) => d.panquecitasKg > 0);
  const noCompradores = detail.filter((d) => d.panquecitasKg === 0);

  const volumenCapturadoKg = compradores.reduce((sum, d) => sum + d.panquecitasKg, 0);
  const volumenOportunidadKg = noCompradores.reduce((sum, d) => sum + d.hmpKg, 0);
  const hmpUniverseKg = detail.reduce((sum, d) => sum + d.hmpKg, 0);
  const panquecitasUniverseKg = detail.reduce((sum, d) => sum + d.panquecitasKg, 0);

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100 * 10) / 10 : 0);

  return {
    volumenCapturadoKg: Math.round(volumenCapturadoKg * 10) / 10,
    volumenOportunidadKg: Math.round(volumenOportunidadKg * 10) / 10,
    hmpUniverseKg: Math.round(hmpUniverseKg * 10) / 10,
    panquecitasUniverseKg: Math.round(panquecitasUniverseKg * 10) / 10,
    pctOportunidadHmp: pct(volumenOportunidadKg, hmpUniverseKg),
    pctPenetracionReal: pct(volumenCapturadoKg, hmpUniverseKg),
    pctEficienciaPdvs: pct(compradores.length, detail.length),
    compradores: compradores.length,
    totalUniverso: detail.length,
    detail: detail.sort((a, b) => b.hmpKg - a.hmpKg),
  };
}

export { CUMANA_CLUSTER, CABUDARE_CLUSTER };
