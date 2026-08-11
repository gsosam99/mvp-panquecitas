import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PRODUCT_IDS, VARIANT_IDS } from "@/data/catalog";
import { DIAS_HABILES_POR_SEMANA } from "@/lib/business-days";
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

// El Radar de Harina PAN (HPM) del perfil DIENN solo cuenta a partir de esta
// fecha (decisión con Alejandro): las cargas de HPM anteriores no se toman en
// cuenta, ni en el volumen acumulado ni en los gráficos. NO aplica a
// Panquecitas, que se cuenta completo. `date_of_sale` viene como ISO
// (YYYY-MM-DD…), así que la comparación de strings es correcta.
const HPM_RADAR_DESDE = "2026-08-03";

function esHpmVigente(productId: string, dateOfSale: string): boolean {
  return productId !== PRODUCT_IDS.HARINA_PAN || dateOfSale >= HPM_RADAR_DESDE;
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
    .select("quantity_kg, location_id, product_id, date_of_sale")
    .in("product_id", [PRODUCT_IDS.PANQUECITAS, PRODUCT_IDS.HARINA_PAN]);

  let panquecitasKg = 0;
  let harinaPanKg = 0;
  for (const r of (data ?? []) as {
    quantity_kg: number;
    location_id: string;
    product_id: string;
    date_of_sale: string;
  }[]) {
    if (!ids.has(r.location_id)) continue;
    if (r.product_id === PRODUCT_IDS.PANQUECITAS) panquecitasKg += r.quantity_kg;
    // HPM: solo cargas a partir de HPM_RADAR_DESDE (ver nota arriba).
    else if (r.product_id === PRODUCT_IDS.HARINA_PAN && esHpmVigente(r.product_id, r.date_of_sale))
      harinaPanKg += r.quantity_kg;
  }
  return {
    panquecitasTon: Math.round((panquecitasKg / 1000) * 100) / 100,
    harinaPanTon: Math.round((harinaPanKg / 1000) * 100) / 100,
  };
}

// ── 2. Running de Ventas ──────────────────────────────────────────
// Kg_Semanal_Promedio = Total_Kg_Vendidos / Numero_Semanas_Evaluadas,
// calculado sobre una VENTANA MÓVIL de los últimos 2 meses de Radar (no
// sobre todo el histórico). Días de inventario = inventario actual en
// depósito (última visita por PDV) / ritmo diario de venta, expresado en
// DÍAS HÁBILES (kg por semana / 5, ver business-days.ts). Proyección: a 2
// meses del ritmo semanal actual (ver docs/decisiones-implementacion.md).

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

const PROYECCION_MESES = 2;
/** Ventana móvil del promedio Running: solo los últimos N meses de Radar. */
const RUNNING_VENTANA_MESES = 2;
/** Semanas promedio por mes (calendario) — para proyectar el ritmo semanal. */
const SEMANAS_POR_MES = 4.345;

export async function getRunningVentas(sector?: Sector): Promise<RunningVentasResult> {
  const supabase = createSupabaseServiceClient();
  const ids = await getUniverseLocationIds(sector);
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("quantity_kg, date_of_sale, location_id")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .order("date_of_sale");

  const rowsAll = ((data ?? []) as { quantity_kg: number; date_of_sale: string; location_id: string }[]).filter((r) =>
    ids.has(r.location_id)
  );

  // Ventana móvil: solo los últimos RUNNING_VENTANA_MESES desde la última
  // fecha con Radar (promedio estricto de 2 meses, no de todo el histórico).
  let rows = rowsAll;
  if (rowsAll.length > 0) {
    const lastIso = rowsAll[rowsAll.length - 1].date_of_sale.slice(0, 10);
    const cutoff = new Date(`${lastIso}T00:00:00Z`);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - RUNNING_VENTANA_MESES);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    rows = rowsAll.filter((r) => r.date_of_sale.slice(0, 10) >= cutoffIso);
  }

  const totalKg = rows.reduce((s, r) => s + r.quantity_kg, 0);

  let numSemanas = 1;
  if (rows.length > 0) {
    const first = new Date(rows[0].date_of_sale).getTime();
    const last = new Date(rows[rows.length - 1].date_of_sale).getTime();
    numSemanas = Math.max(1, Math.round((last - first) / (7 * 86400000)));
  }

  const kgPerWeek = totalKg / numSemanas;
  const inventarioKg = await getInventarioDepositoKg(sector);
  // Ritmo diario en DÍAS HÁBILES (L–V): el producto se vende de lunes a
  // viernes, así que se divide por 5, no por 7. Ver business-days.ts.
  const kgPerDay = kgPerWeek / DIAS_HABILES_POR_SEMANA;
  const diasInventario = kgPerDay > 0 ? Math.round(inventarioKg / kgPerDay) : 0;

  const proyeccionKg = kgPerWeek * SEMANAS_POR_MES * PROYECCION_MESES;

  return {
    kgPerWeek: Math.round(kgPerWeek * 10) / 10,
    diasInventario,
    proyeccionToneladas: Math.round((proyeccionKg / 1000) * 100) / 100,
    proyeccionMeses: PROYECCION_MESES,
  };
}

// ── 3. Mix de Producto (Radar por presentación) ────────────────────
// Toneladas reales en anaquel 400g vs 800g desde sap_sell_in_records
// (Carga Radar), separadas por variant_id (llenado al cargar el reporte
// N7_V_SD83_WEB_001 — ver migración 008 y SAP_MATERIAL_VARIANT_MAP).
//
// CAMBIO (decisión con Alejandro, 08-08-2026): el Mix ahora se guía
// EXCLUSIVAMENTE por el dato de Radar, no por Pedidos y Facturado, porque
// representa lo realmente disponible/vendido en el local. El % de cada
// presentación es sobre el total Radar combinado (400g+800g), así que las
// dos presentaciones suman 100%.

export type PresentacionMix = "400g" | "800g";

export interface MixProductoTonPoint {
  variant: PresentacionMix;
  toneladas: number;
  /** % que representa esta presentación sobre el total Radar combinado (400g+800g). */
  pctSobreTotal: number;
}

const VARIANT_TO_PRESENTACION: Record<string, PresentacionMix> = {
  [VARIANT_IDS.PANQ_04KG_UNIDAD]: "400g",
  [VARIANT_IDS.PANQ_04KG_BULTO]: "400g",
  [VARIANT_IDS.PANQ_08KG_UNIDAD]: "800g",
  [VARIANT_IDS.PANQ_08KG_BULTO]: "800g",
};

/** Kg de Radar (Carga Radar) por presentación 400g/800g — la fuente real del anaquel. */
async function getRadarKgByPresentacion(sector?: Sector): Promise<Record<PresentacionMix, number>> {
  const supabase = createSupabaseServiceClient();
  const ids = await getUniverseLocationIds(sector);

  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("quantity_kg, location_id, variant_id")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .not("variant_id", "is", null);

  const byVariant: Record<PresentacionMix, number> = { "400g": 0, "800g": 0 };
  for (const r of (data ?? []) as { quantity_kg: number; location_id: string; variant_id: string }[]) {
    if (!ids.has(r.location_id)) continue;
    const presentacion = VARIANT_TO_PRESENTACION[r.variant_id];
    if (!presentacion) continue;
    byVariant[presentacion] += r.quantity_kg;
  }
  return byVariant;
}

export async function getMixProducto(sector?: Sector): Promise<MixProductoTonPoint[]> {
  const radarKgByVariant = await getRadarKgByPresentacion(sector);
  const radarKgTotal = radarKgByVariant["400g"] + radarKgByVariant["800g"];

  return (["400g", "800g"] as PresentacionMix[]).map((variant) => ({
    variant,
    toneladas: Math.round((radarKgByVariant[variant] / 1000) * 100) / 100,
    pctSobreTotal:
      radarKgTotal > 0 ? Math.round((radarKgByVariant[variant] / radarKgTotal) * 1000) / 10 : 0,
  }));
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
    // HPM solo cuenta desde HPM_RADAR_DESDE; Panquecitas, completo.
    .filter((r) => esHpmVigente(r.product_id, r.date_of_sale))
    .map((r) => ({ product_id: r.product_id, date: r.date_of_sale, kg: r.quantity_kg }));

  if (rows.length === 0) return empty;

  return {
    day: computePanVsHarinaPanPoints(rows, "day"),
    week: computePanVsHarinaPanPoints(rows, "week"),
    month: computePanVsHarinaPanPoints(rows, "month"),
    quarter: computePanVsHarinaPanPoints(rows, "quarter"),
  };
}

// ── 4b. Comparativa de Penetración: Radar Panquecitas vs. HPM ──────
// Contrasta, sobre la MISMA lista objetivo de clientes (el universo del
// piloto — 358 en TOTAL, o el universo del sector con filtro), cuántos
// tienen Radar de Panquecitas > 0 contra cuántos tienen Radar de Harina
// PAN (HPM) > 0. Ambas penetraciones usan el MISMO denominador (la lista
// completa), de modo que el denominador de HPM incluye a los clientes que
// compran HPM pero NO panquecitas — así se ve el techo real de penetración
// que HPM ya alcanza y que Panquecitas todavía puede capturar. Todo desde
// Carga Radar (sap_sell_in_records), la única fuente del anaquel real.
// Ver pedido de Alejandro (08-08-2026).

export interface PenetracionRadarVsHpm {
  /** % de la lista objetivo con Radar de Panquecitas > 0. */
  radarPanquecitasPct: number;
  /** % de la lista objetivo con Radar de HPM (Harina PAN) > 0 — denominador = lista completa. */
  hpmPct: number;
  clientesPanquecitas: number;
  clientesHpm: number;
  /** Tamaño del denominador (lista objetivo): 358 en TOTAL o el universo del sector. */
  universo: number;
}

export async function getPenetracionRadarVsHpm(sector?: Sector): Promise<PenetracionRadarVsHpm> {
  const universoTotal = await getUniverseLocations();
  const universo = sector ? universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector) : universoTotal;
  const ids = new Set(universo.map((l) => l.id));
  const denom = sector ? universo.length : UNIVERSAL_CLIENTES_PILOTO;

  const [panqTotals, hmpTotals] = await Promise.all([
    getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS),
    getSellInTotalsByLocation(PRODUCT_IDS.HARINA_PAN),
  ]);

  const clientesPanquecitas = [...ids].filter((id) => (panqTotals.get(id) ?? 0) > 0).length;
  const clientesHpm = [...ids].filter((id) => (hmpTotals.get(id) ?? 0) > 0).length;

  return {
    radarPanquecitasPct: denom > 0 ? Math.round((clientesPanquecitas / denom) * 1000) / 10 : 0,
    hpmPct: denom > 0 ? Math.round((clientesHpm / denom) * 1000) / 10 : 0,
    clientesPanquecitas,
    clientesHpm,
    universo: denom,
  };
}

// ── 4c. Venta acumulada, Recompra y Activación (combo temporal) ────
// Alimenta el gráfico combinado (barras + 2 líneas, doble eje) que
// reemplaza al antiguo "Evolución de Penetración y Tasa de Recompra".
// Todo desde Carga Radar (sap_sell_in_records) de Panquecitas, acumulado
// en el tiempo (running total), para Día / Semana / Mes:
//   - ventaAcumuladaKg (barras, eje kg): Σ Radar hasta el bucket.
//   - recompraPct (línea): repetidores (≥2 meses con Radar>0) / clientes
//     activados. Ver misma nota de "meses, no fecha exacta" que en el
//     Detalle por Segmento.
//   - activacionPct (línea): clientes activados (Radar>0) / cartera fija
//     (358 en TOTAL, o el universo del sector con filtro).

export interface VentaRecompraActivacionPoint {
  bucket: string;
  label: string;
  ventaAcumuladaKg: number;
  recompraPct: number;
  activacionPct: number;
}

function computeVentaRecompraActivacionPoints(
  rows: { location_id: string; date_of_sale: string; quantity_kg: number }[],
  universoSize: number,
  granularity: TimeGranularity
): VentaRecompraActivacionPoint[] {
  if (rows.length === 0 || universoSize === 0) return [];
  const buckets = Array.from(new Set(rows.map((r) => bucketKeyFor(r.date_of_sale, granularity)))).sort();

  const points: VentaRecompraActivacionPoint[] = [];
  for (const bucket of buckets) {
    const rowsUpToBucket = rows.filter((r) => bucketKeyFor(r.date_of_sale, granularity) <= bucket);

    const ventaAcumuladaKg = rowsUpToBucket.reduce((s, r) => s + r.quantity_kg, 0);

    // Recompra = ≥2 meses distintos con Radar > 0 por cliente (acumulado).
    const monthsByLocation = new Map<string, Set<string>>();
    for (const r of rowsUpToBucket) {
      if (!monthsByLocation.has(r.location_id)) monthsByLocation.set(r.location_id, new Set());
      monthsByLocation.get(r.location_id)!.add(r.date_of_sale.slice(0, 7));
    }
    const activados = monthsByLocation.size;
    const conRecompra = Array.from(monthsByLocation.values()).filter((m) => m.size >= 2).length;

    points.push({
      bucket,
      label: bucketLabelFor(bucket, granularity),
      ventaAcumuladaKg: Math.round(ventaAcumuladaKg * 10) / 10,
      recompraPct: activados > 0 ? Math.round((conRecompra / activados) * 1000) / 10 : 0,
      activacionPct: Math.round((activados / universoSize) * 1000) / 10,
    });
  }

  return points;
}

export async function getVentaRecompraActivacion(
  sector?: Sector
): Promise<Record<TimeGranularity, VentaRecompraActivacionPoint[]>> {
  const empty = { day: [], week: [], month: [] };
  const universo = await getUniverseLocations();
  const universoFiltrado = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
  if (universoFiltrado.length === 0) return empty;
  const ids = new Set(universoFiltrado.map((l) => l.id));
  const universoSize = sector ? universoFiltrado.length : UNIVERSAL_CLIENTES_PILOTO;

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("location_id, date_of_sale, quantity_kg")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0)
    .order("date_of_sale");

  const rows = ((data ?? []) as { location_id: string; date_of_sale: string; quantity_kg: number }[]).filter((r) =>
    ids.has(r.location_id)
  );
  if (rows.length === 0) return empty;

  return {
    day: computeVentaRecompraActivacionPoints(rows, universoSize, "day"),
    week: computeVentaRecompraActivacionPoints(rows, universoSize, "week"),
    month: computeVentaRecompraActivacionPoints(rows, universoSize, "month"),
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
  // Facturado). Volumen HPM vs Base: Cantidad Pedido de Panquecitas,
  // cruda de Pedidos y Facturado.
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
  // Recompra = ≥2 meses distintos con Radar > 0 (no fecha exacta —
  // misma lógica que computeVentaRecompraActivacionPoints: Radar
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

// ── 9. Stock Out (DIENN) ────────────────────────────────────────────
// Clientes CON VENTA (Radar de Panquecitas > 0) cuya cantidad de producto en
// tienda es ≤ 3 unidades. "En tienda" = anaquel + depósito; si el mercaderista
// no tuvo acceso al depósito, solo anaquel. Se usa la última visita por PDV.
// La lista incluye la ubicación (anaquel) donde se encontró/debe ir el producto.

export const STOCK_OUT_UMBRAL_DIENN = 3;

export interface StockOutClientePoint {
  locationId: string;
  sapCode: string | null;
  name: string;
  unidadesTienda: number;
  /** true si el total incluye depósito (hubo acceso); false = solo anaquel. */
  depositoIncluido: boolean;
  ubicacion: string;
}

export interface StockOutResult {
  enStockOut: number;
  /** Compradores con visita considerados (denominador de contexto). */
  universo: number;
  clientes: StockOutClientePoint[];
}

function formatUbicacionProducto(loc: string[] | null, other: string | null): string {
  if (!loc || loc.length === 0) return "Sin ubicación registrada";
  return loc
    .map((o) => (o === "HARINA_TRIGO" ? "Junto a harina de trigo" : `Junto a otra categoría${other ? ` (${other})` : ""}`))
    .join(" · ");
}

export async function getStockOut(sector?: Sector): Promise<StockOutResult> {
  const empty: StockOutResult = { enStockOut: 0, universo: 0, clientes: [] };
  const universo = await getUniverseLocations();
  const universoFiltrado = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
  const ids = new Set(universoFiltrado.map((l) => l.id));
  if (ids.size === 0) return empty;

  const supabase = createSupabaseServiceClient();

  // Compradores = Radar de Panquecitas > 0 dentro del universo del corte.
  const { data: sellInData } = await supabase
    .from("sap_sell_in_records")
    .select("location_id")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0);
  const compradorIds = new Set(
    ((sellInData ?? []) as { location_id: string }[]).map((r) => r.location_id).filter((id) => ids.has(id))
  );
  if (compradorIds.size === 0) return empty;

  // Última visita por PDV comprador.
  const { data: visitsData } = await supabase
    .from("mercaderista_visits")
    .select("id, location_id, created_at, deposit_access, total_units_anaquel, product_location, product_location_other")
    .order("created_at", { ascending: false });

  type Visita = {
    id: string;
    location_id: string;
    deposit_access: boolean;
    total_units_anaquel: number | null;
    product_location: string[] | null;
    product_location_other: string | null;
  };
  const lastVisit = new Map<string, Visita>();
  for (const v of (visitsData ?? []) as Visita[]) {
    if (!compradorIds.has(v.location_id)) continue;
    if (!lastVisit.has(v.location_id)) lastVisit.set(v.location_id, v);
  }

  // Unidades en depósito (BODEGA) de esas últimas visitas — bultos→unidades.
  const visitIds = Array.from(lastVisit.values()).map((v) => v.id);
  const unidadesDepositoByVisit = new Map<string, number>();
  if (visitIds.length > 0) {
    const { data: variantsData } = await supabase.from("variants").select("id, units_per_bulk");
    const unitsPerBulk = new Map(
      ((variantsData ?? []) as { id: string; units_per_bulk: number }[]).map((v) => [v.id, v.units_per_bulk])
    );
    const { data: auditsData } = await supabase
      .from("inventory_audits")
      .select("visit_id, variant_id, quantity")
      .eq("zone", "BODEGA")
      .in("visit_id", visitIds);
    for (const a of (auditsData ?? []) as { visit_id: string; variant_id: string; quantity: number }[]) {
      const unidades = a.quantity * (unitsPerBulk.get(a.variant_id) ?? 1);
      unidadesDepositoByVisit.set(a.visit_id, (unidadesDepositoByVisit.get(a.visit_id) ?? 0) + unidades);
    }
  }

  const locById = new Map(universoFiltrado.map((l) => [l.id, l]));
  const clientes: StockOutClientePoint[] = [];
  for (const [locId, v] of lastVisit) {
    const anaquel = v.total_units_anaquel ?? 0;
    const deposito = v.deposit_access ? unidadesDepositoByVisit.get(v.id) ?? 0 : 0;
    const unidadesTienda = anaquel + deposito;
    if (unidadesTienda <= STOCK_OUT_UMBRAL_DIENN) {
      const loc = locById.get(locId);
      clientes.push({
        locationId: locId,
        sapCode: loc?.sap_code ?? null,
        name: loc?.name ?? "",
        unidadesTienda,
        depositoIncluido: !!v.deposit_access,
        ubicacion: formatUbicacionProducto(v.product_location, v.product_location_other),
      });
    }
  }
  clientes.sort((a, b) => a.unidadesTienda - b.unidadesTienda);

  return { enStockOut: clientes.length, universo: compradorIds.size, clientes };
}

// ── 10. Material POP con Preciador (DIENN) ──────────────────────────
// Ratio = clientes con preciador (pop_price_tag) / clientes con presencia del
// producto (product_present). Ambos de la última visita del mercaderista. El
// numerador se cuenta dentro de la población con presencia, así el ratio ≤ 100%.

export interface MaterialPopPreciadorResult {
  ratio: number;
  conPreciador: number;
  conPresencia: number;
}

export async function getMaterialPopPreciador(sector?: Sector): Promise<MaterialPopPreciadorResult> {
  const empty: MaterialPopPreciadorResult = { ratio: 0, conPreciador: 0, conPresencia: 0 };
  const ids = await getUniverseLocationIds(sector);
  if (ids.size === 0) return empty;

  const supabase = createSupabaseServiceClient();
  const { data: visitsData } = await supabase
    .from("mercaderista_visits")
    .select("location_id, created_at, product_present, pop_price_tag")
    .order("created_at", { ascending: false });

  type Visita = { location_id: string; product_present: boolean; pop_price_tag: boolean | null };
  const lastVisit = new Map<string, Visita>();
  for (const v of (visitsData ?? []) as Visita[]) {
    if (!ids.has(v.location_id)) continue;
    if (!lastVisit.has(v.location_id)) lastVisit.set(v.location_id, v);
  }

  let conPresencia = 0;
  let conPreciador = 0;
  for (const v of lastVisit.values()) {
    if (v.product_present === true) {
      conPresencia++;
      if (v.pop_price_tag === true) conPreciador++;
    }
  }

  return {
    conPreciador,
    conPresencia,
    ratio: conPresencia > 0 ? Math.round((conPreciador / conPresencia) * 1000) / 10 : 0,
  };
}

// ── 11. Posición del producto en PDV (DIENN) ────────────────────────
// Distribución de dónde ubican el producto los mercaderistas (product_location),
// entre clientes con presencia del producto (última visita). Un cliente puede
// tener el producto en más de una ubicación, así que cuenta en cada categoría.

export interface PosicionPdvPoint {
  categoria: string;
  clientes: number;
}

export async function getPosicionPdv(sector?: Sector): Promise<PosicionPdvPoint[]> {
  const ids = await getUniverseLocationIds(sector);
  if (ids.size === 0) return [];

  const supabase = createSupabaseServiceClient();
  const { data: visitsData } = await supabase
    .from("mercaderista_visits")
    .select("location_id, created_at, product_present, product_location, product_location_other")
    .order("created_at", { ascending: false });

  type Visita = {
    location_id: string;
    product_present: boolean;
    product_location: string[] | null;
    product_location_other: string | null;
  };
  const lastVisit = new Map<string, Visita>();
  for (const v of (visitsData ?? []) as Visita[]) {
    if (!ids.has(v.location_id)) continue;
    if (!lastVisit.has(v.location_id)) lastVisit.set(v.location_id, v);
  }

  // "Junto a harina de trigo" es una categoría fija; "otra categoría" NO se
  // agrupa en una sola barra: se desglosa por la categoría específica que
  // indicó el mercaderista en product_location_other.
  const HARINA_TRIGO = "Junto a harina de trigo";
  const counts = new Map<string, number>();
  const add = (categoria: string) => counts.set(categoria, (counts.get(categoria) ?? 0) + 1);

  for (const v of lastVisit.values()) {
    if (v.product_present !== true || !v.product_location) continue;
    if (v.product_location.includes("HARINA_TRIGO")) add(HARINA_TRIGO);
    if (v.product_location.includes("OTRA_CATEGORIA")) {
      const especifica = v.product_location_other?.trim();
      add(especifica && especifica.length > 0 ? especifica : "Otra categoría (sin especificar)");
    }
  }

  return Array.from(counts.entries())
    .map(([categoria, clientes]) => ({ categoria, clientes }))
    // Harina de trigo primero; el resto por cantidad de clientes desc.
    .sort((a, b) =>
      a.categoria === HARINA_TRIGO ? -1 : b.categoria === HARINA_TRIGO ? 1 : b.clientes - a.clientes
    );
}

export { PILOT_SECTORS, SECTOR_LABELS };
export type { LocationType };
