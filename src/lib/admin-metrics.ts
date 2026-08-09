// Métricas del dashboard de Administrador — funciones puras (sin Supabase)
// para poder importarse desde el Client Component que aplica los filtros de
// Oficina de Venta y Grupo Vendedor. La query que arma las filas vive en
// src/lib/admin-queries.ts (getAdminExecutionSnapshot).

import { isPvpDeviated } from "@/data/pvp-thresholds";
import { sectorGroup, SECTOR_LABELS, type Sector } from "@/lib/sectors";
import { bucketKeyFor, bucketLabelFor } from "@/lib/date-buckets";
import { CAMPAIGN_WEEKS } from "@/lib/campaign-weeks";
import type { Location } from "@/types";

export { CAMPAIGN_WEEKS };

/** Una fila por cliente de la cartera, con su última visita de mercaderista. */
export interface AdminPdvRow {
  location: Location;
  /** Tiene volumen SAP de Panquecitas: pedido y/o factura (booleano, sin kg). */
  comprador: boolean;
  /** Fecha de la primera actividad SAP (pedido o factura), o null si no tiene. */
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

/**
 * Cartera inicial fija del piloto (358 clientes) — denominador de la tarjeta
 * "% Clientes que compraron": venta publicada en el Radar de Panquecitas
 * contra la cartera inicial, no contra la cartera filtrada del momento (ver
 * decisión con Mariana, 08-08-2026). Mismo criterio de penetración que DIENN.
 */
export const CARTERA_INICIAL = 358;

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

// ── Listas de incidencias (Bloque 1 y 2) ──────────────────────────

export function clientesSinVentaSap(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter((r) => !r.comprador);
}

export function clientesConVentaSap(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter((r) => r.comprador);
}

export function clientesPrecioIncorrecto(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter(precioIncorrecto);
}

export function clientesSinMaterialPop(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter((r) => r.visitado && r.popPresent === false);
}

export function clientesRiesgoStockOut(rows: AdminPdvRow[]): AdminPdvRow[] {
  return rows.filter((r) => r.visitado && unidadesTotales(r) < STOCK_OUT_UMBRAL_UNIDADES);
}

export type MotivoExhibicion = "CARAS_INSUFICIENTES" | "SIN_PRESENCIA";

export interface ExhibicionRow {
  row: AdminPdvRow;
  motivo: MotivoExhibicion;
}

export function clientesExhibicionDeficiente(rows: AdminPdvRow[]): ExhibicionRow[] {
  const result: ExhibicionRow[] = [];
  for (const row of rows) {
    if (!row.visitado) continue;
    if (row.productPresent === false) {
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

export interface AdminKpis {
  /** % de la cartera inicial (358) con venta publicada en el Radar de Panquecitas. */
  compraron: { pct: number; count: number; total: number };
  /** % de clientes evaluables con el precio de su zona correcto. */
  precioCorrecto: { pct: number; count: number; total: number };
  /** % de clientes visitados con material POP presente. */
  materialPop: { pct: number; count: number; total: number };
  /** Clientes con menos de 2 unidades entre anaquel y depósito. */
  riesgoStockOut: { count: number; total: number };
  /** % de la cartera visitada por el mercaderista. */
  coberturaMercaderista: { pct: number; count: number; total: number };
  /** % de la cartera que falta por visitar (complemento de la cobertura). */
  faltaPorVisitar: { pct: number; count: number; total: number };
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

export function computeAdminKpis(rows: AdminPdvRow[]): AdminKpis {
  const total = rows.length;

  const compradores = rows.filter((r) => r.comprador).length;

  const evaluables = rows.filter(precioEvaluable);
  const correctos = evaluables.filter((r) => !precioIncorrecto(r)).length;

  const visitados = rows.filter((r) => r.visitado);
  const conPop = visitados.filter((r) => r.popPresent === true).length;

  const enRiesgo = clientesRiesgoStockOut(rows).length;
  const faltantes = total - visitados.length;

  return {
    // Denominador fijo: la cartera inicial de 358, no la cartera filtrada.
    compraron: { pct: pct(compradores, CARTERA_INICIAL), count: compradores, total: CARTERA_INICIAL },
    precioCorrecto: { pct: pct(correctos, evaluables.length), count: correctos, total: evaluables.length },
    materialPop: { pct: pct(conPop, visitados.length), count: conPop, total: visitados.length },
    riesgoStockOut: { count: enRiesgo, total: visitados.length },
    coberturaMercaderista: { pct: pct(visitados.length, total), count: visitados.length, total },
    faltaPorVisitar: { pct: pct(faltantes, total), count: faltantes, total },
  };
}

// ── Gráfico: activación de clientes en el tiempo ───────────────────
// % acumulado de la cartera (del corte de filtros vigente — Oficina de
// Venta / Grupo Vendedor) que ya registró su primera venta facturada en
// SAP, semana a semana. Se calcula 100% en el cliente a partir de
// `primeraCompra` (fecha de la primera venta facturada por PDV, ya resuelta
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
 * auditoría (S2/S4/S6/S8) — sobre los clientes VISITADOS esa semana (mismo
 * criterio que las tarjetas de KPI: % POP = con POP / visitados, % precio
 * correcto = correctos / evaluables). Una semana sin visitas en el corte de
 * filtros vigente simplemente no aparece en el gráfico.
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
    const evaluables = rows.filter(precioEvaluable);
    const correctos = evaluables.filter((r) => !precioIncorrecto(r)).length;

    points.push({
      label: week.label,
      color: week.color,
      popPct: pct(conPop, rows.length),
      precioPct: pct(correctos, evaluables.length),
    });
  }
  return points;
}

export function computeActivacionSemanal(rows: AdminPdvRow[]): ActivacionPoint[] {
  const total = rows.length;
  if (total === 0) return [];

  const conFecha = rows.filter((r): r is AdminPdvRow & { primeraCompra: string } => r.primeraCompra !== null);
  if (conFecha.length === 0) return [];

  const buckets = Array.from(new Set(conFecha.map((r) => bucketKeyFor(r.primeraCompra, "week")))).sort();

  return buckets.map((bucket) => {
    const count = conFecha.filter((r) => bucketKeyFor(r.primeraCompra, "week") <= bucket).length;
    return { bucket, label: bucketLabelFor(bucket, "week"), pct: pct(count, total), count };
  });
}
