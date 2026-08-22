import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows, fetchAllRowsChunked } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS, VARIANT_IDS } from "@/data/catalog";
import { PVP_TARGETS, PVP_TOLERANCE } from "@/data/pvp-thresholds";
import { DIAS_HABILES_POR_SEMANA, contarDiasHabiles } from "@/lib/business-days";
import { getBcvRateLookup, precioVisitaEnUsd } from "@/lib/bcv";
import {
  PILOT_SECTORS,
  SECTOR_LABELS,
  sectorGroup,
  getSellInTotalsByLocation,
  getUniverseLocations,
  getVolumenLocations,
  esFueraDeCartera,
  type Sector,
} from "@/lib/universe";
import {
  bucketEndDate,
  todayISO,
  bucketKeyFor,
  bucketLabelFor,
  panBucketKeyFor,
  panBucketLabelFor,
  type PanComparisonGranularity,
  type TimeGranularity,
} from "@/lib/date-buckets";
import { estabaIncorporado, vigentesAl } from "@/lib/cohortes";
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
  // Scope de "ahora mismo": los clientes de una tanda con fecha de
  // incorporación futura todavía no son cartera. Ver src/lib/cohortes.ts.
  return new Set(vigentesAl(filtered, todayISO()).map((l) => l.id));
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
  // Paginado: `locations` pasó las 1000 filas con la cartera ampliada y
  // PostgREST corta ahí en silencio (ver fetch-all.ts).
  const data = await fetchAllRows<{ id: string; oficina_venta: string | null }>(() =>
    supabase.from("locations").select("id, oficina_venta")
  );
  const filtered = data.filter((l) =>
    sector ? sectorGroup(l.oficina_venta) === sector : sectorGroup(l.oficina_venta) !== null
  );
  return new Set(filtered.map((l) => l.id));
}

/**
 * Clientes con VENTAS EN SAP = location_id con Radar de Panquecitas > 0
 * (sap_sell_in_records). Misma definición de "comprador" que el Stock Out y el
 * perfil Administrador. Se usa para acotar los indicadores de ejecución
 * (Material POP, Cobertura) a clientes reales que venden.
 */
async function getCompradorLocationIds(): Promise<Set<string>> {
  const supabase = createSupabaseServiceClient();
  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("location_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("quantity_kg", 0)
  );
  return new Set(((data ?? []) as { location_id: string }[]).map((r) => r.location_id));
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

  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_pedidos_facturados")
      .select("cantidad_pedido_kg, cantidad_facturada_kg, location_id, variant_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .not("variant_id", "is", null)
  );

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
  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_pedidos_facturados")
      .select("cantidad_pedido_kg, location_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
  );

  let pedidaKgTotal = 0;
  for (const r of (data ?? []) as { cantidad_pedido_kg: number; location_id: string }[]) {
    if (ids.has(r.location_id)) pedidaKgTotal += r.cantidad_pedido_kg;
  }
  return Math.round((pedidaKgTotal / 1000) * 100) / 100;
}

/**
 * "Volumen facturado" — suma de la columna Cantidad Facturada del reporte
 * Pedidos y Facturado (Panquecitas). Es "la cantidad total vendida/facturada".
 * En TOTAL suma TODO lo guardado (la tabla ya solo tiene clientes de la cartera
 * + distribuidoras — ver handleFacturacionUpload); NO se vuelve a filtrar por
 * sector piloto, porque eso dejaba fuera a distribuidoras con oficina de venta
 * distinta y subcontaba. Por ciudad sí se acota a los PDV de ese sector.
 */
export async function getTotalFacturadoToneladas(sector?: Sector): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_pedidos_facturados")
      .select("cantidad_facturada_kg, location_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
  );
  const rows = (data ?? []) as { cantidad_facturada_kg: number; location_id: string }[];

  const ids = sector ? await getPedidosFacturadosLocationIds(sector) : null;
  let facturadaKgTotal = 0;
  for (const r of rows) {
    if (ids && !ids.has(r.location_id)) continue; // por ciudad: solo ese sector
    facturadaKgTotal += r.cantidad_facturada_kg;
  }
  return Math.round((facturadaKgTotal / 1000) * 100) / 100;
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
// vendidas y despachadas. Separado por producto porque cada uno alimenta la
// tarjeta de KPI correspondiente.
//
// Esta es LA ÚNICA métrica que suma clientes fuera de la cartera: PDV que los
// vendedores del modelo indirecto atendieron por fuera de la lista y que
// venden de verdad (Alejandro, 22-08-2026). Sus toneladas quedan
// documentadas, pero no cuentan como clientes en ninguna tasa — para eso
// están getUniverseLocations() y el resto de los denominadores. Se devuelven
// además por separado para poder mostrarlas explícitas en la tarjeta y que
// nadie tenga que adivinar por qué este total no calza con los gráficos por
// segmento. Ver COHORTE_FUERA_DE_CARTERA en cohortes.ts.
export interface VolumenRadarAcumulado {
  panquecitasTon: number;
  harinaPanTon: number;
  /** Parte de panquecitasTon que viene de clientes fuera de la cartera. */
  fueraDeCarteraTon: number;
  /** Cuántos clientes fuera de cartera aportaron ese volumen. */
  fueraDeCarteraClientes: number;
}

export async function getVolumenRadarAcumulado(sector?: Sector): Promise<VolumenRadarAcumulado> {
  const locations = await getVolumenLocations();
  const delSector = sector ? locations.filter((l) => sectorGroup(l.oficina_venta) === sector) : locations;
  // Los "fuera de cartera" no tienen fecha de incorporación, así que
  // vigentesAl() los deja pasar siempre: no pertenecen a ninguna tanda.
  const vigentes = vigentesAl(delSector, todayISO());
  const idsCartera = new Set(vigentes.filter((l) => !esFueraDeCartera(l.cohorte)).map((l) => l.id));
  const idsFuera = new Set(vigentes.filter((l) => esFueraDeCartera(l.cohorte)).map((l) => l.id));

  const supabase = createSupabaseServiceClient();
  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("quantity_kg, location_id, product_id, date_of_sale")
      .in("product_id", [PRODUCT_IDS.PANQUECITAS, PRODUCT_IDS.HARINA_PAN])
  );

  let panquecitasKg = 0;
  let harinaPanKg = 0;
  let fueraKg = 0;
  const clientesFuera = new Set<string>();

  for (const r of (data ?? []) as {
    quantity_kg: number;
    location_id: string;
    product_id: string;
    date_of_sale: string;
  }[]) {
    const esFuera = idsFuera.has(r.location_id);
    if (!esFuera && !idsCartera.has(r.location_id)) continue;

    if (r.product_id === PRODUCT_IDS.PANQUECITAS) {
      panquecitasKg += r.quantity_kg;
      if (esFuera) {
        fueraKg += r.quantity_kg;
        clientesFuera.add(r.location_id);
      }
    }
    // HPM: solo cargas a partir de HPM_RADAR_DESDE (ver nota arriba).
    else if (r.product_id === PRODUCT_IDS.HARINA_PAN && esHpmVigente(r.product_id, r.date_of_sale))
      harinaPanKg += r.quantity_kg;
  }

  return {
    panquecitasTon: Math.round((panquecitasKg / 1000) * 100) / 100,
    harinaPanTon: Math.round((harinaPanKg / 1000) * 100) / 100,
    fueraDeCarteraTon: Math.round((fueraKg / 1000) * 100) / 100,
    fueraDeCarteraClientes: clientesFuera.size,
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
  const visitsData = await fetchAllRows<unknown>(() =>
    supabase
      .from("mercaderista_visits")
      .select("id, location_id, created_at, deposit_access")
      .order("created_at", { ascending: false })
  );

  const lastVisitByLocation = new Map<string, string>();
  for (const v of (visitsData ?? []) as { id: string; location_id: string; deposit_access: boolean }[]) {
    if (!lastVisitByLocation.has(v.location_id) && v.deposit_access && ids.has(v.location_id)) {
      lastVisitByLocation.set(v.location_id, v.id);
    }
  }
  const visitIds = Array.from(lastVisitByLocation.values());
  if (visitIds.length === 0) return 0;

  const auditsData = await fetchAllRowsChunked<unknown>(
    (lote) =>
    supabase
      .from("inventory_audits")
      .select("visit_id, variant_id, quantity, zone")
      .eq("zone", "BODEGA")
        .in("visit_id", lote)
      ,
    visitIds
  );

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
  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("quantity_kg, date_of_sale, location_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .order("date_of_sale")
  );

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

  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("quantity_kg, location_id, variant_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .not("variant_id", "is", null)
  );

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
//   - "universo": la cartera del piloto vigente en cada fecha (incluye 0
//     Panquecitas). La cartera creció en agosto — ver src/lib/cohortes.ts.

// El denominador del piloto era una constante fija (358) porque la cartera se
// asumía inmutable. Ya no lo es: se amplió el 14-08-2026 (indirecto Cumaná) y
// el 24-08-2026 (resto de la cartera consolidada). Ahora sale de contar los
// clientes VIGENTES a la fecha de corte — todayISO() para las tarjetas, el
// cierre del bucket para cada punto de una serie. Ver src/lib/cohortes.ts y
// migration 020_fecha_incorporacion.sql.

export type PanComparisonPoblacion = "clientes" | "universo";

export interface PanVsHarinaPanPoint {
  bucket: string;
  label: string;
  panquecitasKg: number;
  harinaPanKg: number;
}

/**
 * location_id → fecha_incorporacion de la población elegida. Devuelve el mapa
 * y no un Set porque el filtrado no es solo "¿pertenece?" sino "¿pertenecía YA
 * en la fecha de esta venta?" — un cliente incorporado el 24-08 tiene
 * histórico de Harina PAN de antes, y contarlo en los buckets previos infla
 * la línea de HPM de semanas en las que ese cliente no era del piloto.
 */
async function getPanVsHarinaPanUniverse(
  sector: Sector | undefined,
  poblacion: PanComparisonPoblacion
): Promise<Map<string, string | null>> {
  const universo = await getUniverseLocations();
  const universoFiltrado = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
  const porId = new Map(universoFiltrado.map((l) => [l.id, l.fecha_incorporacion ?? null]));
  if (poblacion === "universo" || porId.size === 0) return porId;

  const supabase = createSupabaseServiceClient();
  const data = await fetchAllRows<{ location_id: string }>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("location_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("quantity_kg", 0)
  );

  const compradorIds = new Set(data.map((r) => r.location_id));
  return new Map([...porId].filter(([id]) => compradorIds.has(id)));
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
  const incorporacionPorId = await getPanVsHarinaPanUniverse(sector, poblacion);
  if (incorporacionPorId.size === 0) return empty;

  const supabase = createSupabaseServiceClient();
  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("location_id, product_id, quantity_kg, date_of_sale")
      .in("product_id", [PRODUCT_IDS.PANQUECITAS, PRODUCT_IDS.HARINA_PAN])
  );

  const rows = ((data ?? []) as { location_id: string; product_id: string; quantity_kg: number; date_of_sale: string }[])
    .filter((r) => incorporacionPorId.has(r.location_id))
    // Solo las ventas posteriores a la incorporación del cliente al piloto.
    .filter((r) => estabaIncorporado(incorporacionPorId.get(r.location_id), r.date_of_sale.slice(0, 10)))
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
// piloto vigente HOY, o el del sector con filtro), cuántos
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
  /** Tamaño del denominador: clientes de la lista objetivo incorporados a la fecha. */
  universo: number;
}

export async function getPenetracionRadarVsHpm(sector?: Sector): Promise<PenetracionRadarVsHpm> {
  const universoTotal = await getUniverseLocations();
  const delSector = sector ? universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector) : universoTotal;
  // Tarjeta de "ahora mismo": la lista objetivo son los clientes ya
  // incorporados hoy. Una tanda con fecha futura (la Ampliación arranca el
  // 24-08-2026) no entra al denominador hasta que llega su fecha, así que la
  // penetración no se diluye antes de que esos clientes puedan comprar.
  const universo = vigentesAl(delSector, todayISO());
  const ids = new Set(universo.map((l) => l.id));
  const denom = universo.length;

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
//   - recompraPct (línea): tasa de clientes recurrentes — clientes con ≥2 FECHAS
//     distintas de venta Radar (tabla radar_ventas_fechas) ÷ clientes con al
//     menos una. Conteo de clientes únicos, no de ventas.
//     Necesita el migration 013 y re-cargar los reportes de Radar.
//   - activacionPct (línea): clientes activados (Radar>0) / cartera VIGENTE
//     al cierre de ese bucket (no una cartera fija). La cartera creció el
//     14-08 y el 24-08-2026; con un denominador fijo, las semanas anteriores
//     a esas fechas se dividirían entre clientes que todavía no existían y la
//     serie histórica entera se hundiría. Ver src/lib/cohortes.ts.

export interface VentaRecompraActivacionPoint {
  bucket: string;
  label: string;
  ventaAcumuladaKg: number;
  recompraPct: number;
  activacionPct: number;
  /** Cartera vigente al cierre del bucket — denominador de activacionPct. */
  universo: number;
}

function computeVentaRecompraActivacionPoints(
  rows: { location_id: string; date_of_sale: string; quantity_kg: number }[],
  fechasRows: { location_id: string; fecha: string }[],
  universoSizeAt: (cierre: string) => number,
  granularity: TimeGranularity
): VentaRecompraActivacionPoint[] {
  if (rows.length === 0) return [];
  const buckets = Array.from(new Set(rows.map((r) => bucketKeyFor(r.date_of_sale, granularity)))).sort();

  const points: VentaRecompraActivacionPoint[] = [];
  for (const bucket of buckets) {
    const rowsUpToBucket = rows.filter((r) => bucketKeyFor(r.date_of_sale, granularity) <= bucket);

    const ventaAcumuladaKg = rowsUpToBucket.reduce((s, r) => s + r.quantity_kg, 0);

    // Activación: clientes con al menos una venta Radar hasta el bucket.
    const activados = new Set(rowsUpToBucket.map((r) => r.location_id)).size;

    // Recompra = TASA DE CLIENTES RECURRENTES (punto 3 del documento de cambios,
    // 18-08-2026): clientes con ≥2 fechas distintas de venta Radar ÷ clientes con
    // al menos una. Es un conteo de clientes únicos, no de ventas — antes era
    // "ventas repetidas ÷ total de ventas", que un cliente muy recurrente podía
    // inflar solo. Las fechas salen de radar_ventas_fechas.
    const fechasByLoc = new Map<string, Set<string>>();
    for (const f of fechasRows) {
      if (bucketKeyFor(f.fecha, granularity) > bucket) continue;
      if (!fechasByLoc.has(f.location_id)) fechasByLoc.set(f.location_id, new Set());
      fechasByLoc.get(f.location_id)!.add(f.fecha);
    }
    let clientesConVenta = 0;
    let clientesRecurrentes = 0;
    for (const set of fechasByLoc.values()) {
      clientesConVenta += 1;
      if (set.size >= 2) clientesRecurrentes += 1;
    }

    // Cartera vigente al CIERRE de este bucket. Se recalcula punto a punto:
    // los buckets anteriores al 14-08 dividen entre los 358 originales y los
    // posteriores entre la cartera ampliada, así que ampliar el piloto no
    // reescribe hacia atrás la activación ya reportada.
    const universoSize = universoSizeAt(bucketEndDate(bucket));

    points.push({
      bucket,
      label: bucketLabelFor(bucket, granularity),
      ventaAcumuladaKg: Math.round(ventaAcumuladaKg * 10) / 10,
      recompraPct:
        clientesConVenta > 0 ? Math.round((clientesRecurrentes / clientesConVenta) * 1000) / 10 : 0,
      activacionPct: universoSize > 0 ? Math.round((activados / universoSize) * 1000) / 10 : 0,
      universo: universoSize,
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
  const incorporacionPorId = new Map(universoFiltrado.map((l) => [l.id, l.fecha_incorporacion ?? null]));

  // Denominador dinámico: cuántos clientes de la cartera había incorporados a
  // una fecha dada. Se recorre la lista completa en cada llamada porque son
  // cientos de filas y unas decenas de buckets — no vale la pena indexar.
  const universoSizeAt = (cierre: string) => vigentesAl(universoFiltrado, cierre).length;

  const supabase = createSupabaseServiceClient();
  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("location_id, date_of_sale, quantity_kg")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("quantity_kg", 0)
      .order("date_of_sale")
  );

  // Numerador con el mismo criterio que el denominador: una venta anterior a
  // la incorporación del cliente no cuenta. Si contara, un cliente de la
  // tanda del 24-08 con histórico previo aparecería "activado" en semanas en
  // las que no estaba en el denominador, y la tasa pasaría del 100%.
  const rows = ((data ?? []) as { location_id: string; date_of_sale: string; quantity_kg: number }[]).filter(
    (r) =>
      incorporacionPorId.has(r.location_id) &&
      estabaIncorporado(incorporacionPorId.get(r.location_id), r.date_of_sale.slice(0, 10))
  );
  if (rows.length === 0) return empty;

  // Fechas de venta Radar (para la recompra por fechas distintas). Si la tabla
  // no existe todavía (falta el migration 013) o la consulta falla, `data` es
  // null → sin fechas → recompra 0 hasta re-cargar los reportes.
  const fechasData = await fetchAllRows<unknown>(() =>
    supabase
      .from("radar_ventas_fechas")
      .select("location_id, fecha")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
  );
  const fechasRows = ((fechasData ?? []) as { location_id: string; fecha: string }[]).filter(
    (r) =>
      incorporacionPorId.has(r.location_id) &&
      estabaIncorporado(incorporacionPorId.get(r.location_id), r.fecha.slice(0, 10))
  );

  return {
    day: computeVentaRecompraActivacionPoints(rows, fechasRows, universoSizeAt, "day"),
    week: computeVentaRecompraActivacionPoints(rows, fechasRows, universoSizeAt, "week"),
    month: computeVentaRecompraActivacionPoints(rows, fechasRows, universoSizeAt, "month"),
  };
}


// ── 4d. Rendimiento diario vs. promedio histórico 3 Meses (punto 1) ─
// Compara la venta diaria de Panquecitas (Carga Radar) contra el promedio de
// ventas diarias de Harina PAN de los últimos 3 meses, que viene de la carga
// aparte "Radar últimos 3 Meses" (radar_3m_records, migration 017).
//
// Dos referencias FIJAS (no varían día a día, por eso son líneas rectas):
//   - promedio3M: total de Harina PAN del reporte ÷ días que cubre el reporte.
//   - meta4Pct:   promedio3M × 0,04.
// Y por cada día, el ratio = Panquecitas del día ÷ promedio3M × 100.
//
// El filtro de población cambia QUÉ clientes entran en el promedio de PAN:
//   - "clientes": solo los que tienen Panquecitas (Radar > 0).
//   - "universo": la cartera del piloto vigente a la fecha.

// El comportamiento diario se grafica desde el 03-08-2026 en adelante
// (decisión con DIENN, 18-08-2026). El reporte de 3 meses hacia atrás NO se
// dibuja: solo aporta el promedio de referencia y su 4%.
const RENDIMIENTO_DIARIO_DESDE = "2026-08-03";

export type Pan3MPoblacion = "clientes" | "universo";

export interface Rendimiento3MPunto {
  dia: string; // "YYYY-MM-DD"
  label: string;
  panquecitasKg: number;
  /** Panquecitas del día ÷ promedio3M × 100. */
  ratioPct: number;
}

export interface Rendimiento3MResult {
  /** Promedio de ventas diarias de Harina PAN de los 3 meses (kg/día). */
  promedio3M: number;
  /** 4% de ese promedio (kg/día) — la línea punteada de referencia. */
  meta4Pct: number;
  /** Días hábiles que cubre el reporte de 3 meses (denominador del promedio). */
  diasPeriodo: number;
  /** Rango que cubre ese promedio, para poder auditarlo. */
  desde: string;
  hasta: string;
  /** Total de Harina PAN del reporte, para poder auditar el promedio. */
  totalPanKg: number;
  /** PDV que aportaron ese total (los que tienen PAN en el reporte). */
  clientesPan: number;
  /** PDV de la población elegida en este corte, para comparar contra el anterior. */
  clientesPoblacion: number;
  puntos: Rendimiento3MPunto[];
}

/** "2026-07" → "2026-07-31". Día 0 del mes siguiente = último día de este. */
function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const dia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

const RENDIMIENTO_3M_VACIO: Rendimiento3MResult = {
  promedio3M: 0,
  meta4Pct: 0,
  diasPeriodo: 0,
  desde: "",
  hasta: "",
  totalPanKg: 0,
  clientesPan: 0,
  clientesPoblacion: 0,
  puntos: [],
};

export async function getRendimiento3M(
  poblacion: Pan3MPoblacion,
  sector?: Sector
): Promise<Rendimiento3MResult> {
  const universoTotal = await getUniverseLocations();
  const delSector = sector ? universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector) : universoTotal;
  // Cartera vigente hoy: una tanda con fecha futura no entra al promedio.
  const universo = vigentesAl(delSector, todayISO());
  if (universo.length === 0) return RENDIMIENTO_3M_VACIO;
  const idsUniverso = new Set(universo.map((l) => l.id));

  const supabase = createSupabaseServiceClient();

  // Harina PAN del reporte de 3 meses. Si la tabla todavía no existe (falta el
  // migration 017) o no se ha cargado nada, el gráfico queda vacío en vez de
  // romper la página.
  // Paginado a propósito: PostgREST corta las respuestas (1000 filas por
  // defecto en Supabase) y esta tabla tiene ~1 fila por cliente y mes — con 734
  // clientes × 3 meses se pasa del tope y solo llegaban las primeras, que son
  // las de mayo. De ahí que el promedio saliera calculado sobre un solo mes.
  const PAGINA = 1000;
  const pan3mData: { location_id: string | null; quantity_kg: number; date_of_sale: string }[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data: pagina } = await supabase
      .from("radar_3m_records")
      .select("location_id, product_id, quantity_kg, date_of_sale")
      .eq("product_id", PRODUCT_IDS.HARINA_PAN)
      .order("date_of_sale", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (!pagina || pagina.length === 0) break;
    pan3mData.push(...(pagina as typeof pan3mData));
    if (pagina.length < PAGINA) break;
  }

  // El recorte por cartera se hace más abajo, al elegir la población: acá se
  // conservan todas las filas leídas.
  const pan3m = (pan3mData ?? []) as {
    location_id: string | null;
    quantity_kg: number;
    date_of_sale: string;
  }[];
  if (pan3m.length === 0) return RENDIMIENTO_3M_VACIO;

  // Panquecitas por día (Carga Radar viva), acotadas al sector. Paginado por el
  // mismo motivo que arriba: sap_sell_in_records pasa de 1000 filas y sin
  // paginar la serie diaria salía recortada.
  const panqTotals = await getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS);
  const panqData: { location_id: string; quantity_kg: number; date_of_sale: string }[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data: pagina } = await supabase
      .from("sap_sell_in_records")
      .select("location_id, quantity_kg, date_of_sale")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("quantity_kg", 0)
      .order("date_of_sale", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (!pagina || pagina.length === 0) break;
    panqData.push(...(pagina as typeof panqData));
    if (pagina.length < PAGINA) break;
  }

  const panq = panqData.filter((r) => idsUniverso.has(r.location_id));

  // Población del promedio de PAN — ambas acotadas a la CARTERA (decisión de
  // DIENN, 18-08-2026: "PAN Universo son los clientes de la cartera"):
  //   - "universo": todos los PDV de la cartera del corte activo, hayan
  //     comprado Panquecitas o no.
  //   - "clientes": solo los que además compran Panquecitas.
  // El reporte trae bastantes más clientes que la cartera (734 vs 358); esas
  // filas se guardan igual pero vienen con location_id null y quedan fuera.
  const idsClientesPanq = new Set(
    universo.filter((l) => (panqTotals.get(l.id) ?? 0) > 0).map((l) => l.id)
  );
  const idsPan = poblacion === "universo" ? idsUniverso : idsClientesPanq;
  const panFiltrado = pan3m.filter((r) => r.location_id !== null && idsPan.has(r.location_id));
  // Con población "clientes" puede quedar vacío (ningún cliente con Panquecitas
  // tiene PAN en el reporte de 3 meses): sin filas no hay promedio que calcular
  // y fechasPan[0] sería undefined.
  if (panFiltrado.length === 0) return RENDIMIENTO_3M_VACIO;
  const totalPanKg = panFiltrado.reduce((s, r) => s + Number(r.quantity_kg), 0);

  // Promedio = venta acumulada de los 3 meses ÷ días hábiles de esos 3 meses
  // COMPLETOS (definición de DIENN, 18-08-2026).
  //
  // El período NO se toma de las fechas guardadas: en radar_3m_records hay un
  // corte por mes (el último, que es el acumulado del mes entero), así que la
  // fecha más antigua es un fin de mes y la más nueva es el corte de julio, que
  // puede no ser el 31. Tomarlas literal recortaba el período por los dos
  // extremos e inflaba el promedio. Se usan los MESES presentes, de su primer
  // día al último.
  const fechasPan = panFiltrado.map((r) => r.date_of_sale.slice(0, 10)).sort();
  const inicioPeriodo = `${fechasPan[0].slice(0, 7)}-01`;
  const finPeriodo = ultimoDiaDelMes(fechasPan[fechasPan.length - 1].slice(0, 7));
  const diasPeriodo = contarDiasHabiles(inicioPeriodo, finPeriodo);

  const promedio3M = totalPanKg / diasPeriodo;
  if (promedio3M <= 0) return RENDIMIENTO_3M_VACIO;

  // Panquecitas agregadas por día, solo del 03-08-2026 en adelante: el gráfico
  // muestra el comportamiento del piloto, no el histórico de referencia.
  // date_of_sale es ISO (YYYY-MM-DD…), así que comparar strings es correcto.
  const kgPorDia = new Map<string, number>();
  for (const r of panq) {
    const dia = r.date_of_sale.slice(0, 10);
    if (dia < RENDIMIENTO_DIARIO_DESDE) continue;
    kgPorDia.set(dia, (kgPorDia.get(dia) ?? 0) + Number(r.quantity_kg));
  }

  const puntos: Rendimiento3MPunto[] = [...kgPorDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, kg]) => ({
      dia,
      label: bucketLabelFor(dia, "day"),
      panquecitasKg: Math.round(kg * 10) / 10,
      ratioPct: Math.round((kg / promedio3M) * 100 * 10) / 10,
    }));

  return {
    promedio3M: Math.round(promedio3M * 10) / 10,
    meta4Pct: Math.round(promedio3M * 0.04 * 10) / 10,
    diasPeriodo,
    desde: inicioPeriodo,
    hasta: finPeriodo,
    totalPanKg: Math.round(totalPanKg * 10) / 10,
    clientesPan: new Set(panFiltrado.map((r) => r.location_id)).size,
    clientesPoblacion: idsPan.size,
    puntos,
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
  universoBySectorAt: (sector: Sector, cierre: string) => number,
  compradorIds: Set<string>,
  granularity: TimeGranularity
): CoberturaComunicacionPoint[] {
  if (relevantRows.length === 0) return [];
  const buckets = Array.from(new Set(relevantRows.map((r) => bucketKeyFor(r.created_at.slice(0, 10), granularity)))).sort();

  const points: CoberturaComunicacionPoint[] = [];
  for (const bucket of buckets) {
    const rowsUpToBucket = relevantRows.filter((r) => bucketKeyFor(r.created_at.slice(0, 10), granularity) <= bucket);

    const point: CoberturaComunicacionPoint = { bucket, label: bucketLabelFor(bucket, granularity) };
    const cierre = bucketEndDate(bucket);
    for (const sector of ["cumana", "barquisimeto_este"] as Sector[]) {
      const sectorRows = rowsUpToBucket.filter((r) => sectorByLocation.get(r.location_id) === sector);

      // Cobertura: visitados sobre la cartera de la zona VIGENTE al cierre del
      // bucket. Con la cartera de hoy, las semanas previas a la ampliación
      // mostrarían una cobertura hundida por PDV que aún no había que visitar.
      const visitados = new Set(sectorRows.map((r) => r.location_id));
      const universoSector = universoBySectorAt(sector, cierre);
      point[`${sector}_cobertura`] = universoSector > 0 ? Math.round((visitados.size / universoSector) * 1000) / 10 : 0;

      // Comunicación (material POP): solo sobre los visitados que ADEMÁS tienen
      // ventas en SAP (Radar > 0).
      const sectorRowsConVenta = sectorRows.filter((r) => compradorIds.has(r.location_id));
      const visitadosConVenta = new Set(sectorRowsConVenta.map((r) => r.location_id));
      const conPop = new Set(sectorRowsConVenta.filter((r) => r.pop_present).map((r) => r.location_id));
      point[`${sector}_comunicacion`] =
        visitadosConVenta.size > 0 ? Math.round((conPop.size / visitadosConVenta.size) * 1000) / 10 : 0;
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

  // Cobertura se mide sobre la cartera TOTAL por zona; la comunicación (material
  // POP) solo sobre los visitados que ADEMÁS tienen ventas en SAP (Radar > 0) —
  // decisión con Alejandro (11-08-2026). Ver computeCoberturaComunicacionPoints.
  const compradorIds = await getCompradorLocationIds();

  // Cartera por zona, pero evaluada a una fecha: el denominador de cobertura
  // crece cuando entra una tanda nueva y no antes. Ver src/lib/cohortes.ts.
  const universoPorSector = new Map<Sector, Location[]>();
  for (const sector of ["cumana", "barquisimeto_este"] as Sector[]) {
    universoPorSector.set(
      sector,
      universo.filter((l) => sectorGroup(l.oficina_venta) === sector)
    );
  }
  const universoBySectorAt = (sector: Sector, cierre: string) =>
    vigentesAl(universoPorSector.get(sector) ?? [], cierre).length;
  const sectorByLocation = new Map(universo.map((l) => [l.id, sectorGroup(l.oficina_venta)]));

  const supabase = createSupabaseServiceClient();
  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("mercaderista_visits")
      .select("location_id, created_at, pop_present")
      .order("created_at")
  );

  const rows = (data ?? []) as { location_id: string; created_at: string; pop_present: boolean }[];
  // Mismo criterio que el denominador: una visita anterior a la incorporación
  // del cliente no cuenta como cobertura de un período en el que ese PDV
  // todavía no era cartera.
  const incorporacionPorId = new Map(universo.map((l) => [l.id, l.fecha_incorporacion ?? null]));
  const relevantRows = rows.filter(
    (r) =>
      sectorByLocation.has(r.location_id) &&
      estabaIncorporado(incorporacionPorId.get(r.location_id), r.created_at.slice(0, 10))
  );
  if (relevantRows.length === 0) return empty;

  return {
    day: computeCoberturaComunicacionPoints(relevantRows, sectorByLocation, universoBySectorAt, compradorIds, "day"),
    week: computeCoberturaComunicacionPoints(relevantRows, sectorByLocation, universoBySectorAt, compradorIds, "week"),
    month: computeCoberturaComunicacionPoints(relevantRows, sectorByLocation, universoBySectorAt, compradorIds, "month"),
  };
}

// ── 6. Detalle de Clientes por Segmento ────────────────────────────
// Segmento = tipo_cliente (decisión #5). %HPM TOTAL / %HPM vs Base:
// ver decisión #12.

/** Cantidad Pedido (kg) por PDV, cruda de Pedidos y Facturado (no de Carga Radar). */
async function getCantidadPedidoTotalsByLocation(productId: string): Promise<Map<string, number>> {
  const supabase = createSupabaseServiceClient();
  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_pedidos_facturados")
      .select("location_id, cantidad_pedido_kg")
      .eq("product_id", productId)
  );

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
  /** Volumen de Panquecitas del segmento (Carga Radar), en toneladas. */
  panquecitasTon: number;
}

// ── 6b. Ranking de Volumen por Segmento (punto 2, 18-08-2026) ──────
// Agrupa por "Segmento de Clientes 2" de la Cartera Consolidada
// (locations.segmento_cliente, migration 016) — NO por tipo_cliente, que es el
// giro del negocio y ya alimenta la tabla Detalle de Clientes.
//
// Métrica principal (ranking, de mayor a menor): volumen total de Panquecitas
// del segmento según Carga Radar.
// Métrica secundaria: promedio de ventas diarias por cliente del segmento =
// volumen total ÷ clientes CON VENTA del segmento ÷ días del período con Radar.
// Se divide entre los clientes con venta (no la cartera completa del segmento)
// para que el promedio describa a quien efectivamente compra; los días son los
// del rango cubierto por el Radar cargado, de la primera a la última fecha.

export interface RankingSegmentoRow {
  segmento: string;
  volumenKg: number;
  volumenTon: number;
  /** Clientes del segmento con Radar > 0. */
  clientesConVenta: number;
  /** Clientes del segmento en la cartera (con o sin venta). */
  clientesCartera: number;
  /** Volumen ÷ clientes con venta ÷ días del período (kg/día/cliente). */
  promedioDiarioPorCliente: number;
}

export async function getRankingVolumenPorSegmento(sector?: Sector): Promise<RankingSegmentoRow[]> {
  const universoTotal = await getUniverseLocations();
  const delSector = sector ? universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector) : universoTotal;
  const universo = vigentesAl(delSector, todayISO());
  if (universo.length === 0) return [];

  const panqRadarTotals = await getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS);

  // Días del período: DÍAS HÁBILES desde el 03-08-2026 (mismo arranque que el
  // gráfico de rendimiento diario) hasta la última fecha con Radar de
  // Panquecitas. Hábiles porque el producto se despacha de lunes a viernes.
  const supabase = createSupabaseServiceClient();
  const fechasData = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("date_of_sale")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("quantity_kg", 0)
      .gte("date_of_sale", RENDIMIENTO_DIARIO_DESDE)
      .order("date_of_sale", { ascending: true })
  );

  const fechas = ((fechasData ?? []) as { date_of_sale: string }[]).map((r) => r.date_of_sale.slice(0, 10));
  const diasPeriodo =
    fechas.length > 0 ? contarDiasHabiles(RENDIMIENTO_DIARIO_DESDE, fechas[fechas.length - 1]) : 1;

  const bySegmento = new Map<string, Location[]>();
  for (const l of universo) {
    const seg = l.segmento_cliente?.trim() || "Sin segmento";
    if (!bySegmento.has(seg)) bySegmento.set(seg, []);
    bySegmento.get(seg)!.push(l);
  }

  const rows: RankingSegmentoRow[] = [];
  for (const [segmento, locs] of bySegmento.entries()) {
    const volumenKg = locs.reduce((s, l) => s + (panqRadarTotals.get(l.id) ?? 0), 0);
    const conVenta = locs.filter((l) => (panqRadarTotals.get(l.id) ?? 0) > 0).length;

    rows.push({
      segmento,
      volumenKg: Math.round(volumenKg * 10) / 10,
      volumenTon: Math.round((volumenKg / 1000) * 100) / 100,
      clientesConVenta: conVenta,
      clientesCartera: locs.length,
      promedioDiarioPorCliente:
        conVenta > 0 ? Math.round((volumenKg / conVenta / diasPeriodo) * 100) / 100 : 0,
    });
  }

  return rows.sort((a, b) => b.volumenKg - a.volumenKg);
}

export async function getDetalleClientesPorSegmento(sector?: Sector): Promise<DetalleSegmentoRow[]> {
  const universoTotal = await getUniverseLocations();
  const delSector = sector ? universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector) : universoTotal;
  // Tabla de "ahora mismo": solo los clientes ya incorporados a la fecha.
  const universo = vigentesAl(delSector, todayISO());
  if (universo.length === 0) return [];

  // Penetración: clientes con Radar > 0 (Carga Radar — no Pedidos y
  // Facturado). Volumen HPM vs Base: Cantidad Pedido de Panquecitas,
  // cruda de Pedidos y Facturado.
  const panqRadarTotals = await getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS);
  const panqPedidoTotals = await getCantidadPedidoTotalsByLocation(PRODUCT_IDS.PANQUECITAS);
  const hmpTotals = await getSellInTotalsByLocation(PRODUCT_IDS.HARINA_PAN);
  const denomPenetracion = universo.length;

  const supabase = createSupabaseServiceClient();
  const data = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("location_id, date_of_sale")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("quantity_kg", 0)
  );

  const salesRows = (data ?? []) as { location_id: string; date_of_sale: string }[];
  // Recompra de esta tabla (Detalle por segmento) = clientes con Radar en ≥2
  // MESES distintos ÷ clientes con ≥1 compra. Es un rate por CLIENTE y sigue
  // usando meses (sap_sell_in_records ya está colapsado por mes). Es distinto
  // de la recompra del gráfico combinado (esa es por fechas, ver
  // radar_ventas_fechas / computeVentaRecompraActivacionPoints).
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
    // Volumen de Panquecitas del segmento por Carga Radar — la métrica de volumen
    // de DIENN (lo confirmado en anaquel), no la Cantidad Pedido que usa hpmVsBasePct.
    const segPanqRadarKg = locs.reduce((s, l) => s + (panqRadarTotals.get(l.id) ?? 0), 0);

    rows.push({
      segmento,
      // % Penetración = clientes con Radar > 0 del segmento / universo vigente
      penetracionPct:
        denomPenetracion > 0 ? Math.round((facturados.length / denomPenetracion) * 1000) / 10 : 0,
      // Tasa de Recompra = repetidores / clientes con ≥1 compra confirmada por Radar
      recompraPct: facturados.length > 0 ? Math.round((conRecompra.length / facturados.length) * 1000) / 10 : 0,
      hpmVsBasePct: segHmpKg > 0 ? Math.round((segPanqKg / segHmpKg) * 1000) / 10 : 0,
      hpmTotalPct: universoTotalHmpKg > 0 ? Math.round((segHmpKg / universoTotalHmpKg) * 1000) / 10 : 0,
      panquecitasTon: Math.round((segPanqRadarKg / 1000) * 100) / 100,
    });
  }

  // Ordenado por volumen de Panquecitas: el segmento que más vende queda arriba.
  return rows.sort((a, b) => b.panquecitasTon - a.panquecitasTon);
}

// ── 7. Tasa de conversión en degustaciones (sistema de tickets) ───
// Ver migración 004: samples_given/conversions_tracked se renombraron a
// tickets_entregados/tickets_recibidos (sistema de tickets físicos).

export interface ConversionDegustaciones {
  samples: number;
  conversions: number;
  rate: number;
}

export async function getConversionDegustaciones(sector?: Sector): Promise<ConversionDegustaciones> {
  const supabase = createSupabaseServiceClient();

  const { data } = await supabase
    .from("promotion_activities")
    .select("location_id, tickets_entregados, tickets_recibidos");

  let rows = (data ?? []) as { location_id: string; tickets_entregados: number; tickets_recibidos: number }[];
  // Por ciudad: solo las degustaciones de PDV del universo de ese sector.
  if (sector) {
    const ids = await getUniverseLocationIds(sector);
    rows = rows.filter((r) => ids.has(r.location_id));
  }
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
  const [pedidoFacturadoData, radarData] = await Promise.all([
    fetchAllRows<unknown>(() =>
      supabase
        .from("sap_pedidos_facturados")
        .select("location_id, cantidad_pedido_kg, cantidad_facturada_kg, fecha")
        .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    ),
    fetchAllRows<unknown>(() =>
      supabase
        .from("sap_sell_in_records")
        .select("location_id, quantity_kg, date_of_sale")
        .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    ),
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
// tienda queda en/bajo el umbral de stock out. "En tienda" = anaquel +
// depósito; si el mercaderista no tuvo acceso al depósito, solo anaquel. Se usa
// la última visita por PDV. La lista incluye la ubicación (anaquel) donde se
// encontró/debe ir el producto.
//
// El umbral depende del modelo de atención (esquema_atencion de SAP): modelo
// DIRECTO (y Mixto/otros) → ≤ 3 unidades; modelo INDIRECTO → ≤ 2 unidades
// (decisión con Alejandro, 11-08-2026).

export const STOCK_OUT_UMBRAL_DIENN = 3;
export const STOCK_OUT_UMBRAL_INDIRECTO = 2;

/** true si el PDV es de modelo Indirecto según su esquema de atención de SAP. */
function esModeloIndirecto(loc: { esquema_atencion?: string | null } | undefined): boolean {
  return stripAccents((loc?.esquema_atencion ?? "").toLowerCase()).includes("indirecto");
}

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
  const delSector = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
  const universoFiltrado = vigentesAl(delSector, todayISO());
  const ids = new Set(universoFiltrado.map((l) => l.id));
  if (ids.size === 0) return empty;

  const supabase = createSupabaseServiceClient();

  // Compradores = Radar de Panquecitas > 0 dentro del universo del corte.
  const sellInData = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("location_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("quantity_kg", 0)
  );
  const compradorIds = new Set(
    ((sellInData ?? []) as { location_id: string }[]).map((r) => r.location_id).filter((id) => ids.has(id))
  );
  if (compradorIds.size === 0) return empty;

  // Última visita por PDV comprador.
  const visitsData = await fetchAllRows<unknown>(() =>
    supabase
      .from("mercaderista_visits")
      .select("id, location_id, created_at, deposit_access, total_units_anaquel, product_location, product_location_other")
      .order("created_at", { ascending: false })
  );

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
    const auditsData = await fetchAllRowsChunked<unknown>(
      (lote) =>
      supabase
        .from("inventory_audits")
        .select("visit_id, variant_id, quantity")
        .eq("zone", "BODEGA")
          .in("visit_id", lote)
        ,
      visitIds
    );
    for (const a of (auditsData ?? []) as { visit_id: string; variant_id: string; quantity: number }[]) {
      const unidades = a.quantity * (unitsPerBulk.get(a.variant_id) ?? 1);
      unidadesDepositoByVisit.set(a.visit_id, (unidadesDepositoByVisit.get(a.visit_id) ?? 0) + unidades);
    }
  }

  const locById = new Map(universoFiltrado.map((l) => [l.id, l]));
  const clientes: StockOutClientePoint[] = [];
  for (const [locId, v] of lastVisit) {
    const loc = locById.get(locId);
    const anaquel = v.total_units_anaquel ?? 0;
    const deposito = v.deposit_access ? unidadesDepositoByVisit.get(v.id) ?? 0 : 0;
    const unidadesTienda = anaquel + deposito;
    const umbral = esModeloIndirecto(loc) ? STOCK_OUT_UMBRAL_INDIRECTO : STOCK_OUT_UMBRAL_DIENN;
    if (unidadesTienda <= umbral) {
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
// Ratio = clientes con preciador (pop_price_tag) / clientes VISITADOS con
// VENTAS EN SAP (Radar > 0), de la última visita del mercaderista. Decisión
// con Alejandro (11-08-2026): la población pasa a ser el cliente real (el que
// compra), sin exigir presencia del producto.

export interface MaterialPopPreciadorResult {
  ratio: number;
  conPreciador: number;
  /** Denominador: clientes visitados con ventas en SAP (Radar > 0). */
  poblacion: number;
}

export async function getMaterialPopPreciador(sector?: Sector): Promise<MaterialPopPreciadorResult> {
  const empty: MaterialPopPreciadorResult = { ratio: 0, conPreciador: 0, poblacion: 0 };
  const ids = await getUniverseLocationIds(sector);
  if (ids.size === 0) return empty;
  const compradorIds = await getCompradorLocationIds();

  const supabase = createSupabaseServiceClient();
  const visitsData = await fetchAllRows<unknown>(() =>
    supabase
      .from("mercaderista_visits")
      .select("location_id, created_at, pop_price_tag")
      .order("created_at", { ascending: false })
  );

  type Visita = { location_id: string; pop_price_tag: boolean | null };
  const lastVisit = new Map<string, Visita>();
  for (const v of (visitsData ?? []) as Visita[]) {
    // Solo clientes del universo del corte que además tienen ventas en SAP.
    if (!ids.has(v.location_id) || !compradorIds.has(v.location_id)) continue;
    if (!lastVisit.has(v.location_id)) lastVisit.set(v.location_id, v);
  }

  let poblacion = 0;
  let conPreciador = 0;
  for (const v of lastVisit.values()) {
    poblacion++;
    if (v.pop_price_tag === true) conPreciador++;
  }

  return {
    conPreciador,
    poblacion,
    ratio: poblacion > 0 ? Math.round((conPreciador / poblacion) * 1000) / 10 : 0,
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

// Consolida el texto libre de "otra categoría" en categorías fijas del
// anaquel. El mercaderista lo escribe a mano, así que se normaliza a
// minúsculas y sin acentos antes de buscar palabras clave. Si no calza con
// ninguna, se conserva el texto tal cual (una categoría propia).
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function agruparCategoriaAnaquel(raw: string): string {
  const t = stripAccents(raw.toLowerCase());
  const has = (...kws: string[]) => kws.some((k) => t.includes(k));
  // Coincidencia por palabra completa: para tokens cortos (ej. "pan") que si
  // no, aparecerían como subcadena dentro de otras palabras ("acompaña" →
  // "acompana" contiene "pan") y ensuciarían la categoría.
  const hasWord = (...kws: string[]) => kws.some((k) => new RegExp(`\\b${k}\\b`).test(t));
  //
  // ── Cómo categorizar (leer antes de agregar palabras nuevas) ─────────────
  // El mercaderista escribe el texto a mano; se normaliza a minúsculas y sin
  // acentos y se busca por palabra clave. El ORDEN importa: gana la primera
  // categoría que calce. Al entrar una palabra nueva, métela en el grupo que
  // corresponda de abajo (o crea uno nuevo manteniendo el orden de prioridad).
  //
  // 1) Ubicaciones físicas (no son categorías de producto): máxima prioridad.
  if (has("mostrador", "caja")) return "Caja";
  if (has("entrada")) return "Entrada"; // "entrada", "frente a la entrada", "en la entrada"…
  // 2) Categorías de producto vecinas.
  if (has("harina pan", "harina de maiz") || hasWord("pan")) return "Harina PAN";
  if (has("crema de arroz", "leche", "avena", "cereal") || hasWord("arroz"))
    return "Leche, Crema de arroz y Cereales";
  if (has("chocolate", "nucita", "chucheria", "galleta", "dulce")) return "Dulces/ Chucherías";
  if (has("margarita", "enlatados", "rikesa", "endiablado", "atun")) return "Enlatados";
  if (has("jugos")) return "Jugos";
  if (has("margarina", "mantequilla", "mavesa")) return "Mavesa";
  return raw.trim();
}

export async function getPosicionPdv(sector?: Sector): Promise<PosicionPdvPoint[]> {
  const ids = await getUniverseLocationIds(sector);
  if (ids.size === 0) return [];

  const supabase = createSupabaseServiceClient();
  const visitsData = await fetchAllRows<unknown>(() =>
    supabase
      .from("mercaderista_visits")
      .select("location_id, created_at, product_present, product_location, product_location_other")
      .order("created_at", { ascending: false })
  );

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

  // "Junto a harina de trigo" es una categoría fija; "otra categoría" se
  // desglosa por lo que escribió a mano el mercaderista en
  // product_location_other, pero ese texto libre genera decenas de barras
  // casi-duplicadas ("Atún Margarita", "jugos naturales", "mantequilla
  // Mavesa"…). Se consolidan en categorías fijas por palabra clave (ver
  // agruparCategoriaAnaquel).
  const HARINA_TRIGO = "Junto a harina de trigo";
  const counts = new Map<string, number>();
  const add = (categoria: string) => counts.set(categoria, (counts.get(categoria) ?? 0) + 1);

  for (const v of lastVisit.values()) {
    if (v.product_present !== true || !v.product_location) continue;
    if (v.product_location.includes("HARINA_TRIGO")) add(HARINA_TRIGO);
    if (v.product_location.includes("OTRA_CATEGORIA")) {
      const especifica = v.product_location_other?.trim();
      add(especifica && especifica.length > 0 ? agruparCategoriaAnaquel(especifica) : "Otra categoría (sin especificar)");
    }
  }

  return Array.from(counts.entries())
    .map(([categoria, clientes]) => ({ categoria, clientes }))
    // Harina de trigo primero; el resto por cantidad de clientes desc.
    .sort((a, b) =>
      a.categoria === HARINA_TRIGO ? -1 : b.categoria === HARINA_TRIGO ? 1 : b.clientes - a.clientes
    );
}

// ── 11b. Posición en PDV por cliente (para cruzar con Sell-Out) ─────
// Categorías de posición de la última visita, por cliente. El gráfico de
// "Sell-Out por posición en PDV" cruza esto (client-side) con el Sell-Out
// por cliente ya filtrado, para ver qué ubicación genera más venta. No se
// filtra por sector aquí: el cruce con el Sell-Out (ya filtrado) lo acota.

export interface PosicionClienteRow {
  locationId: string;
  categorias: string[];
}

export async function getPosicionPorCliente(): Promise<PosicionClienteRow[]> {
  const supabase = createSupabaseServiceClient();
  const visitsData = await fetchAllRows<unknown>(() =>
    supabase
      .from("mercaderista_visits")
      .select("location_id, created_at, product_present, product_location, product_location_other")
      .order("created_at", { ascending: false })
  );

  type Visita = {
    location_id: string;
    product_present: boolean;
    product_location: string[] | null;
    product_location_other: string | null;
  };
  const lastVisit = new Map<string, Visita>();
  for (const v of (visitsData ?? []) as Visita[]) {
    if (!lastVisit.has(v.location_id)) lastVisit.set(v.location_id, v);
  }

  const HARINA_TRIGO = "Junto a harina de trigo";
  const rows: PosicionClienteRow[] = [];
  for (const [locationId, v] of lastVisit) {
    if (v.product_present !== true || !v.product_location) continue;
    const categorias: string[] = [];
    if (v.product_location.includes("HARINA_TRIGO")) categorias.push(HARINA_TRIGO);
    if (v.product_location.includes("OTRA_CATEGORIA")) {
      const especifica = v.product_location_other?.trim();
      categorias.push(
        especifica && especifica.length > 0 ? agruparCategoriaAnaquel(especifica) : "Otra categoría (sin especificar)"
      );
    }
    if (categorias.length > 0) rows.push({ locationId, categorias });
  }
  return rows;
}

// ── 12. Cartera por ciudad × modelo (volumen Radar + efectividad) ───
// Para los gráficos de "cartera de clientes actuales por Radar, separada por
// modelo y ciudad". Ciudad = sector piloto (Cumaná / Cabudare = Barquisimeto
// Este). Modelo = esquema_atencion (Directo / Indirecto). Por cada bucket de
// tiempo (día/semana/mes):
//   - radarKg  → volumen Radar de Panquecitas REGISTRADO en ese bucket
//     (date_of_sale), por segmento.
//   - activos / facturados → clientes ACUMULADOS hasta ese bucket con Radar >
//     0 (activos) o con facturado > 0 (facturados). La efectividad es
//     activos/cartera y facturados/cartera (un cliente activado lo sigue
//     estando, por eso es acumulado).
//   - cartera → total de clientes del segmento (estático).

const CIUDAD_POR_SECTOR: Record<Sector, string> = {
  cumana: "Cumaná",
  barquisimeto_este: "Cabudare",
};

// ── 12. Precio Correcto (PVP capturado en campo vs. objetivo por ciudad) ──
// Compara el precio de anaquel de la última visita (mercaderista_visits, en USD)
// contra el PVP objetivo de la ciudad (PVP_TARGETS). Cada fila es una
// presentación evaluable (400g/800g) de un PDV, con su dirección de desviación.
export type EstadoPrecio = "SUBPRECIO" | "CORRECTO" | "SOBREPRECIO";

export interface PrecioCorrectoRow {
  locationId: string;
  cliente: string;
  ciudad: string;
  presentacion: "400g" | "800g";
  precio: number; // USD reportado en campo
  target: number; // USD objetivo de la ciudad
  estado: EstadoPrecio;
}

function clasificarPrecio(observado: number, target: number): EstadoPrecio {
  if (Math.abs(observado - target) <= PVP_TOLERANCE) return "CORRECTO";
  return observado > target ? "SOBREPRECIO" : "SUBPRECIO";
}

export async function getPrecioCorrecto(): Promise<PrecioCorrectoRow[]> {
  const universo = vigentesAl(await getUniverseLocations(), todayISO());
  if (universo.length === 0) return [];

  const supabase = createSupabaseServiceClient();
  const visitsData = await fetchAllRows<unknown>(() =>
    supabase
      .from("mercaderista_visits")
      .select("location_id, created_at, price_400, price_400_na, price_800, price_800_na")
      .order("created_at", { ascending: false })
  );

  type Visita = {
    location_id: string;
    created_at: string;
    price_400: number | null;
    price_400_na: boolean | null;
    price_800: number | null;
    price_800_na: boolean | null;
  };
  // Última visita por PDV (orden desc → la primera que se ve es la más reciente).
  const lastVisit = new Map<string, Visita>();
  for (const v of (visitsData ?? []) as Visita[]) {
    if (!lastVisit.has(v.location_id)) lastVisit.set(v.location_id, v);
  }

  // Precio capturado en Bs por error (> 100) → USD con la tasa del día de la
  // visita (ver src/lib/bcv.ts), para no clasificarlo como sobreprecio.
  const rateAt = await getBcvRateLookup();

  const rows: PrecioCorrectoRow[] = [];
  for (const l of universo) {
    const sector = sectorGroup(l.oficina_venta);
    if (!sector) continue; // fuera de las ciudades piloto → sin objetivo, no evaluable
    const ciudad = CIUDAD_POR_SECTOR[sector];
    const target = PVP_TARGETS[sector];
    const v = lastVisit.get(l.id);
    if (!v) continue;

    const precio400 = precioVisitaEnUsd(v.price_400, v.created_at, rateAt);
    const precio800 = precioVisitaEnUsd(v.price_800, v.created_at, rateAt);

    if (!v.price_400_na && precio400 != null) {
      rows.push({
        locationId: l.id,
        cliente: l.name,
        ciudad,
        presentacion: "400g",
        precio: precio400,
        target: target.p400,
        estado: clasificarPrecio(precio400, target.p400),
      });
    }
    if (!v.price_800_na && precio800 != null) {
      rows.push({
        locationId: l.id,
        cliente: l.name,
        ciudad,
        presentacion: "800g",
        precio: precio800,
        target: target.p800,
        estado: clasificarPrecio(precio800, target.p800),
      });
    }
  }
  return rows;
}

/** "YYYY-MM-DD" → día ISO de la semana (1=Lunes … 7=Domingo), en UTC (determinista). */
function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom … 6=Sáb
  return wd === 0 ? 7 : wd;
}

/** "1,3,5" → Set{1,3,5} (días ISO del plan de visita). */
function planSet(dias: string | null): Set<number> {
  const s = new Set<number>();
  if (!dias) return s;
  for (const p of dias.split(",")) {
    const n = Number(p.trim());
    if (n >= 1 && n <= 7) s.add(n);
  }
  return s;
}

const TODOS_LOS_DIAS = new Set([1, 2, 3, 4, 5, 6, 7]);

export interface CarteraSegmentoPunto {
  segmento: string; // "Cumaná Directo"
  ciudad: string;
  modelo: string; // Directo / Indirecto / Mixto (columna "Directo o Indirecto" de la cartera)
  radarKg: number;
  cartera: number; // clientes del segmento incorporados al cierre del bucket
  programados: number; // clientes incorporados que tocaba visitar en el bucket (denominador)
  activos: number;
  facturados: number;
  pedidos: number;
  efectividadActivos: number; // activos / programados (%)
  efectividadFacturados: number; // facturados / programados (%)
  efectividadPedidos: number; // pedidos / programados (%)
}

export interface CarteraSegmentoBucket {
  bucket: string;
  label: string;
  puntos: CarteraSegmentoPunto[];
}

export interface CarteraTotalDiaPunto {
  dia: string; // "YYYY-MM-DD" (día) o clave del bucket (semana/mes)
  label: string;
  radarKgDia: number; // volumen Radar del período (kg del bucket, NO acumulado)
  radarKgDiaDirecto: number; // parte del volumen del período del modelo Directo
  radarKgDiaIndirecto: number; // parte del volumen del período del modelo Indirecto
  programados: number; // clientes que tocaba visitar ese período (denominador)
  activos: number;
  facturados: number;
  pedidos: number;
  efectividadActivos: number;
  efectividadFacturados: number;
  efectividadPedidos: number;
  // Activación acumulada por Radar, separada por modelo (series opcionales del gráfico).
  efectividadDirecto: number; // activos Radar Directo / a visitar Directo (%)
  efectividadIndirecto: number; // activos Radar Indirecto / a visitar Indirecto (%)
  // Modo "acumulado": clientes activos acumulados / cartera total del scope
  // (como la tarjeta de activación de cliente). Denominador = cartera total.
  efectividadActivosAcum: number;
  efectividadFacturadosAcum: number;
  efectividadPedidosAcum: number;
  efectividadDirectoAcum: number;
  efectividadIndirectoAcum: number;
}

export interface CarteraSegmentoResult {
  segmentos: Record<TimeGranularity, CarteraSegmentoBucket[]>;
  totalPorDia: Record<TimeGranularity, CarteraTotalDiaPunto[]>;
  // Mismo total acumulado pero acotado a cada sector (Cumaná / Cabudare), para
  // comparar ciudad contra ciudad con las mismas funcionalidades.
  totalPorSector: Record<Sector, Record<TimeGranularity, CarteraTotalDiaPunto[]>>;
}

// Claves de Sector (no las etiquetas de PILOT_SECTORS: "Cumaná" / "Barquisimeto Este").
// segKey y totalPorSector usan "cumana" | "barquisimeto_este".
const SECTOR_KEYS: Sector[] = ["cumana", "barquisimeto_este"];

export async function getCarteraPorSegmento(): Promise<CarteraSegmentoResult> {
  const emptyGran = (): Record<TimeGranularity, CarteraTotalDiaPunto[]> => ({ day: [], week: [], month: [] });
  const empty: CarteraSegmentoResult = {
    segmentos: { day: [], week: [], month: [] },
    totalPorDia: emptyGran(),
    totalPorSector: SECTOR_KEYS.reduce(
      (acc, s) => ({ ...acc, [s]: emptyGran() }),
      {} as Record<Sector, Record<TimeGranularity, CarteraTotalDiaPunto[]>>
    ),
  };
  const universo = await getUniverseLocations();
  if (universo.length === 0) return empty;

  // fecha_incorporacion viaja con cada cliente: es lo que permite responder
  // "¿este cliente ya era cartera en este bucket?" tanto para el denominador
  // (a visitar / cartera total) como para el numerador (activos, facturados,
  // pedidos). Ver src/lib/cohortes.ts.
  type Cli = { locId: string; segKey: string; plan: Set<number>; fecha_incorporacion: string | null };
  const clientes: Cli[] = [];
  const segMeta = new Map<string, { ciudad: string; modelo: string }>();
  const carteraCount = new Map<string, number>();
  const clientesBySeg = new Map<string, Cli[]>();
  for (const l of universo) {
    const sector = sectorGroup(l.oficina_venta);
    if (!sector) continue;
    // Modelo de la cartera (columna "Directo o Indirecto"). Los Mixto cuentan
    // como Directo (decisión con Alejandro): solo Indirecto vs Directo.
    const modelo = esModeloIndirecto(l) ? "Indirecto" : "Directo";
    const segKey = `${sector}|${modelo}`;
    const cli: Cli = {
      locId: l.id,
      segKey,
      plan: planSet(l.dias_visita),
      fecha_incorporacion: l.fecha_incorporacion ?? null,
    };
    clientes.push(cli);
    segMeta.set(segKey, { ciudad: CIUDAD_POR_SECTOR[sector], modelo });
    carteraCount.set(segKey, (carteraCount.get(segKey) ?? 0) + 1);
    if (!clientesBySeg.has(segKey)) clientesBySeg.set(segKey, []);
    clientesBySeg.get(segKey)!.push(cli);
  }
  if (clientes.length === 0) return empty;

  const segByLoc = new Map(clientes.map((c) => [c.locId, c.segKey]));
  const locSet = new Set(clientes.map((c) => c.locId));
  const incorporacionPorLoc = new Map(clientes.map((c) => [c.locId, c.fecha_incorporacion]));

  const supabase = createSupabaseServiceClient();
  const radarData = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("location_id, quantity_kg, date_of_sale")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
  );
  const factData = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_pedidos_facturados")
      .select("location_id, fecha")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("cantidad_facturada_kg", 0)
  );
  const pedidoData = await fetchAllRows<unknown>(() =>
    supabase
      .from("sap_pedidos_facturados")
      .select("location_id, fecha")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("cantidad_pedido_kg", 0)
  );

  // Además de pertenecer a la cartera, la venta tiene que ser POSTERIOR a la
  // incorporación del cliente: si no, un cliente de una tanda nueva con
  // histórico previo aparecería activo en buckets donde no está en el
  // denominador, y la efectividad podría pasar del 100%.
  const yaEraCartera = (locId: string, fecha: string) =>
    locSet.has(locId) && estabaIncorporado(incorporacionPorLoc.get(locId), fecha.slice(0, 10));

  const radar = ((radarData ?? []) as { location_id: string; quantity_kg: number; date_of_sale: string }[]).filter(
    (r) => yaEraCartera(r.location_id, r.date_of_sale)
  );
  const fact = ((factData ?? []) as { location_id: string; fecha: string }[]).filter((r) =>
    yaEraCartera(r.location_id, r.fecha)
  );
  const pedido = ((pedidoData ?? []) as { location_id: string; fecha: string }[]).filter((r) =>
    yaEraCartera(r.location_id, r.fecha)
  );

  // Segmentos ordenados: por ciudad y luego Directo antes que Indirecto.
  const segKeys = [...carteraCount.keys()].sort((a, b) => {
    const sa = segMeta.get(a)!;
    const sb = segMeta.get(b)!;
    return sa.ciudad === sb.ciudad ? sa.modelo.localeCompare(sb.modelo) : sa.ciudad.localeCompare(sb.ciudad);
  });

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  // "A visitar" en un bucket = clientes con día de visita programado dentro
  // del período Y ya incorporados a la cartera al cierre de ese período. Sin
  // la segunda condición, los clientes de las tandas nuevas contarían como
  // "tocaba visitarlos y no se visitaron" en semanas en las que ni siquiera
  // eran clientes, hundiendo la efectividad histórica.
  const programadosEn = (clis: Cli[], covered: Set<number>, cierre: string) =>
    clis.filter(
      (c) => [...c.plan].some((w) => covered.has(w)) && estabaIncorporado(c.fecha_incorporacion, cierre)
    );

  // ── Gráficos por segmento (barras Radar del bucket; efectividad acumulada) ──
  function buildSegmentos(granularity: TimeGranularity): CarteraSegmentoBucket[] {
    const radarByBucket = new Map<string, { locId: string; kg: number }[]>();
    for (const r of radar) {
      const b = bucketKeyFor(r.date_of_sale.slice(0, 10), granularity);
      if (!radarByBucket.has(b)) radarByBucket.set(b, []);
      radarByBucket.get(b)!.push({ locId: r.location_id, kg: r.quantity_kg });
    }
    const factByBucket = new Map<string, string[]>();
    for (const r of fact) {
      const b = bucketKeyFor(r.fecha.slice(0, 10), granularity);
      if (!factByBucket.has(b)) factByBucket.set(b, []);
      factByBucket.get(b)!.push(r.location_id);
    }
    const pedidoByBucket = new Map<string, string[]>();
    for (const r of pedido) {
      const b = bucketKeyFor(r.fecha.slice(0, 10), granularity);
      if (!pedidoByBucket.has(b)) pedidoByBucket.set(b, []);
      pedidoByBucket.get(b)!.push(r.location_id);
    }
    const buckets = Array.from(
      new Set([...radarByBucket.keys(), ...factByBucket.keys(), ...pedidoByBucket.keys()])
    ).sort();
    if (buckets.length === 0) return [];

    const radarCum = new Set<string>();
    const factCum = new Set<string>();
    const pedidoCum = new Set<string>();
    const out: CarteraSegmentoBucket[] = [];
    for (const b of buckets) {
      const radarKgSeg = new Map<string, number>();
      for (const r of radarByBucket.get(b) ?? []) {
        radarKgSeg.set(segByLoc.get(r.locId)!, (radarKgSeg.get(segByLoc.get(r.locId)!) ?? 0) + r.kg);
        radarCum.add(r.locId);
      }
      for (const locId of factByBucket.get(b) ?? []) factCum.add(locId);
      for (const locId of pedidoByBucket.get(b) ?? []) pedidoCum.add(locId);
      // día → solo ese día de la semana; semana/mes → cualquier día programado.
      const covered = granularity === "day" ? new Set([isoWeekday(b)]) : TODOS_LOS_DIAS;
      const cierre = bucketEndDate(b);
      const puntos: CarteraSegmentoPunto[] = segKeys.map((key) => {
        const meta = segMeta.get(key)!;
        const prog = programadosEn(clientesBySeg.get(key) ?? [], covered, cierre);
        const activos = prog.filter((c) => radarCum.has(c.locId)).length;
        const facturados = prog.filter((c) => factCum.has(c.locId)).length;
        const pedidos = prog.filter((c) => pedidoCum.has(c.locId)).length;
        return {
          segmento: `${meta.ciudad} ${meta.modelo}`,
          ciudad: meta.ciudad,
          modelo: meta.modelo,
          radarKg: Math.round((radarKgSeg.get(key) ?? 0) * 10) / 10,
          // Cartera del segmento vigente al cierre del bucket, no el total de
          // hoy: si no, un bucket de agosto mostraría la cartera ampliada.
          cartera: vigentesAl(clientesBySeg.get(key) ?? [], cierre).length,
          programados: prog.length,
          activos,
          facturados,
          pedidos,
          efectividadActivos: pct(activos, prog.length),
          efectividadFacturados: pct(facturados, prog.length),
          efectividadPedidos: pct(pedidos, prog.length),
        };
      });
      out.push({ bucket: b, label: bucketLabelFor(b, granularity), puntos });
    }
    return out;
  }

  // ── Total acumulado (ambas ciudades y modelos): kg acumulado + efectividad ──
  // Un punto por bucket de la granularidad elegida (día/semana/mes). Las
  // efectividades son acumuladas hasta el bucket; las series por modelo usan
  // activación por Radar (activos) separada Directo / Indirecto.
  function buildTotalAcumulado(granularity: TimeGranularity, sector?: Sector): CarteraTotalDiaPunto[] {
    // Acota a un sector (o al universo completo si no se pasa sector).
    const clientesScope = sector ? clientes.filter((c) => c.segKey.startsWith(`${sector}|`)) : clientes;
    const locScope = new Set(clientesScope.map((c) => c.locId));
    const radarScope = sector ? radar.filter((r) => locScope.has(r.location_id)) : radar;
    const factScope = sector ? fact.filter((r) => locScope.has(r.location_id)) : fact;
    const pedidoScope = sector ? pedido.filter((r) => locScope.has(r.location_id)) : pedido;

    const radarByBucket = new Map<string, { locId: string; kg: number }[]>();
    for (const r of radarScope) {
      const b = bucketKeyFor(r.date_of_sale.slice(0, 10), granularity);
      if (!radarByBucket.has(b)) radarByBucket.set(b, []);
      radarByBucket.get(b)!.push({ locId: r.location_id, kg: r.quantity_kg });
    }
    const factByBucket = new Map<string, string[]>();
    for (const r of factScope) {
      const b = bucketKeyFor(r.fecha.slice(0, 10), granularity);
      if (!factByBucket.has(b)) factByBucket.set(b, []);
      factByBucket.get(b)!.push(r.location_id);
    }
    const pedidoByBucket = new Map<string, string[]>();
    for (const r of pedidoScope) {
      const b = bucketKeyFor(r.fecha.slice(0, 10), granularity);
      if (!pedidoByBucket.has(b)) pedidoByBucket.set(b, []);
      pedidoByBucket.get(b)!.push(r.location_id);
    }
    const buckets = Array.from(
      new Set([...radarByBucket.keys(), ...factByBucket.keys(), ...pedidoByBucket.keys()])
    ).sort();
    // Cartera del scope (denominador del modo "acumulado": clientes activos
    // acumulados ÷ cartera, IGUAL que la tarjeta de activación de cliente).
    // Ya no es un número fijo: se evalúa al cierre de cada bucket, porque la
    // cartera creció el 14-08 y el 24-08-2026. Así la línea acumulada sigue
    // aterrizando en el % de la tarjeta, pero sin reescribir hacia atrás los
    // puntos de las semanas en que la cartera era más chica.
    const clientesScopeDir = clientesScope.filter((c) => c.segKey.endsWith("|Directo"));
    const clientesScopeInd = clientesScope.filter((c) => c.segKey.endsWith("|Indirecto"));
    // Modelo por cliente del scope, para separar el volumen Radar del período.
    const esDirectoLoc = new Map(clientesScope.map((c) => [c.locId, c.segKey.endsWith("|Directo")]));
    const radarCum = new Set<string>();
    const factCum = new Set<string>();
    const pedidoCum = new Set<string>();
    return buckets.map((b) => {
      // Volumen Radar del período (kg del bucket, NO acumulado). El set radarCum
      // sí se acumula porque alimenta la efectividad/activación acumulada.
      let kgBucket = 0;
      let kgBucketDir = 0;
      let kgBucketInd = 0;
      for (const r of radarByBucket.get(b) ?? []) {
        kgBucket += r.kg;
        if (esDirectoLoc.get(r.locId)) kgBucketDir += r.kg;
        else if (esDirectoLoc.has(r.locId)) kgBucketInd += r.kg;
        radarCum.add(r.locId);
      }
      for (const locId of factByBucket.get(b) ?? []) factCum.add(locId);
      for (const locId of pedidoByBucket.get(b) ?? []) pedidoCum.add(locId);
      // día → solo ese día de la semana; semana/mes → cualquier día programado.
      const covered = granularity === "day" ? new Set([isoWeekday(b)]) : TODOS_LOS_DIAS;
      const cierre = bucketEndDate(b);
      const prog = programadosEn(clientesScope, covered, cierre);
      const activos = prog.filter((c) => radarCum.has(c.locId)).length;
      const facturados = prog.filter((c) => factCum.has(c.locId)).length;
      const pedidos = prog.filter((c) => pedidoCum.has(c.locId)).length;
      // Activación por Radar separada por modelo (segKey = `${sector}|${modelo}`).
      const progDir = prog.filter((c) => c.segKey.endsWith("|Directo"));
      const progInd = prog.filter((c) => c.segKey.endsWith("|Indirecto"));
      const activosDir = progDir.filter((c) => radarCum.has(c.locId)).length;
      const activosInd = progInd.filter((c) => radarCum.has(c.locId)).length;
      // Modo "acumulado": clientes activos acumulados ÷ cartera del scope
      // (todos los clientes, no solo los programados). Numerador y denominador
      // se recortan a los clientes ya incorporados al cierre del bucket.
      const scopeVigente = vigentesAl(clientesScope, cierre);
      const carteraTotal = scopeVigente.length;
      const carteraDir = vigentesAl(clientesScopeDir, cierre).length;
      const carteraInd = vigentesAl(clientesScopeInd, cierre).length;
      const activosAcum = scopeVigente.filter((c) => radarCum.has(c.locId)).length;
      const facturadosAcum = scopeVigente.filter((c) => factCum.has(c.locId)).length;
      const pedidosAcum = scopeVigente.filter((c) => pedidoCum.has(c.locId)).length;
      const activosDirAcum = vigentesAl(clientesScopeDir, cierre).filter((c) => radarCum.has(c.locId)).length;
      const activosIndAcum = vigentesAl(clientesScopeInd, cierre).filter((c) => radarCum.has(c.locId)).length;
      return {
        dia: b,
        label: bucketLabelFor(b, granularity),
        radarKgDia: Math.round(kgBucket * 10) / 10,
        radarKgDiaDirecto: Math.round(kgBucketDir * 10) / 10,
        radarKgDiaIndirecto: Math.round(kgBucketInd * 10) / 10,
        programados: prog.length,
        activos,
        facturados,
        pedidos,
        efectividadActivos: pct(activos, prog.length),
        efectividadFacturados: pct(facturados, prog.length),
        efectividadPedidos: pct(pedidos, prog.length),
        efectividadDirecto: pct(activosDir, progDir.length),
        efectividadIndirecto: pct(activosInd, progInd.length),
        // Modo acumulado (activos acumulados ÷ cartera total del scope).
        efectividadActivosAcum: pct(activosAcum, carteraTotal),
        efectividadFacturadosAcum: pct(facturadosAcum, carteraTotal),
        efectividadPedidosAcum: pct(pedidosAcum, carteraTotal),
        efectividadDirectoAcum: pct(activosDirAcum, carteraDir),
        efectividadIndirectoAcum: pct(activosIndAcum, carteraInd),
      };
    });
  }

  const totalPorSector = SECTOR_KEYS.reduce(
    (acc, s) => ({
      ...acc,
      [s]: {
        day: buildTotalAcumulado("day", s),
        week: buildTotalAcumulado("week", s),
        month: buildTotalAcumulado("month", s),
      },
    }),
    {} as Record<Sector, Record<TimeGranularity, CarteraTotalDiaPunto[]>>
  );

  return {
    segmentos: { day: buildSegmentos("day"), week: buildSegmentos("week"), month: buildSegmentos("month") },
    totalPorDia: {
      day: buildTotalAcumulado("day"),
      week: buildTotalAcumulado("week"),
      month: buildTotalAcumulado("month"),
    },
    totalPorSector,
  };
}

export { PILOT_SECTORS, SECTOR_LABELS };
export type { LocationType };
