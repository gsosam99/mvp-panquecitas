// Métricas del dashboard de Administrador — funciones puras (sin Supabase)
// para poder importarse desde el Client Component que aplica los filtros de
// Oficina de Venta y Grupo Vendedor. La query que arma las filas vive en
// src/lib/admin-queries.ts (getAdminExecutionSnapshot).

import { isPvpDeviated } from "@/data/pvp-thresholds";
import { sectorGroup, SECTOR_LABELS, type Sector } from "@/lib/sectors";
import type { Location } from "@/types";

/** Una fila por cliente de la cartera, con su última visita de mercaderista. */
export interface AdminPdvRow {
  location: Location;
  /** Registró venta de Panquecitas en SAP (booleano, sin volúmenes). */
  comprador: boolean;
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
  /** % de la cartera que registró venta en SAP. */
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
    compraron: { pct: pct(compradores, total), count: compradores, total },
    precioCorrecto: { pct: pct(correctos, evaluables.length), count: correctos, total: evaluables.length },
    materialPop: { pct: pct(conPop, visitados.length), count: conPop, total: visitados.length },
    riesgoStockOut: { count: enRiesgo, total: visitados.length },
    coberturaMercaderista: { pct: pct(visitados.length, total), count: visitados.length, total },
    faltaPorVisitar: { pct: pct(faltantes, total), count: faltantes, total },
  };
}
