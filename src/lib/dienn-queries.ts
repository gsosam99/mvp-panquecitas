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
import { LOCATION_COLUMNS } from "@/lib/location-columns";
import {
  bucketKeyFor,
  bucketLabelFor,
  panBucketKeyFor,
  panBucketLabelFor,
  type PanComparisonGranularity,
  type TimeGranularity,
} from "@/lib/date-buckets";
import type { Location, LocationType, SapPendingOrder } from "@/types";

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

// ── 1. Total Ton / 1b. Total Ton pedidas / 3. Mix de Producto ──────
// Las tres cifras (Total Ton facturado, Total Ton pendiente por facturar,
// y el desglose por presentación 400g/800g) se calculan de UNA sola pasada
// sobre las mismas filas, para que la suma de las presentaciones del Mix
// de Producto coincida siempre, exactamente, con el total global — antes
// getTotalToneladas sumaba TODAS las filas de sap_sell_in_records
// (product_id = Panquecitas) mientras que el Mix solo contaba las que
// traían variant_id, así que una fila sin presentación reconocida se
// contaba en el total pero desaparecía del desglose por SKU. Fuente única
// de verdad: sap_sell_in_records (facturado) + sap_pending_orders
// (pendiente), ambas filtradas por variant_id no nulo — ver migraciones
// 008/009 y SAP_MATERIAL_VARIANT_MAP en catalog.ts.

interface VentasPorPresentacion {
  facturadaKgByVariant: Record<PresentacionMix, number>;
  facturadaKgTotal: number;
  /** Pedido total (facturado + pendiente) por presentación — "Cantidad Pedido" del reporte SAP. */
  pedidaKgByVariant: Record<PresentacionMix, number>;
  pedidaKgTotal: number;
}

async function getVentasPorPresentacion(sector?: Sector): Promise<VentasPorPresentacion> {
  const supabase = createSupabaseServiceClient();
  const ids = await getUniverseLocationIds(sector);

  const [{ data: sellInData }, { data: pendingData }] = await Promise.all([
    supabase
      .from("sap_sell_in_records")
      .select("quantity_kg, location_id, variant_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .not("variant_id", "is", null),
    supabase
      .from("sap_pending_orders")
      .select("quantity, location_id, variant_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .not("variant_id", "is", null),
  ]);

  const facturadaKgByVariant: Record<PresentacionMix, number> = { "400g": 0, "800g": 0 };
  for (const r of (sellInData ?? []) as { quantity_kg: number; location_id: string; variant_id: string }[]) {
    if (!ids.has(r.location_id)) continue;
    const presentacion = VARIANT_TO_PRESENTACION[r.variant_id];
    if (!presentacion) continue;
    facturadaKgByVariant[presentacion] += r.quantity_kg;
  }

  const pedidaKgByVariant: Record<PresentacionMix, number> = {
    "400g": facturadaKgByVariant["400g"],
    "800g": facturadaKgByVariant["800g"],
  };
  for (const r of (pendingData ?? []) as { quantity: number; location_id: string; variant_id: string }[]) {
    if (!ids.has(r.location_id)) continue;
    const presentacion = VARIANT_TO_PRESENTACION[r.variant_id];
    if (!presentacion) continue;
    pedidaKgByVariant[presentacion] += r.quantity;
  }

  return {
    facturadaKgByVariant,
    facturadaKgTotal: facturadaKgByVariant["400g"] + facturadaKgByVariant["800g"],
    pedidaKgByVariant,
    pedidaKgTotal: pedidaKgByVariant["400g"] + pedidaKgByVariant["800g"],
  };
}

export async function getTotalToneladas(sector?: Sector): Promise<number> {
  const { facturadaKgTotal } = await getVentasPorPresentacion(sector);
  return Math.round((facturadaKgTotal / 1000) * 100) / 100;
}

// "Total ton vendidas" = Cantidad Pedido SAP (facturado + pendiente),
// sin filtrar por variant_id, para coincidir con Panquecitas vs Harina PAN.
export async function getTotalToneladasPedidas(sector?: Sector): Promise<number> {
  const ids = await getUniverseLocationIds(sector);
  const supabase = createSupabaseServiceClient();
  const [{ data: sellInData }, { data: pendingData }] = await Promise.all([
    supabase
      .from("sap_sell_in_records")
      .select("quantity_kg, location_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS),
    supabase
      .from("sap_pending_orders")
      .select("quantity, location_id")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS),
  ]);

  let pedidaKgTotal = 0;
  for (const r of (sellInData ?? []) as { quantity_kg: number; location_id: string }[]) {
    if (ids.has(r.location_id)) pedidaKgTotal += r.quantity_kg;
  }
  for (const r of (pendingData ?? []) as { quantity: number; location_id: string }[]) {
    if (ids.has(r.location_id)) pedidaKgTotal += r.quantity;
  }
  return Math.round((pedidaKgTotal / 1000) * 100) / 100;
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

// ── 3b. Pedido vs Ventas Panquecitas (por presentación y tiempo) ───
// Para cada día/semana y cada presentación (400g/800g):
//   Facturada = Σ sap_sell_in_records.quantity_kg
//   Pedida    = Facturada + Σ sap_pending_orders.quantity
//             (= Cantidad Pedido del reporte N7_V_SD83_WEB_001)
// El cliente elige Día/Semana y un período concreto; el eje X del gráfico
// son las dos presentaciones, con barras Pedida vs Facturada.

export type PedidoVsVentasGranularity = "day" | "week";

export interface PedidoVsVentasBarPoint {
  presentacion: PresentacionMix;
  pedidaKg: number;
  facturadaKg: number;
}

export interface PedidoVsVentasPeriod {
  bucket: string;
  label: string;
  bars: PedidoVsVentasBarPoint[];
}

function buildPedidoVsVentasPeriods(
  facturada: { location_id: string; date: string; variant_id: string; kg: number }[],
  pendiente: { location_id: string; date: string; variant_id: string; kg: number }[],
  ids: Set<string>,
  granularity: PedidoVsVentasGranularity
): PedidoVsVentasPeriod[] {
  type Acc = { pedida: number; facturada: number };
  const byBucket = new Map<string, Record<PresentacionMix, Acc>>();

  function ensure(bucket: string, presentacion: PresentacionMix): Acc {
    if (!byBucket.has(bucket)) {
      byBucket.set(bucket, {
        "400g": { pedida: 0, facturada: 0 },
        "800g": { pedida: 0, facturada: 0 },
      });
    }
    return byBucket.get(bucket)![presentacion];
  }

  for (const r of facturada) {
    if (!ids.has(r.location_id) || !r.date) continue;
    const presentacion = VARIANT_TO_PRESENTACION[r.variant_id];
    if (!presentacion) continue;
    const acc = ensure(bucketKeyFor(r.date, granularity), presentacion);
    acc.facturada += r.kg;
    acc.pedida += r.kg;
  }

  for (const r of pendiente) {
    if (!ids.has(r.location_id) || !r.date) continue;
    const presentacion = VARIANT_TO_PRESENTACION[r.variant_id];
    if (!presentacion) continue;
    const acc = ensure(bucketKeyFor(r.date, granularity), presentacion);
    acc.pedida += r.kg;
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
          pedidaKg: Math.round(cell[presentacion].pedida * 10) / 10,
          facturadaKg: Math.round(cell[presentacion].facturada * 10) / 10,
        })),
      };
    });
}

export async function getPedidoVsVentas(
  sector?: Sector
): Promise<Record<PedidoVsVentasGranularity, PedidoVsVentasPeriod[]>> {
  const empty = { day: [] as PedidoVsVentasPeriod[], week: [] as PedidoVsVentasPeriod[] };
  const ids = await getUniverseLocationIds(sector);
  if (ids.size === 0) return empty;

  const supabase = createSupabaseServiceClient();
  const [{ data: sellInData }, { data: pendingData }] = await Promise.all([
    supabase
      .from("sap_sell_in_records")
      .select("quantity_kg, location_id, variant_id, date_of_sale")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .not("variant_id", "is", null),
    supabase
      .from("sap_pending_orders")
      .select("quantity, location_id, variant_id, order_date")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .not("variant_id", "is", null),
  ]);

  const facturada = ((sellInData ?? []) as {
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

  const pendiente = ((pendingData ?? []) as {
    quantity: number;
    location_id: string;
    variant_id: string;
    order_date: string | null;
  }[])
    .filter((r) => r.order_date)
    .map((r) => ({
      location_id: r.location_id,
      date: r.order_date!,
      variant_id: r.variant_id,
      kg: r.quantity,
    }));

  if (facturada.length === 0 && pendiente.length === 0) return empty;

  return {
    day: buildPedidoVsVentasPeriods(facturada, pendiente, ids, "day"),
    week: buildPedidoVsVentasPeriods(facturada, pendiente, ids, "week"),
  };
}

// ── 3c. Panquecitas vs Harina PAN (por tiempo) ─────────────────────
// Compara Cantidad Pedido de Panquecitas vs Harina PAN (día/semana/mes/
// trimestre). Volumen = facturado + pendiente (= pedido total SAP;
// no es una suma doble de conceptos distintos). Dos poblaciones:
//   - "clientes": solo PDV que sí tienen actividad SAP de Panquecitas
//     (pedido y/o factura — mismo criterio que AdminPdvRow.comprador).
//   - "universo": los 363 clientes del piloto (incluye 0 Panquecitas).
// Harina PAN llega solo por el reporte mensual agregado
// (handleMonthlyUpload), sin sap_pending_orders — su serie es facturado.

/** Población global fija del piloto — denominador de % Penetración en TOTAL. */
const UNIVERSAL_CLIENTES_PILOTO = 363;

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
  const [{ data: sellInData }, { data: pendingData }] = await Promise.all([
    supabase.from("sap_sell_in_records").select("location_id").eq("product_id", PRODUCT_IDS.PANQUECITAS).gt("quantity_kg", 0),
    supabase.from("sap_pending_orders").select("location_id").eq("product_id", PRODUCT_IDS.PANQUECITAS).gt("quantity", 0),
  ]);

  const compradorIds = new Set<string>();
  for (const r of (sellInData ?? []) as { location_id: string }[]) compradorIds.add(r.location_id);
  for (const r of (pendingData ?? []) as { location_id: string }[]) compradorIds.add(r.location_id);

  return new Set([...ids].filter((id) => compradorIds.has(id)));
}

function computePanVsHarinaPanPoints(
  facturada: { product_id: string; date: string; kg: number }[],
  pendiente: { product_id: string | null; date: string | null; kg: number }[],
  granularity: PanComparisonGranularity
): PanVsHarinaPanPoint[] {
  const byBucket = new Map<string, { panquecitas: number; harinaPan: number }>();
  function ensure(bucket: string) {
    if (!byBucket.has(bucket)) byBucket.set(bucket, { panquecitas: 0, harinaPan: 0 });
    return byBucket.get(bucket)!;
  }
  for (const r of facturada) {
    const acc = ensure(panBucketKeyFor(r.date, granularity));
    if (r.product_id === PRODUCT_IDS.PANQUECITAS) acc.panquecitas += r.kg;
    else if (r.product_id === PRODUCT_IDS.HARINA_PAN) acc.harinaPan += r.kg;
  }
  for (const r of pendiente) {
    if (!r.date || !r.product_id) continue;
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
  const [{ data: sellInData }, { data: pendingData }] = await Promise.all([
    supabase
      .from("sap_sell_in_records")
      .select("location_id, product_id, quantity_kg, date_of_sale")
      .in("product_id", [PRODUCT_IDS.PANQUECITAS, PRODUCT_IDS.HARINA_PAN]),
    supabase
      .from("sap_pending_orders")
      .select("location_id, product_id, quantity, order_date")
      .in("product_id", [PRODUCT_IDS.PANQUECITAS, PRODUCT_IDS.HARINA_PAN]),
  ]);

  // Cantidad Pedido = facturado (sell_in) + pendiente; no doble conteo.
  const facturada = (
    (sellInData ?? []) as { location_id: string; product_id: string; quantity_kg: number; date_of_sale: string }[]
  )
    .filter((r) => ids.has(r.location_id))
    .map((r) => ({ product_id: r.product_id, date: r.date_of_sale, kg: r.quantity_kg }));

  const pendiente = (
    (pendingData ?? []) as { location_id: string; product_id: string | null; quantity: number; order_date: string | null }[]
  )
    .filter((r) => ids.has(r.location_id))
    .map((r) => ({ product_id: r.product_id, date: r.order_date, kg: r.quantity }));

  if (facturada.length === 0 && pendiente.length === 0) return empty;

  return {
    day: computePanVsHarinaPanPoints(facturada, pendiente, "day"),
    week: computePanVsHarinaPanPoints(facturada, pendiente, "week"),
    month: computePanVsHarinaPanPoints(facturada, pendiente, "month"),
    quarter: computePanVsHarinaPanPoints(facturada, pendiente, "quarter"),
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

    const datesByLocation = new Map<string, Set<string>>();
    for (const r of rowsUpToBucket) {
      if (!datesByLocation.has(r.location_id)) datesByLocation.set(r.location_id, new Set());
      datesByLocation.get(r.location_id)!.add(r.date_of_sale);
    }

    const compradores = datesByLocation.size;
    // Recompra = ≥2 fechas de compra distintas, sin exigir que caigan en
    // meses distintos — dos compras en la misma semana también cuentan.
    const conRecompra = Array.from(datesByLocation.values()).filter((d) => d.size >= 2).length;

    points.push({
      bucket,
      label: bucketLabelFor(bucket, granularity),
      penetracionPct: Math.round((compradores / universoSize) * 1000) / 10,
      recompraPct: compradores > 0 ? Math.round((conRecompra / compradores) * 1000) / 10 : 0,
    });
  }

  return points;
}

/** Un punto acumulado por cada día/semana/mes con datos — las tres calculadas de una sola pasada por Supabase. */
export async function getPenetracionRecompra(sector?: Sector): Promise<Record<TimeGranularity, PenetracionRecompraPoint[]>> {
  const empty = { day: [], week: [], month: [] };
  const universo = await getUniverseLocations();
  const universoFiltrado = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
  if (universoFiltrado.length === 0) return empty;
  const ids = new Set(universoFiltrado.map((l) => l.id));
  // % Penetración = clientes facturados / universo global (363) en TOTAL;
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

/** Cantidad Pedido (kg) por PDV = facturado + pendiente, sin doble conteo. */
async function getCantidadPedidoTotalsByLocation(productId: string): Promise<Map<string, number>> {
  const supabase = createSupabaseServiceClient();
  const [{ data: sellInData }, { data: pendingData }] = await Promise.all([
    supabase.from("sap_sell_in_records").select("location_id, quantity_kg").eq("product_id", productId),
    supabase.from("sap_pending_orders").select("location_id, quantity").eq("product_id", productId),
  ]);

  const totals = new Map<string, number>();
  for (const row of (sellInData ?? []) as { location_id: string; quantity_kg: number }[]) {
    totals.set(row.location_id, (totals.get(row.location_id) ?? 0) + row.quantity_kg);
  }
  for (const row of (pendingData ?? []) as { location_id: string; quantity: number }[]) {
    totals.set(row.location_id, (totals.get(row.location_id) ?? 0) + row.quantity);
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

  // Penetración: clientes facturados (sell_in > 0). Volumen HPM vs Base:
  // Cantidad Pedido de Panquecitas (facturado + pendiente).
  const panqFacturadoTotals = await getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS);
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
  // Recompra = ≥2 fechas de compra distintas, sin exigir meses distintos.
  const datesByLocation = new Map<string, Set<string>>();
  for (const r of salesRows) {
    if (!datesByLocation.has(r.location_id)) datesByLocation.set(r.location_id, new Set());
    datesByLocation.get(r.location_id)!.add(r.date_of_sale);
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
    const facturados = locs.filter((l) => (panqFacturadoTotals.get(l.id) ?? 0) > 0);
    const conRecompra = facturados.filter((l) => (datesByLocation.get(l.id)?.size ?? 0) >= 2);

    const segHmpKg = locs.reduce((s, l) => s + (hmpTotals.get(l.id) ?? 0), 0);
    const segPanqKg = locs.reduce((s, l) => s + (panqPedidoTotals.get(l.id) ?? 0), 0);

    rows.push({
      segmento,
      // % Penetración = facturados del segmento / universo (363 en TOTAL)
      penetracionPct:
        denomPenetracion > 0 ? Math.round((facturados.length / denomPenetracion) * 1000) / 10 : 0,
      // Tasa de Recompra = repetidores / clientes con ≥1 compra (facturada)
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

// ── 8. Pedidos pendientes por entregar ────────────────────────────
// Ver decisión #13: formato del reporte SAP aún no confirmado.

export async function getPedidosPendientes(sector?: Sector): Promise<SapPendingOrder[]> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_pending_orders")
    .select(
      `id, created_at, upload_batch_id, location_id, product_id, variant_id, quantity, order_date, notes, location:locations(${LOCATION_COLUMNS})`
    )
    .order("order_date", { ascending: true });

  const rows = (data ?? []) as unknown as SapPendingOrder[];
  if (!sector) return rows;
  return rows.filter((r) => sectorGroup(r.location?.oficina_venta ?? null) === sector);
}

export { PILOT_SECTORS, SECTOR_LABELS };
export type { LocationType };
