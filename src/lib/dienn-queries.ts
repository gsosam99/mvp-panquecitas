import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PRODUCT_IDS, VARIANT_IDS } from "@/data/catalog";
import {
  PILOT_SECTORS,
  SECTOR_LABELS,
  sectorGroup,
  getSellInTotalsByLocation,
  getUniverseLocations,
  type Sector,
} from "@/lib/universe";
import {
  bucketKeyFor,
  bucketLabelFor,
  panBucketKeyFor,
  panBucketLabelFor,
  type PanComparisonGranularity,
  type TimeGranularity,
} from "@/lib/date-buckets";
import type { Location, LocationType } from "@/types";

export type { PanComparisonGranularity, TimeGranularity };

// ────────────────────────────────────────────────────────────────
// Perfil DIENN — Dashboard estratégico reconstruido desde 0 (ver
// "Cambios en app Panquecitas - Versión Ale (1)" y
// docs/decisiones-implementacion.md). Único perfil con acceso a
// cifras de Sell-in y al ratio Panquecitas/HMP.
// ────────────────────────────────────────────────────────────────

// ── Filtro reactivo de segmento (Tabs TOTAL / sector) ──────────────
// Todas las queries de abajo aceptan un `sector` opcional: sin filtro
// (TOTAL) o acotado a un sector (Barquisimeto Este / Cumaná). Ver
// "2. FILTROS REACTIVOS DE SEGMENTO" en el documento DIENN.

async function getUniverseLocationIds(sector?: Sector): Promise<Set<string>> {
  const universo = await getUniverseLocations();
  const filtered = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
  return new Set(filtered.map((l) => l.id));
}

/**
 * Igual que getUniverseLocationIds pero SIN excluir a las distribuidoras
 * intermediarias (ver isExcludedDistribuidor en sectors.ts). Las
 * distribuidoras no son clientes reales — no cuentan para mercaderistas,
 * promotoras ni el universo de penetración — pero sí facturan volumen real
 * que ayuda a llegar a los PDV vía Radar, así que las métricas de VOLUMEN
 * de Pedidos y Facturado (facturado, pedido, Mix de Producto, Facturado vs
 * Radar, Demanda Insatisfecha) sí deben sumar lo que ellas facturan. Ver
 * decisión con Alejandro (08-08-2026).
 */
async function getPedidosFacturadosLocationIds(sector?: Sector): Promise<Set<string>> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase.from("locations").select("id, oficina_venta");
  const filtered = ((data ?? []) as { id: string; oficina_venta: string | null }[]).filter((l) =>
    sector ? sectorGroup(l.oficina_venta) === sector : sectorGroup(l.oficina_venta) !== null
  );
  return new Set(filtered.map((l) => l.id));
}

// ── 1. Volumen facturado / 1b. Volumen pedido / 3. Mix de Producto ─────
// Las tres cifras (facturado, pedido total, y el desglose por presentación
// 400g/800g) se calculan de UNA sola pasada sobre sap_pedidos_facturados
// (reporte "Pedidos y Facturado"), para que la suma de las presentaciones
// del Mix de Producto coincida siempre, exactamente, con el total global.
//
// IMPORTANTE — separación de fuentes (ver migración 010 y decisión con
// Alejandro, 07-08-2026): "Pedidos y Facturado" y "Carga Radar" son dos
// procesos de venta distintos y sus cifras NO se mezclan ni se suman:
//   - sap_pedidos_facturados → Cantidad Pedido / Cantidad Facturada según
//     SAP (este bloque). Alimenta las tarjetas "Total ton pedidas" y
//     "Total Ton" (facturado) y el Mix de Producto.
//   - sap_sell_in_records → EXCLUSIVO de Carga Radar (getVolumenRadarAcumulado
//     más abajo), lo real despachado/confirmado en el anaquel.

interface VentasPorPresentacion {
  facturadaKgByVariant: Record<PresentacionMix, number>;
  facturadaKgTotal: number;
  /** Cantidad Pedido por presentación, cruda del reporte SAP (no es facturado + pendiente calculado). */
  pedidaKgByVariant: Record<PresentacionMix, number>;
  pedidaKgTotal: number;
}

async function getVentasPorPresentacion(sector?: Sector): Promise<VentasPorPresentacion> {
  const supabase = createSupabaseServiceClient();
  const ids = await getPedidosFacturadosLocationIds(sector);

  const { data } = await supabase
    .from("sap_pedidos_facturados")
    .select("cantidad_pedido_kg, cantidad_facturada_kg, location_id, variant_id")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .not("variant_id", "is", null);

  const facturadaKgByVariant: Record<PresentacionMix, number> = { "400g": 0, "800g": 0 };
  const pedidaKgByVariant: Record<PresentacionMix, number> = { "400g": 0, "800g": 0 };
  for (const r of (data ?? []) as {
    cantidad_pedido_kg: number;
    cantidad_facturada_kg: number;
    location_id: string;
    variant_id: string;
  }[]) {
    if (!ids.has(r.location_id)) continue;
    const presentacion = VARIANT_TO_PRESENTACION[r.variant_id];
    if (!presentacion) continue;
    facturadaKgByVariant[presentacion] += r.cantidad_facturada_kg;
    pedidaKgByVariant[presentacion] += r.cantidad_pedido_kg;
  }

  return {
    facturadaKgByVariant,
    facturadaKgTotal: facturadaKgByVariant["400g"] + facturadaKgByVariant["800g"],
    pedidaKgByVariant,
    pedidaKgTotal: pedidaKgByVariant["400g"] + pedidaKgByVariant["800g"],
  };
}

/** "Volumen facturado" — tarjeta alimentada exclusivamente por Pedidos y Facturado (Cantidad Facturada). */
export async function getTotalToneladas(sector?: Sector): Promise<number> {
  const { facturadaKgTotal } = await getVentasPorPresentacion(sector);
  return Math.round((facturadaKgTotal / 1000) * 100) / 100;
}

/** "Tarjeta de pedidos" — Cantidad Pedido cruda de Pedidos y Facturado, sin filtrar por variant_id. */
export async function getTotalToneladasPedidas(sector?: Sector): Promise<number> {
  const ids = await getPedidosFacturadosLocationIds(sector);
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_pedidos_facturados")
    .select("cantidad_pedido_kg, location_id")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS);

  let pedidaKgTotal = 0;
  for (const r of (data ?? []) as { cantidad_pedido_kg: number; location_id: string }[]) {
    if (ids.has(r.location_id)) pedidaKgTotal += r.cantidad_pedido_kg;
  }
  return Math.round((pedidaKgTotal / 1000) * 100) / 100;
}

// "Volumen de venta acumulada en radar" = lo despachado/facturado real que
// trae "Carga Radar" (sap_sell_in_records) — el número real de toneladas
// vendidas y despachadas a clientes de la cartera del piloto. Separado por
// producto porque cada uno alimenta la tarjeta de KPI correspondiente.
export interface VolumenRadarAcumulado {
  panquecitasTon: number;
  harinaPanTon: number;
}

export async function getVolumenRadarAcumulado(sector?: Sector): Promise<VolumenRadarAcumulado> {
  const ids = await getUniverseLocationIds(sector);
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("quantity_kg, location_id, product_id")
    .in("product_id", [PRODUCT_IDS.PANQUECITAS, PRODUCT_IDS.HARINA_PAN]);

  let panquecitasKg = 0;
  let harinaPanKg = 0;
  for (const r of (data ?? []) as { quantity_kg: number; location_id: string; product_id: string }[]) {
    if (!ids.has(r.location_id)) continue;
    if (r.product_id === PRODUCT_IDS.PANQUECITAS) panquecitasKg += r.quantity_kg;
    else if (r.product_id === PRODUCT_IDS.HARINA_PAN) harinaPanKg += r.quantity_kg;
  }
  return {
    panquecitasTon: Math.round((panquecitasKg / 1000) * 100) / 100,
    harinaPanTon: Math.round((harinaPanKg / 1000) * 100) / 100,
  };
}

// ── 2. Running de Ventas ──────────────────────────────────────────
// Kg_Semanal_Promedio = Total_Kg_Vendidos / Numero_Semanas_Evaluadas
// (fórmula dada en el documento). Días de inventario = inventario
// actual en depósito (última visita por PDV) / ritmo diario de venta.
// Proyección: a 3 meses del ritmo semanal actual (horizonte fijo — no
// especificado en el documento, ver docs/decisiones-implementacion.md).

export interface RunningVentasResult {
  kgPerWeek: number;
  diasInventario: number;
  proyeccionToneladas: number;
  proyeccionMeses: number;
}

async function getInventarioDepositoKg(sector?: Sector): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const ids = await getUniverseLocationIds(sector);

  // Última visita (con acceso a depósito) por PDV.
  const { data: visitsData } = await supabase
    .from("mercaderista_visits")
    .select("id, location_id, created_at, deposit_access")
    .order("created_at", { ascending: false });

  const lastVisitByLocation = new Map<string, string>();
  for (const v of (visitsData ?? []) as { id: string; location_id: string; deposit_access: boolean }[]) {
    if (!lastVisitByLocation.has(v.location_id) && v.deposit_access && ids.has(v.location_id)) {
      lastVisitByLocation.set(v.location_id, v.id);
    }
  }
  const visitIds = Array.from(lastVisitByLocation.values());
  if (visitIds.length === 0) return 0;

  const { data: auditsData } = await supabase
    .from("inventory_audits")
    .select("visit_id, variant_id, quantity, zone")
    .eq("zone", "BODEGA")
    .in("visit_id", visitIds);

  const { data: variantsData } = await supabase.from("variants").select("id, presentation_kg, units_per_bulk");
  const kgPerUnit = new Map(
    ((variantsData ?? []) as { id: string; presentation_kg: number; units_per_bulk: number }[]).map((v) => [
      v.id,
      v.presentation_kg * v.units_per_bulk,
    ])
  );

  let totalKg = 0;
  for (const a of (auditsData ?? []) as { variant_id: string; quantity: number }[]) {
    totalKg += a.quantity * (kgPerUnit.get(a.variant_id) ?? 0);
  }
  return totalKg;
}

const PROYECCION_MESES = 3;

export async function getRunningVentas(sector?: Sector): Promise<RunningVentasResult> {
  const supabase = createSupabaseServiceClient();
  const ids = await getUniverseLocationIds(sector);
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("quantity_kg, date_of_sale, location_id")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .order("date_of_sale");

  const rows = ((data ?? []) as { quantity_kg: number; date_of_sale: string; location_id: string }[]).filter((r) =>
    ids.has(r.location_id)
  );
  const totalKg = rows.reduce((s, r) => s + r.quantity_kg, 0);

  let numSemanas = 1;
  if (rows.length > 0) {
    const first = new Date(rows[0].date_of_sale).getTime();
    const last = new Date(rows[rows.length - 1].date_of_sale).getTime();
    numSemanas = Math.max(1, Math.round((last - first) / (7 * 86400000)));
  }

  const kgPerWeek = totalKg / numSemanas;
  const inventarioKg = await getInventarioDepositoKg(sector);
  const kgPerDay = kgPerWeek / 7;
  const diasInventario = kgPerDay > 0 ? Math.round(inventarioKg / kgPerDay) : 0;

  const proyeccionKg = kgPerWeek * 4.345 * PROYECCION_MESES;

  return {
    kgPerWeek: Math.round(kgPerWeek * 10) / 10,
    diasInventario,
    proyeccionToneladas: Math.round((proyeccionKg / 1000) * 100) / 100,
    proyeccionMeses: PROYECCION_MESES,
  };
}

// ── 3. Mix de Producto (cantidad facturada SAP por presentación) ───
// Toneladas facturadas 400g vs 800g desde sap_sell_in_records.variant_id
// (llenado al cargar el reporte N7_V_SD83_WEB_001 — ver migración 008 y
// SAP_MATERIAL_VARIANT_MAP). Ya no usa el motor de Sell-Out. La suma de
// las dos presentaciones coincide siempre con getTotalToneladas porque
// ambas salen de getVentasPorPresentacion (ver arriba).

export type PresentacionMix = "400g" | "800g";

export interface MixProductoTonPoint {
  variant: PresentacionMix;
  toneladas: number;
  /** % que representa el facturado de esta presentación sobre el total pedido combinado (400g+800g, facturado+pendiente). */
  pctSobrePedido: number;
}

const VARIANT_TO_PRESENTACION: Record<string, PresentacionMix> = {
  [VARIANT_IDS.PANQ_04KG_UNIDAD]: "400g",
  [VARIANT_IDS.PANQ_04KG_BULTO]: "400g",
  [VARIANT_IDS.PANQ_08KG_UNIDAD]: "800g",
  [VARIANT_IDS.PANQ_08KG_BULTO]: "800g",
};

export async function getMixProducto(sector?: Sector): Promise<MixProductoTonPoint[]> {
  const { facturadaKgByVariant, pedidaKgTotal } = await getVentasPorPresentacion(sector);

  return (["400g", "800g"] as PresentacionMix[]).map((variant) => ({
    variant,
    toneladas: Math.round((facturadaKgByVariant[variant] / 1000) * 100) / 100,
    pctSobrePedido:
      pedidaKgTotal > 0 ? Math.round((facturadaKgByVariant[variant] / pedidaKgTotal) * 1000) / 10 : 0,
  }));
}

// ── 3b. Facturado vs Radar Panquecitas (por presentación y tiempo) ─────
// Reemplaza el antiguo "Pedido vs Ventas" (decisión con Alejandro,
// 07-08-2026): lo que importa no es cuánto se pidió, sino cuánto de lo
// FACTURADO ya se confirma real en el anaquel según el Radar. Para cada
// día/semana y cada presentación (400g/800g):
//   Facturada = Σ sap_pedidos_facturados.cantidad_facturada_kg (Pedidos y Facturado)
//   Radar     = Σ sap_sell_in_records.quantity_kg (Carga Radar)
// El cliente elige Día/Semana y un período concreto; el eje X del gráfico
// son las dos presentaciones, con barras Facturado vs Radar.

export type FacturadoVsRadarGranularity = "day" | "week";

export interface FacturadoVsRadarBarPoint {
  presentacion: PresentacionMix;
  facturadaKg: number;
  radarKg: number;
}

export interface FacturadoVsRadarPeriod {
  bucket: string;
  label: string;
  bars: FacturadoVsRadarBarPoint[];
}

function buildFacturadoVsRadarPeriods(
  facturada: { location_id: string; date: string; variant_id: string; kg: number }[],
  radar: { location_id: string; date: string; variant_id: string; kg: number }[],
  facturadaIds: Set<string>,
  radarIds: Set<string>,
  granularity: FacturadoVsRadarGranularity
): FacturadoVsRadarPeriod[] {
  type Acc = { facturada: number; radar: number };
  const byBucket = new Map<string, Record<PresentacionMix, Acc>>();

  function ensure(bucket: string, presentacion: PresentacionMix): Acc {
    if (!byBucket.has(bucket)) {
      byBucket.set(bucket, {
        "400g": { facturada: 0, radar: 0 },
        "800g": { facturada: 0, radar: 0 },
      });
    }
    return byBucket.get(bucket)![presentacion];
  }

  for (const r of facturada) {
    if (!facturadaIds.has(r.location_id) || !r.date) continue;
    const presentacion = VARIANT_TO_PRESENTACION[r.variant_id];
    if (!presentacion) continue;
    ensure(bucketKeyFor(r.date, granularity), presentacion).facturada += r.kg;
  }

  for (const r of radar) {
    if (!radarIds.has(r.location_id) || !r.date) continue;
    const presentacion = VARIANT_TO_PRESENTACION[r.variant_id];
    if (!presentacion) continue;
    ensure(bucketKeyFor(r.date, granularity), presentacion).radar += r.kg;
  }

  return Array.from(byBucket.keys())
    .sort()
    .map((bucket) => {
      const cell = byBucket.get(bucket)!;
      return {
        bucket,
        label: bucketLabelFor(bucket, granularity),
        bars: (["400g", "800g"] as PresentacionMix[]).map((presentacion) => ({
          presentacion,
          facturadaKg: Math.round(cell[presentacion].facturada * 10) / 10,
          radarKg: Math.round(cell[presentacion].radar * 10) / 10,
        })),
      };
    });
}

export async function getFacturadoVsRadar(
  sector?: Sector
): Promise<Record<FacturadoVsRadarGranularity, FacturadoVsRadarPeriod[]>> {
  const empty = { day: [] as FacturadoVsRadarPeriod[], week: [] as FacturadoVsRadarPeriod[] };
  const [facturadaIds, radarIds] = await Promise.all([
    getPedidosFacturadosLocationIds(sector),
    getUniverseLocationIds(sector),
  ]);
  if (facturadaIds.size === 0 && radarIds.size === 0) return empty;

  const supabase = createSupabaseServiceClient();
  const [{ data: facturadoData }, { data: radarData }] = await Promise.all([
    supabase
      .from("sap_pedidos_facturados")
      .select("cantidad_facturada_kg, location_id, variant_id, fecha")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .not("variant_id", "is", null),
    supabase
      .from("sap_sell_in_records")
      .select("quantity_kg, location_id, variant_id, date_of_sale")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .not("variant_id", "is", null),
  ]);

  const facturada = ((facturadoData ?? []) as {
    cantidad_facturada_kg: number;
    location_id: string;
    variant_id: string;
    fecha: string;
  }[]).map((r) => ({
    location_id: r.location_id,
    date: r.fecha,
    variant_id: r.variant_id,
    kg: r.cantidad_facturada_kg,
  }));

  const radar = ((radarData ?? []) as {
    quantity_kg: number;
    location_id: string;
    variant_id: string;
    date_of_sale: string;
  }[]).map((r) => ({
    location_id: r.location_id,
    date: r.date_of_sale,
    variant_id: r.variant_id,
    kg: r.quantity_kg,
  }));

  if (facturada.length === 0 && radar.length === 0) return empty;

  return {
    day: buildFacturadoVsRadarPeriods(facturada, radar, facturadaIds, radarIds, "day"),
    week: buildFacturadoVsRadarPeriods(facturada, radar, facturadaIds, radarIds, "week"),
  };
}

// ── 3c. Panquecitas vs Harina PAN (por tiempo) ─────────────────────
// Compara lo despachado/confirmado por Carga Radar de Panquecitas vs
// Harina PAN — día/semana/mes/trimestre. Las DOS presentaciones vienen de
// la MISMA fuente (sap_sell_in_records / Radar) a propósito — no se puede
// comparar un producto con Pedidos y Facturado y el otro con Radar porque
// dejan de ser comparables (ver decisión con Alejandro, 08-08-2026). Dos
// poblaciones:
//   - "clientes": solo PDV que sí tienen Radar > 0 de Panquecitas.
//   - "universo": los 358 clientes del piloto (incluye 0 Panquecitas).

/** Población global fija del piloto — denominador de % Penetración en TOTAL. */
const UNIVERSAL_CLIENTES_PILOTO = 358;

export type PanComparisonPoblacion = "clientes" | "universo";

export interface PanVsHarinaPanPoint {
  bucket: string;
  label: string;
  panquecitasKg: number;
  harinaPanKg: number;
}

async function getPanVsHarinaPanUniverse(
  sector: Sector | undefined,
  poblacion: PanComparisonPoblacion
): Promise<Set<string>> {
  const universo = await getUniverseLocations();
  const universoFiltrado = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
  const ids = new Set(universoFiltrado.map((l) => l.id));
  if (poblacion === "universo" || ids.size === 0) return ids;

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("location_id")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0);

  const compradorIds = new Set((data ?? []).map((r: { location_id: string }) => r.location_id));
  return new Set([...ids].filter((id) => compradorIds.has(id)));
}

function computePanVsHarinaPanPoints(
  rows: { product_id: string; date: string; kg: number }[],
  granularity: PanComparisonGranularity
): PanVsHarinaPanPoint[] {
  const byBucket = new Map<string, { panquecitas: number; harinaPan: number }>();
  function ensure(bucket: string) {
    if (!byBucket.has(bucket)) byBucket.set(bucket, { panquecitas: 0, harinaPan: 0 });
    return byBucket.get(bucket)!;
  }
  for (const r of rows) {
    const acc = ensure(panBucketKeyFor(r.date, granularity));
    if (r.product_id === PRODUCT_IDS.PANQUECITAS) acc.panquecitas += r.kg;
    else if (r.product_id === PRODUCT_IDS.HARINA_PAN) acc.harinaPan += r.kg;
  }

  return Array.from(byBucket.keys())
    .sort()
    .map((bucket) => {
      const cell = byBucket.get(bucket)!;
      return {
        bucket,
        label: panBucketLabelFor(bucket, granularity),
        panquecitasKg: Math.round(cell.panquecitas * 10) / 10,
        harinaPanKg: Math.round(cell.harinaPan * 10) / 10,
      };
    });
}

export async function getPanVsHarinaPan(
  sector: Sector | undefined,
  poblacion: PanComparisonPoblacion
): Promise<Record<PanComparisonGranularity, PanVsHarinaPanPoint[]>> {
  const empty = { day: [], week: [], month: [], quarter: [] };
  const ids = await getPanVsHarinaPanUniverse(sector, poblacion);
  if (ids.size === 0) return empty;

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("location_id, product_id, quantity_kg, date_of_sale")
    .in("product_id", [PRODUCT_IDS.PANQUECITAS, PRODUCT_IDS.HARINA_PAN]);

  const rows = ((data ?? []) as { location_id: string; product_id: string; quantity_kg: number; date_of_sale: string }[])
    .filter((r) => ids.has(r.location_id))
    .map((r) => ({ product_id: r.product_id, date: r.date_of_sale, kg: r.quantity_kg }));

  if (rows.length === 0) return empty;

  return {
    day: computePanVsHarinaPanPoints(rows, "day"),
    week: computePanVsHarinaPanPoints(rows, "week"),
    month: computePanVsHarinaPanPoints(rows, "month"),
    quarter: computePanVsHarinaPanPoints(rows, "quarter"),
  };
}

// ── 4. Evolución de Penetración y Tasa de Recompra ─────────────────

export interface PenetracionRecompraPoint {
  bucket: string; // clave cronológica interna ("2026-08-04" | "2026-W32" | "2026-08")
  label: string; // lo que se muestra en el eje X
  penetracionPct: number;
  recompraPct: number;
}

function computePenetracionRecompraPoints(
  rows: { location_id: string; date_of_sale: string }[],
  universoSize: number,
  granularity: TimeGranularity
): PenetracionRecompraPoint[] {
  if (rows.length === 0 || universoSize === 0) return [];
  const buckets = Array.from(new Set(rows.map((r) => bucketKeyFor(r.date_of_sale, granularity)))).sort();

  const points: PenetracionRecompraPoint[] = [];
  for (const bucket of buckets) {
    const rowsUpToBucket = rows.filter((r) => bucketKeyFor(r.date_of_sale, granularity) <= bucket);

    const monthsByLocation = new Map<string, Set<string>>();
    for (const r of rowsUpToBucket) {
      if (!monthsByLocation.has(r.location_id)) monthsByLocation.set(r.location_id, new Set());
      monthsByLocation.get(r.location_id)!.add(r.date_of_sale.slice(0, 7));
    }

    const compradores = monthsByLocation.size;
    // Recompra = ≥2 meses distintos con Radar > 0. Ya NO se agrupa por
    // fecha exacta: sap_sell_in_records (Radar) guarda un acumulado por
    // cliente+material+MES que se REEMPLAZA en cada re-carga (ver
    // handleRadarUpload) — dos presentaciones (400g/800g) del mismo
    // cliente pueden quedar con "Día" distinto dentro del mismo mes solo
    // por haberse actualizado en cargas diferentes, lo que daba falsos
    // positivos de recompra al agrupar por fecha exacta. Por mes es lo
    // único que Radar puede medir de forma confiable. Ver bug reportado
    // por Alejandro (07-08-2026): recompra x segmento en 0% para todos.
    const conRecompra = Array.from(monthsByLocation.values()).filter((m) => m.size >= 2).length;

    points.push({
      bucket,
      label: bucketLabelFor(bucket, granularity),
      penetracionPct: Math.round((compradores / universoSize) * 1000) / 10,
      recompraPct: compradores > 0 ? Math.round((conRecompra / compradores) * 1000) / 10 : 0,
    });
  }

  return points;
}

/**
 * Un punto acumulado por cada día/semana/mes con datos — las tres calculadas
 * de una sola pasada por Supabase. Fuente: sap_sell_in_records (Carga
 * Radar) — un cliente cuenta como "compró" solo si el Radar lo confirma,
 * no basta con que tenga un pedido/factura en Pedidos y Facturado (ver
 * decisión con Alejandro, 06-08-2026: el radar es la única fuente
 * confiable del universo real de clientes).
 */
export async function getPenetracionRecompra(sector?: Sector): Promise<Record<TimeGranularity, PenetracionRecompraPoint[]>> {
  const empty = { day: [], week: [], month: [] };
  const universo = await getUniverseLocations();
  const universoFiltrado = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
  if (universoFiltrado.length === 0) return empty;
  const ids = new Set(universoFiltrado.map((l) => l.id));
  // % Penetración = clientes con Radar > 0 / universo global (358) en TOTAL;
  // con filtro de sector, el denominador es el universo de ese sector.
  const universoSize = sector ? universoFiltrado.length : UNIVERSAL_CLIENTES_PILOTO;

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("location_id, date_of_sale")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0)
    .order("date_of_sale");

  const rows = ((data ?? []) as { location_id: string; date_of_sale: string }[]).filter((r) => ids.has(r.location_id));
  if (rows.length === 0) return empty;

  return {
    day: computePenetracionRecompraPoints(rows, universoSize, "day"),
    week: computePenetracionRecompraPoints(rows, universoSize, "week"),
    month: computePenetracionRecompraPoints(rows, universoSize, "month"),
  };
}

// ── 5. Cobertura y Comunicación por sector (semanal) ───────────────
// Ver decisión #11: no hay datos reales de campañas de comunicación ni
// metas por ciudad, así que se usa un proxy con datos existentes.
// Cobertura = % acumulado de PDV visitados por mercaderista.
// Comunicación = % acumulado de PDV con material POP presente.
// "Ciudad" = sector (Barquisimeto Este / Cumaná); "meta" = universo del sector.

export interface CoberturaComunicacionPoint {
  bucket: string; // clave cronológica interna ("2026-08-04" | "2026-W32" | "2026-08")
  label: string; // lo que se muestra en el eje X
  [key: string]: string | number; // `${sector}_cobertura` / `${sector}_comunicacion`
}

function computeCoberturaComunicacionPoints(
  relevantRows: { location_id: string; created_at: string; pop_present: boolean }[],
  sectorByLocation: Map<string, Sector | null>,
  universoBySector: Map<Sector, number>,
  granularity: TimeGranularity
): CoberturaComunicacionPoint[] {
  if (relevantRows.length === 0) return [];
  const buckets = Array.from(new Set(relevantRows.map((r) => bucketKeyFor(r.created_at.slice(0, 10), granularity)))).sort();

  const points: CoberturaComunicacionPoint[] = [];
  for (const bucket of buckets) {
    const rowsUpToBucket = relevantRows.filter((r) => bucketKeyFor(r.created_at.slice(0, 10), granularity) <= bucket);

    const point: CoberturaComunicacionPoint = { bucket, label: bucketLabelFor(bucket, granularity) };
    for (const sector of ["cumana", "barquisimeto_este"] as Sector[]) {
      const sectorRows = rowsUpToBucket.filter((r) => sectorByLocation.get(r.location_id) === sector);
      const visitados = new Set(sectorRows.map((r) => r.location_id));
      const conPop = new Set(sectorRows.filter((r) => r.pop_present).map((r) => r.location_id));
      const universoSector = universoBySector.get(sector) ?? 0;

      point[`${sector}_cobertura`] = universoSector > 0 ? Math.round((visitados.size / universoSector) * 1000) / 10 : 0;
      point[`${sector}_comunicacion`] = universoSector > 0 ? Math.round((conPop.size / universoSector) * 1000) / 10 : 0;
    }
    points.push(point);
  }

  return points;
}

/** Un punto acumulado por cada día/semana/mes con datos — las tres calculadas de una sola pasada por Supabase. */
export async function getCoberturaComunicacionPorSector(): Promise<Record<TimeGranularity, CoberturaComunicacionPoint[]>> {
  const empty = { day: [], week: [], month: [] };
  const universo = await getUniverseLocations();
  if (universo.length === 0) return empty;

  const universoBySector = new Map<Sector, number>();
  for (const sector of ["cumana", "barquisimeto_este"] as Sector[]) {
    universoBySector.set(sector, universo.filter((l) => sectorGroup(l.oficina_venta) === sector).length);
  }
  const sectorByLocation = new Map(universo.map((l) => [l.id, sectorGroup(l.oficina_venta)]));

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("mercaderista_visits")
    .select("location_id, created_at, pop_present")
    .order("created_at");

  const rows = (data ?? []) as { location_id: string; created_at: string; pop_present: boolean }[];
  const relevantRows = rows.filter((r) => sectorByLocation.has(r.location_id));
  if (relevantRows.length === 0) return empty;

  return {
    day: computeCoberturaComunicacionPoints(relevantRows, sectorByLocation, universoBySector, "day"),
    week: computeCoberturaComunicacionPoints(relevantRows, sectorByLocation, universoBySector, "week"),
    month: computeCoberturaComunicacionPoints(relevantRows, sectorByLocation, universoBySector, "month"),
  };
}

// ── 6. Detalle de Clientes por Segmento ────────────────────────────
// Segmento = tipo_cliente (decisión #5). %HPM TOTAL / %HPM vs Base:
// ver decisión #12.

/** Cantidad Pedido (kg) por PDV, cruda de Pedidos y Facturado (no de Carga Radar). */
async function getCantidadPedidoTotalsByLocation(productId: string): Promise<Map<string, number>> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_pedidos_facturados")
    .select("location_id, cantidad_pedido_kg")
    .eq("product_id", productId);

  const totals = new Map<string, number>();
  for (const row of (data ?? []) as { location_id: string; cantidad_pedido_kg: number }[]) {
    totals.set(row.location_id, (totals.get(row.location_id) ?? 0) + row.cantidad_pedido_kg);
  }
  return totals;
}

export interface DetalleSegmentoRow {
  segmento: string;
  penetracionPct: number;
  recompraPct: number;
  hpmVsBasePct: number;
  hpmTotalPct: number;
}

export async function getDetalleClientesPorSegmento(sector?: Sector): Promise<DetalleSegmentoRow[]> {
  const universoTotal = await getUniverseLocations();
  const universo = sector ? universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector) : universoTotal;
  if (universo.length === 0) return [];

  // Penetración: clientes con Radar > 0 (Carga Radar — no Pedidos y
  // Facturado, ver getPenetracionRecompra). Volumen HPM vs Base: Cantidad
  // Pedido de Panquecitas, cruda de Pedidos y Facturado.
  const panqRadarTotals = await getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS);
  const panqPedidoTotals = await getCantidadPedidoTotalsByLocation(PRODUCT_IDS.PANQUECITAS);
  const hmpTotals = await getSellInTotalsByLocation(PRODUCT_IDS.HARINA_PAN);
  const denomPenetracion = sector ? universo.length : UNIVERSAL_CLIENTES_PILOTO;

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("location_id, date_of_sale")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0);

  const salesRows = (data ?? []) as { location_id: string; date_of_sale: string }[];
  // Recompra = ≥2 meses distintos con Radar > 0 (no fecha exacta — ver
  // misma nota en computePenetracionRecompraPoints más arriba: Radar
  // reemplaza el acumulado por cliente+material+mes, así que dos
  // presentaciones del mismo cliente pueden traer "Día" distinto dentro
  // del mismo mes sin ser una recompra real).
  const monthsByLocation = new Map<string, Set<string>>();
  for (const r of salesRows) {
    if (!monthsByLocation.has(r.location_id)) monthsByLocation.set(r.location_id, new Set());
    monthsByLocation.get(r.location_id)!.add(r.date_of_sale.slice(0, 7));
  }

  const universoTotalHmpKg = universo.reduce((s, l) => s + (hmpTotals.get(l.id) ?? 0), 0);

  const bySegmento = new Map<string, Location[]>();
  for (const l of universo) {
    const seg = l.tipo_cliente?.trim() || "Sin clasificar";
    if (!bySegmento.has(seg)) bySegmento.set(seg, []);
    bySegmento.get(seg)!.push(l);
  }

  const rows: DetalleSegmentoRow[] = [];
  for (const [segmento, locs] of bySegmento.entries()) {
    const facturados = locs.filter((l) => (panqRadarTotals.get(l.id) ?? 0) > 0);
    const conRecompra = facturados.filter((l) => (monthsByLocation.get(l.id)?.size ?? 0) >= 2);

    const segHmpKg = locs.reduce((s, l) => s + (hmpTotals.get(l.id) ?? 0), 0);
    const segPanqKg = locs.reduce((s, l) => s + (panqPedidoTotals.get(l.id) ?? 0), 0);

    rows.push({
      segmento,
      // % Penetración = clientes con Radar > 0 del segmento / universo (358 en TOTAL)
      penetracionPct:
        denomPenetracion > 0 ? Math.round((facturados.length / denomPenetracion) * 1000) / 10 : 0,
      // Tasa de Recompra = repetidores / clientes con ≥1 compra confirmada por Radar
      recompraPct: facturados.length > 0 ? Math.round((conRecompra.length / facturados.length) * 1000) / 10 : 0,
      hpmVsBasePct: segHmpKg > 0 ? Math.round((segPanqKg / segHmpKg) * 1000) / 10 : 0,
      hpmTotalPct: universoTotalHmpKg > 0 ? Math.round((segHmpKg / universoTotalHmpKg) * 1000) / 10 : 0,
    });
  }

  return rows.sort((a, b) => b.hpmTotalPct - a.hpmTotalPct);
}

// ── 7. Tasa de conversión en degustaciones (sistema de tickets) ───
// Ver migración 004: samples_given/conversions_tracked se renombraron a
// tickets_entregados/tickets_recibidos (sistema de tickets físicos).

export interface ConversionDegustaciones {
  samples: number;
  conversions: number;
  rate: number;
}

export async function getConversionDegustaciones(): Promise<ConversionDegustaciones> {
  const supabase = createSupabaseServiceClient();

  const { data } = await supabase.from("promotion_activities").select("tickets_entregados, tickets_recibidos");

  const rows = (data ?? []) as { tickets_entregados: number; tickets_recibidos: number }[];
  const samples = rows.reduce((sum, r) => sum + r.tickets_entregados, 0);
  const conversions = rows.reduce((sum, r) => sum + r.tickets_recibidos, 0);

  return {
    samples,
    conversions,
    rate: samples > 0 ? Math.round((conversions / samples) * 100 * 10) / 10 : 0,
  };
}

// ── 8. Demanda Insatisfecha ─────────────────────────────────────────
// Tres series acumuladas en el tiempo para Panquecitas: cuánto se ha
// pedido (Cantidad Pedido), cuánto se ha facturado (Cantidad Facturada) —
// ambas de Pedidos y Facturado — y cuánto confirma el Radar como
// realmente despachado al anaquel. El acumulado es corrido (no por
// período) para poder ver si el pedido siempre se mantiene por encima de
// lo facturado/Radar o si en algún punto se estabilizan — esa brecha es
// la demanda que todavía no se resuelve. Ver pedido de Alejandro (08-08-2026).

export interface DemandaInsatisfechaPoint {
  bucket: string;
  label: string;
  pedidoKg: number;
  facturadoKg: number;
  radarKg: number;
}

function computeDemandaInsatisfechaPoints(
  pedido: { date: string; kg: number }[],
  facturado: { date: string; kg: number }[],
  radar: { date: string; kg: number }[],
  granularity: TimeGranularity
): DemandaInsatisfechaPoint[] {
  const buckets = Array.from(
    new Set([...pedido, ...facturado, ...radar].map((r) => bucketKeyFor(r.date, granularity)))
  ).sort();

  const sumUpTo = (rows: { date: string; kg: number }[], bucket: string) =>
    rows
      .filter((r) => bucketKeyFor(r.date, granularity) <= bucket)
      .reduce((s, r) => s + r.kg, 0);

  return buckets.map((bucket) => ({
    bucket,
    label: bucketLabelFor(bucket, granularity),
    pedidoKg: Math.round(sumUpTo(pedido, bucket) * 10) / 10,
    facturadoKg: Math.round(sumUpTo(facturado, bucket) * 10) / 10,
    radarKg: Math.round(sumUpTo(radar, bucket) * 10) / 10,
  }));
}

export async function getDemandaInsatisfecha(sector?: Sector): Promise<Record<TimeGranularity, DemandaInsatisfechaPoint[]>> {
  const empty = { day: [], week: [], month: [] };
  const [pedidoFacturadoIds, radarIds] = await Promise.all([
    getPedidosFacturadosLocationIds(sector),
    getUniverseLocationIds(sector),
  ]);
  if (pedidoFacturadoIds.size === 0 && radarIds.size === 0) return empty;

  const supabase = createSupabaseServiceClient();
  const [{ data: pedidoFacturadoData }, { data: radarData }] = await Promise.all([
    supabase
      .from("sap_pedidos_facturados")
      .select("location_id, cantidad_pedido_kg, cantidad_facturada_kg, fecha")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS),
    supabase
      .from("sap_sell_in_records")
      .select("location_id, quantity_kg, date_of_sale")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS),
  ]);

  const pedidoFacturadoRows = ((pedidoFacturadoData ?? []) as {
    location_id: string;
    cantidad_pedido_kg: number;
    cantidad_facturada_kg: number;
    fecha: string;
  }[]).filter((r) => pedidoFacturadoIds.has(r.location_id));

  const pedido = pedidoFacturadoRows.map((r) => ({ date: r.fecha, kg: r.cantidad_pedido_kg }));
  const facturado = pedidoFacturadoRows.map((r) => ({ date: r.fecha, kg: r.cantidad_facturada_kg }));
  const radar = ((radarData ?? []) as { location_id: string; quantity_kg: number; date_of_sale: string }[])
    .filter((r) => radarIds.has(r.location_id))
    .map((r) => ({ date: r.date_of_sale, kg: r.quantity_kg }));

  if (pedido.length === 0 && facturado.length === 0 && radar.length === 0) return empty;

  return {
    day: computeDemandaInsatisfechaPoints(pedido, facturado, radar, "day"),
    week: computeDemandaInsatisfechaPoints(pedido, facturado, radar, "week"),
    month: computeDemandaInsatisfechaPoints(pedido, facturado, radar, "month"),
  };
}

export { PILOT_SECTORS, SECTOR_LABELS };
export type { LocationType };
