import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PRODUCT_IDS } from "@/data/catalog";
import {
  PILOT_SECTORS,
  SECTOR_LABELS,
  sectorGroup,
  getSellInTotalsByLocation,
  getUniverseLocations,
  type Sector,
} from "@/lib/universe";
import type { Location, LocationType, SapPendingOrder } from "@/types";

// ────────────────────────────────────────────────────────────────
// Perfil DIENN — Dashboard estratégico reconstruido desde 0 (ver
// "Cambios en app Panquecitas - Versión Ale (1)" y
// docs/decisiones-implementacion.md). Único perfil con acceso a
// cifras de Sell-in y al ratio Panquecitas/HMP.
// ────────────────────────────────────────────────────────────────

// ── Helpers de semana (ISO week, lunes a domingo) ─────────────────

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const target = new Date(d.getTime());
  const dayNr = (d.getUTCDay() + 6) % 7; // lunes=0 .. domingo=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // jueves de esa semana
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNr =
    1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNr).padStart(2, "0")}`;
}

// ── Filtro reactivo de segmento (Tabs TOTAL / sector) ──────────────
// Todas las queries de abajo aceptan un `sector` opcional: sin filtro
// (TOTAL) o acotado a un sector (Barquisimeto Este / Cumaná). Ver
// "2. FILTROS REACTIVOS DE SEGMENTO" en el documento DIENN.

async function getUniverseLocationIds(sector?: Sector): Promise<Set<string>> {
  const universo = await getUniverseLocations();
  const filtered = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
  return new Set(filtered.map((l) => l.id));
}

// ── 1. Total Ton ───────────────────────────────────────────────────

export async function getTotalToneladas(sector?: Sector): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("quantity_kg, location_id")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS);

  const ids = await getUniverseLocationIds(sector);
  const rows = (data ?? []) as { quantity_kg: number; location_id: string }[];
  const totalKg = rows.filter((r) => ids.has(r.location_id)).reduce((s, r) => s + r.quantity_kg, 0);
  return Math.round((totalKg / 1000) * 100) / 100;
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

// ── 3. Mix de Producto: se movió a src/lib/sellout-queries.ts ─────
// (aggregateMixProducto). Ya no se calcula desde el depósito: ahora es la
// salida directa del motor de Sell-Out por presentación (toneladas
// vendidas 400g vs 800g) — ver decisión #6/#1 de "Arreglos app
// Panquecitas" en docs/decisiones-implementacion.md.

// ── 4. Evolución de Penetración y Tasa de Recompra (semanal) ──────

export interface PenetracionRecompraPoint {
  week: string;
  penetracionPct: number;
  recompraPct: number;
}

export async function getPenetracionRecompraSemanal(sector?: Sector): Promise<PenetracionRecompraPoint[]> {
  const universo = await getUniverseLocations();
  const universoFiltrado = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
  if (universoFiltrado.length === 0) return [];
  const ids = new Set(universoFiltrado.map((l) => l.id));

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("location_id, date_of_sale")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0)
    .order("date_of_sale");

  const rows = ((data ?? []) as { location_id: string; date_of_sale: string }[]).filter((r) => ids.has(r.location_id));
  if (rows.length === 0) return [];

  const weeks = Array.from(new Set(rows.map((r) => isoWeekKey(r.date_of_sale)))).sort();

  const points: PenetracionRecompraPoint[] = [];
  for (const week of weeks) {
    const rowsUpToWeek = rows.filter((r) => isoWeekKey(r.date_of_sale) <= week);

    const monthsByLocation = new Map<string, Set<string>>();
    for (const r of rowsUpToWeek) {
      const month = r.date_of_sale.slice(0, 7);
      if (!monthsByLocation.has(r.location_id)) monthsByLocation.set(r.location_id, new Set());
      monthsByLocation.get(r.location_id)!.add(month);
    }

    const compradores = monthsByLocation.size;
    const conRecompra = Array.from(monthsByLocation.values()).filter((m) => m.size >= 2).length;

    points.push({
      week,
      penetracionPct: Math.round((compradores / universoFiltrado.length) * 1000) / 10,
      recompraPct: compradores > 0 ? Math.round((conRecompra / compradores) * 1000) / 10 : 0,
    });
  }

  return points;
}

// ── 5. Cobertura y Comunicación por sector (semanal) ───────────────
// Ver decisión #11: no hay datos reales de campañas de comunicación ni
// metas por ciudad, así que se usa un proxy con datos existentes.
// Cobertura = % acumulado de PDV visitados por mercaderista.
// Comunicación = % acumulado de PDV con material POP presente.
// "Ciudad" = sector (Barquisimeto Este / Cumaná); "meta" = universo del sector.

export interface CoberturaComunicacionPoint {
  week: string;
  [key: string]: string | number; // `${sector}_cobertura` / `${sector}_comunicacion`
}

export async function getCoberturaComunicacionPorSector(): Promise<CoberturaComunicacionPoint[]> {
  const universo = await getUniverseLocations();
  if (universo.length === 0) return [];

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
  if (relevantRows.length === 0) return [];

  const weeks = Array.from(new Set(relevantRows.map((r) => isoWeekKey(r.created_at.slice(0, 10))))).sort();

  const points: CoberturaComunicacionPoint[] = [];
  for (const week of weeks) {
    const rowsUpToWeek = relevantRows.filter((r) => isoWeekKey(r.created_at.slice(0, 10)) <= week);

    const point: CoberturaComunicacionPoint = { week };
    for (const sector of ["cumana", "barquisimeto_este"] as Sector[]) {
      const sectorRows = rowsUpToWeek.filter((r) => sectorByLocation.get(r.location_id) === sector);
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

// ── 6. Detalle de Clientes por Segmento ────────────────────────────
// Segmento = tipo_cliente (decisión #5). %HPM TOTAL / %HPM vs Base:
// ver decisión #12.

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

  const panqTotals = await getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS);
  const hmpTotals = await getSellInTotalsByLocation(PRODUCT_IDS.HARINA_PAN);

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sap_sell_in_records")
    .select("location_id, date_of_sale")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0);

  const salesRows = (data ?? []) as { location_id: string; date_of_sale: string }[];
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
    const compradores = locs.filter((l) => (panqTotals.get(l.id) ?? 0) > 0);
    const conRecompra = compradores.filter((l) => (monthsByLocation.get(l.id)?.size ?? 0) >= 2);

    const segHmpKg = locs.reduce((s, l) => s + (hmpTotals.get(l.id) ?? 0), 0);
    const segPanqKg = locs.reduce((s, l) => s + (panqTotals.get(l.id) ?? 0), 0);

    rows.push({
      segmento,
      penetracionPct: Math.round((compradores.length / locs.length) * 1000) / 10,
      recompraPct: compradores.length > 0 ? Math.round((conRecompra.length / compradores.length) * 1000) / 10 : 0,
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
    .select("id, created_at, upload_batch_id, location_id, product_id, quantity, order_date, notes, location:locations(id, name, type, sap_code, address, region, centro_poblado, municipio, tipo_cliente, oficina_venta, lat, lng)")
    .order("order_date", { ascending: true });

  const rows = (data ?? []) as unknown as SapPendingOrder[];
  if (!sector) return rows;
  return rows.filter((r) => sectorGroup(r.location?.oficina_venta ?? null) === sector);
}

export { PILOT_SECTORS, SECTOR_LABELS };
export type { LocationType };
