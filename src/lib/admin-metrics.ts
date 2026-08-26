// Métricas del dashboard de Administrador — funciones puras (sin Supabase)
// para poder importarse desde el Client Component que aplica los filtros de
// Oficina de Venta y Grupo Vendedor. La query que arma las filas vive en
// src/lib/admin-queries.ts (getAdminExecutionSnapshot).

import { isPvpDeviated } from "@/data/pvp-thresholds";
import { sectorGroup, SECTOR_LABELS, type Sector } from "@/lib/sectors";
import { bucketEndDate, bucketKeyFor, bucketLabelFor, type TimeGranularity } from "@/lib/date-buckets";
import { estabaIncorporado } from "@/lib/cohortes";
import { CAMPAIGN_WEEKS } from "@/lib/campaign-weeks";
import type { Location } from "@/types";

export { CAMPAIGN_WEEKS };

/** Una fila por cliente de la cartera, con su última visita de mercaderista. */
export interface AdminPdvRow {
  location: Location;
  /** Tiene volumen de Panquecitas en la Carga Radar (booleano, sin kg). Pedidos y Facturado NO cuenta. */
  comprador: boolean;
  /** Fecha de su primera venta en la Carga Radar, o null si no tiene. */
  primeraCompra: string | null;
  visitado: boolean;
  ultimaVisita: string | null;
  popPresent: boolean | null;
  productPresent: boolean | null;
  frontFaces: number | null;
  /** Precio observado, o null si no se visitó o el local no maneja la presentación. */
  price400: number | null;
  price800: number | null;
  /** Objetivo de PVP de su zona, o null si su oficina no es un sector piloto. */
  target400: number | null;
  target800: number | null;
  unidadesAnaquel: number | null;
  unidadesDeposito: number;
  depositAccess: boolean | null;
}

/** Una visita de mercaderista, sin recortar a "la última" — para series en el tiempo (ver getAdminVisitHistory). */
export interface AdminVisitSnapshot {
  locationId: string;
  createdAt: string;
  popPresent: boolean;
  price400: number | null;
  price800: number | null;
  unidadesAnaquel: number | null;
  unidadesDeposito: number;
  depositAccess: boolean;
}

/** Un cliente con menos unidades que esto (anaquel + depósito) está en riesgo. */
export const STOCK_OUT_UMBRAL_UNIDADES = 2;

/** Mínimo de caras frontales exigido a los clientes de formato grande. */
export const CARAS_FRONTALES_MINIMO = 4;

// Para estos tipos de cliente el criterio de alerta de exhibición es la
// cantidad de caras frontales; para el resto, la simple presencia del
// producto (no hay "caras" que contar en una bodega).
const TIPOS_CLIENTE_CON_CARAS = new Set([
  "HIPERMERCADOS",
  "SUPERMERCADOS",
  "DIST.VIVER/BEB NO AL",
  "MAYOR VIVE/CONF/BEBI",
]);

export function exigeCarasFrontales(location: Location): boolean {
  return TIPOS_CLIENTE_CON_CARAS.has((location.tipo_cliente ?? "").trim().toUpperCase());
}

// ── Filtros ───────────────────────────────────────────────────────

export type OficinaFilter = "TOTAL" | Sector;

export interface AdminFilters {
  oficina: OficinaFilter;
  /** Código de grupo vendedor (ej. "U29"), o "" para todos. */
  grupoVendedor: string;
}

export function filterAdminRows(rows: AdminPdvRow[], filters: AdminFilters): AdminPdvRow[] {
  return rows.filter((r) => {
    if (filters.oficina !== "TOTAL" && sectorGroup(r.location.oficina_venta) !== filters.oficina) return false;
    if (filters.grupoVendedor && r.location.grupo_vendedor !== filters.grupoVendedor) return false;
    return true;
  });
}

/** Grupos vendedores presentes en la cartera, ordenados (para el <select>). */
export function grupoVendedorOptions(rows: AdminPdvRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const grupo = r.location.grupo_vendedor?.trim();
    if (grupo) set.add(grupo);
  }
  return Array.from(set).sort();
}

/** Tipos de cliente presentes en las filas dadas, ordenados (para el <select> de la lista "Clientes con ventas en SAP"). */
export function tipoClienteOptions(rows: AdminPdvRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const tipo = r.location.tipo_cliente?.trim();
    if (tipo) set.add(tipo);
  }
  return Array.from(set).sort();
}

export function oficinaLabel(location: Location): string | null {
  const sector = sectorGroup(location.oficina_venta);
  return sector ? SECTOR_LABELS[sector] : location.oficina_venta;
}

// ── Precio de venta ───────────────────────────────────────────────

export function desviado400(row: AdminPdvRow): boolean {
  return row.price400 !== null && row.target400 !== null && isPvpDeviated(row.price400, row.target400);
}

export function desviado800(row: AdminPdvRow): boolean {
  return row.price800 !== null && row.target800 !== null && isPvpDeviated(row.price800, row.target800);
}

// Un cliente entra en el indicador de precio solo si su zona tiene objetivo
// definido y el mercaderista pudo observar al menos un precio. Los locales
// donde ambas presentaciones quedaron marcadas "no disponible" no se cuentan
// ni como correctos ni como incorrectos: no hay precio que evaluar.
export function precioEvaluable(row: AdminPdvRow): boolean {
  if (row.target400 === null) return false;
  return row.price400 !== null || row.price800 !== null;
}

export function precioIncorrecto(row: AdminPdvRow): boolean {
  return precioEvaluable(row) && (desviado400(row) || desviado800(row));
}

// ── Inventario ────────────────────────────────────────────────────

export function unidadesTotales(row: AdminPdvRow): number {
  return (row.unidadesAnaquel ?? 0) + row.unidadesDeposito;
}

/**
 * ¿Se puede juzgar el inventario de este PDV? Mismo criterio que
 * precioEvaluable: lo que no se observó no se califica (decisión del
 * usuario, 26-08-2026). Antes un dato faltante valía 0 unidades y el PDV
 * quedaba marcado en riesgo sin que nadie hubiera visto un anaquel vacío.
 *
 * Anaquel: si el producto NO está presente, el wizard salta el conteo y
 * unidadesAnaquel queda null — pero ahí el 0 es real, no es dato faltante
 * (ver AuditWizard: el paso anaquel_count solo corre con productPresent).
 * Con producto presente y sin conteo (visitas viejas), sí falta el dato.
 *
 * Depósito: con deposit_access=false el wizard salta el conteo, así que
 * unidadesDeposito=0 significa "no se sabe", no "no hay". Ahí solo se puede
 * concluir algo si lo visto en anaquel YA alcanza el umbral: hay stock, sin
 * importar qué haya atrás. Si no llega, no hay forma de decidir.
 */
export function inventarioEvaluable(row: AdminPdvRow): boolean {
  if (!row.visitado) return false;
  if (row.productPresent === true && row.unidadesAnaquel === null) return false;
  if (row.depositAccess !== true) return (row.unidadesAnaquel ?? 0) >= STOCK_OUT_UMBRAL_UNIDADES;
  return true;
}

// ── Listas de incidencias (Bloque 1 y 2) ──────────────────────────

export function clientesSinVentaSap(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter((r) => !r.comprador);
}

export function clientesConVentaSap(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter((r) => r.comprador);
}

// Estas tres listas (precio incorrecto / sin POP / exhibición) se miden sobre
// los clientes VISITADOS que además tienen VENTAS EN SAP (r.comprador = Radar de
// Panquecitas > 0) — decisión con Alejandro (11-08-2026): los indicadores de
// ejecución van sobre el cliente real (el que compra), SIN exigir que el
// producto esté presente. Las tarjetas de KPI de precio y POP usan la misma
// población (ver computeAdminKpis).
export function clientesPrecioIncorrecto(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter((r) => r.visitado && r.comprador && precioIncorrecto(r));
}

export function clientesSinMaterialPop(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter((r) => r.visitado && r.comprador && r.popPresent === false);
}

// Misma población que precio, POP y exhibición: visitados CON venta Radar
// (decisión del usuario, 26-08-2026). Era el único indicador de ejecución que
// se medía sobre TODOS los visitados, y por eso su "de N visitados" no
// coincidía con el de las otras tarjetas.
export function clientesRiesgoStockOut(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter(
    (r) => r.visitado && r.comprador && inventarioEvaluable(r) && unidadesTotales(r) < STOCK_OUT_UMBRAL_UNIDADES
  );
}

export type MotivoExhibicion = "CARAS_INSUFICIENTES" | "SIN_PRESENCIA";

export interface ExhibicionRow {
  row: AdminPdvRow;
  motivo: MotivoExhibicion;
}

export function clientesExhibicionDeficiente(rows: AdminPdvRow[]): ExhibicionRow[] {
  const result: ExhibicionRow[] = [];
  for (const row of rows) {
    // Población: visitados con ventas en SAP (ver nota en clientesPrecioIncorrecto).
    // Como ya NO se exige presencia del producto, un cliente comprador visitado
    // donde el producto no está presente es una incidencia de exhibición
    // ("sin presencia"); los formatos con caras se evalúan por caras frontales.
    if (!row.visitado || !row.comprador) continue;
    if (row.productPresent !== true) {
      result.push({ row, motivo: "SIN_PRESENCIA" });
      continue;
    }
    if (exigeCarasFrontales(row.location) && (row.frontFaces ?? 0) < CARAS_FRONTALES_MINIMO) {
      result.push({ row, motivo: "CARAS_INSUFICIENTES" });
    }
  }
  return result;
}

export function clientesFaltaPorVisitar(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter((r) => !r.visitado);
}

// ── Tarjetas de KPI ───────────────────────────────────────────────
//
// UNA SOLA BASE para los tres indicadores de ejecución (precio, POP y stock
// out): los VISITADOS CON VENTA RADAR (decisión del usuario, 26-08-2026 — "la
// base para todos debe ser visitados con venta radar"). Antes cada uno dividía
// entre un subconjunto distinto —precio entre los que tenían precio
// observable, stock out entre TODOS los visitados— y por eso el "de N" de
// cada tarjeta daba un número diferente.
//
// Regla del numerador, una sola para las tres: solo suma lo VERIFICADO.
//   - Precio: el numerador es lo bueno (correctos). Un PDV sin precio
//     observable no tiene precio correcto verificado, así que no suma. El %
//     baja y esa bajada es real: no se pudo comprobar.
//   - Stock out: el numerador es lo malo (en riesgo). Un PDV cuyo inventario
//     no se pudo ver tampoco está verificado como en riesgo, así que tampoco
//     suma. Marcarlo en riesgo sería inventar una incidencia.
// En ambos casos el PDV SÍ está en el denominador, y se reporta aparte en
// `sinDato` para poder separar la mala ejecución de la auditoría incompleta.

export interface AdminKpis {
  /** % de la cartera del corte de filtros vigente con venta publicada en el Radar de Panquecitas. */
  compraron: { pct: number; count: number; total: number };
  /** % de la base con el precio de su zona verificado correcto. `sinDato`: los de la base sin precio observable. */
  precioCorrecto: { pct: number; count: number; total: number; sinDato: number };
  /** % de la base con material POP presente. El wizard siempre pregunta por POP, así que acá nunca falta el dato. */
  materialPop: { pct: number; count: number; total: number };
  /** Clientes de la base verificados con menos de 2 unidades. `sinDato`: los de la base cuyo inventario no se pudo observar. */
  riesgoStockOut: { pct: number; count: number; total: number; sinDato: number };
  /** % de la cartera visitada por el mercaderista. */
  coberturaMercaderista: { pct: number; count: number; total: number };
  /** % de la cartera que falta por visitar (complemento de la cobertura). */
  faltaPorVisitar: { pct: number; count: number; total: number };
  /** La base común de los indicadores de ejecución: visitados con venta Radar. */
  baseEjecucion: number;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

export function computeAdminKpis(rows: AdminPdvRow[]): AdminKpis {
  const total = rows.length;

  const compradores = rows.filter((r) => r.comprador).length;

  const visitados = rows.filter((r) => r.visitado);
  // LA BASE. Precio, POP y stock out dividen todos entre este mismo número.
  const visitadosConVenta = rows.filter((r) => r.visitado && r.comprador);
  const base = visitadosConVenta.length;

  const conPop = visitadosConVenta.filter((r) => r.popPresent === true).length;

  // Numeradores: solo lo verificado (ver nota de la interfaz).
  const evaluables = visitadosConVenta.filter(precioEvaluable);
  const correctos = evaluables.filter((r) => !precioIncorrecto(r)).length;
  const enRiesgo = clientesRiesgoStockOut(rows).length;

  // Lo que quedó sin verificar, para poder declararlo al lado del %.
  const sinPrecioObservable = base - evaluables.length;
  const sinInventarioObservable = base - visitadosConVenta.filter(inventarioEvaluable).length;

  const faltantes = total - visitados.length;

  return {
    // Denominador DINÁMICO: la cartera del corte de filtros vigente (TOTAL =
    // cartera global; una zona = solo esa zona). Numerador y denominador se
    // filtran juntos porque `rows` ya viene recortado por Oficina/Grupo.
    compraron: { pct: pct(compradores, total), count: compradores, total },
    precioCorrecto: { pct: pct(correctos, base), count: correctos, total: base, sinDato: sinPrecioObservable },
    materialPop: { pct: pct(conPop, base), count: conPop, total: base },
    riesgoStockOut: { pct: pct(enRiesgo, base), count: enRiesgo, total: base, sinDato: sinInventarioObservable },
    coberturaMercaderista: { pct: pct(visitados.length, total), count: visitados.length, total },
    faltaPorVisitar: { pct: pct(faltantes, total), count: faltantes, total },
    baseEjecucion: base,
  };
}

// ── Gráfico: activación de clientes en el tiempo ───────────────────
// % acumulado de la cartera (del corte de filtros vigente — Oficina de
// Venta / Grupo Vendedor) que ya registró su primera venta en
// la Carga Radar, semana a semana. Se calcula 100% en el cliente a partir de
// `primeraCompra` (fecha de la primera venta Radar por PDV, ya resuelta
// en getAdminExecutionSnapshot) para que reaccione a los mismos filtros
// instantáneos que el resto del dashboard, sin ida y vuelta al servidor.

export interface ActivacionPoint {
  bucket: string;
  label: string;
  pct: number;
  count: number;
}

/** Última visita de cada location dentro de [start, end] (inclusive), como filas AdminPdvRow reutilizables por precioEvaluable/precioIncorrecto. */
function rowsForWeekWindow(
  visits: AdminVisitSnapshot[],
  window: { start: string; end: string },
  locationsById: Map<string, Location>,
  targetsByLocation: Map<string, { target400: number | null; target800: number | null }>,
  allowedLocationIds: Set<string>
): AdminPdvRow[] {
  const inWindow = visits.filter((v) => {
    const day = v.createdAt.slice(0, 10);
    return day >= window.start && day <= window.end && allowedLocationIds.has(v.locationId);
  });

  const lastByLocation = new Map<string, AdminVisitSnapshot>();
  for (const v of inWindow) {
    const prev = lastByLocation.get(v.locationId);
    if (!prev || v.createdAt > prev.createdAt) lastByLocation.set(v.locationId, v);
  }

  const rows: AdminPdvRow[] = [];
  for (const [locationId, v] of lastByLocation) {
    const location = locationsById.get(locationId);
    if (!location) continue;
    const targets = targetsByLocation.get(locationId) ?? { target400: null, target800: null };
    rows.push({
      location,
      comprador: false,
      primeraCompra: null,
      visitado: true,
      ultimaVisita: v.createdAt,
      popPresent: v.popPresent,
      productPresent: null,
      frontFaces: null,
      price400: v.price400,
      price800: v.price800,
      target400: targets.target400,
      target800: targets.target800,
      unidadesAnaquel: v.unidadesAnaquel,
      unidadesDeposito: v.unidadesDeposito,
      depositAccess: v.depositAccess,
    });
  }
  return rows;
}

export interface EjecucionSemanalPoint {
  label: string;
  /** Color fijo de la ronda (ver CAMPAIGN_WEEKS) — mismo color en todos los gráficos que usan rondas. */
  color: string;
  popPct: number;
  precioPct: number;
}

/**
 * % de clientes con material POP y % con precio correcto, por semana de
 * auditoría (S2/S4/S6/S8).
 *
 * MISMA BASE que las tarjetas de KPI, y la misma para las dos series: los
 * visitados esa semana que además tienen venta Radar (el recorte por venta
 * Radar lo aplica `allowedLocationIds`, ver AdminExecutionDashboardClient).
 * Los dos porcentajes dividen entre `rows.length`.
 *
 * Precio dividía entre los que tenían precio observable mientras POP dividía
 * entre todos, así que las dos barras de una misma semana no eran
 * comparables. Ahora un PDV sin precio observable NO se descarta: queda en el
 * denominador y simplemente no suma al numerador, porque su precio no se
 * pudo verificar correcto (decisión del usuario, 26-08-2026: "la base es la
 * misma para todos los indicadores").
 *
 * Una semana sin visitas en el corte de filtros vigente simplemente no
 * aparece en el gráfico.
 */
export function computeEjecucionSemanal(
  visits: AdminVisitSnapshot[],
  locationsById: Map<string, Location>,
  targetsByLocation: Map<string, { target400: number | null; target800: number | null }>,
  allowedLocationIds: Set<string>
): EjecucionSemanalPoint[] {
  const points: EjecucionSemanalPoint[] = [];
  for (const week of CAMPAIGN_WEEKS) {
    const rows = rowsForWeekWindow(visits, week, locationsById, targetsByLocation, allowedLocationIds);
    if (rows.length === 0) continue;

    const conPop = rows.filter((r) => r.popPresent === true).length;
    const correctos = rows.filter((r) => precioEvaluable(r) && !precioIncorrecto(r)).length;

    points.push({
      label: week.label,
      color: week.color,
      popPct: pct(conPop, rows.length),
      precioPct: pct(correctos, rows.length),
    });
  }
  return points;
}

export function computeActivacionSemanal(
  rows: AdminPdvRow[],
  granularity: TimeGranularity = "week"
): ActivacionPoint[] {
  if (rows.length === 0) return [];

  const conFecha = rows.filter((r): r is AdminPdvRow & { primeraCompra: string } => r.primeraCompra !== null);
  if (conFecha.length === 0) return [];

  const buckets = Array.from(new Set(conFecha.map((r) => bucketKeyFor(r.primeraCompra, granularity)))).sort();

  return buckets.map((bucket) => {
    // Denominador vigente al cierre del bucket, no la cartera de hoy: la
    // cartera se amplió el 14-08 y el 24-08-2026, y con un total fijo las
    // semanas anteriores se dividirían entre clientes que todavía no
    // existían. Ver src/lib/cohortes.ts.
    const cierre = bucketEndDate(bucket);
    const total = rows.filter((r) => estabaIncorporado(r.location.fecha_incorporacion, cierre)).length;
    const count = conFecha.filter(
      (r) =>
        bucketKeyFor(r.primeraCompra, granularity) <= bucket &&
        estabaIncorporado(r.location.fecha_incorporacion, cierre)
    ).length;
    return { bucket, label: bucketLabelFor(bucket, granularity), pct: pct(count, total), count };
  });
}
