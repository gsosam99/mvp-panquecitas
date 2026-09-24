// Barquisimeto completo — ratios aparte del piloto (DIENN, 24-09-2026).
//
// Toma la Harina PAN de 3 meses de TODA la ciudad (reporte Radar
// N7_V_SD88_WEB_001, tabla bqto_3m_ventas) y responde:
//   1. cuánto se vendió en los 3 meses, por mes y por día;
//   2. cuánto es el 4% de eso al mes y en 4 meses, para todos los clientes y
//      solo para los segmentos foco;
//   3. cuánto volumen daría activar Barquisimeto completo al % de activación
//      que el piloto tiene hoy, y cómo queda contra ese 4%.
//
// Puro, sin dependencias de servidor, igual que segmentos.ts: el cálculo se
// puede auditar y reutilizar sin Supabase.

import { DIAS_HABILES_3M } from "@/lib/business-days";
import { foldSegmento } from "@/lib/segmentos";

/** Meta de Panquecitas: 4% del volumen de Harina PAN (la misma del dashboard). */
export const META_PCT = 0.04;

/** Horizonte de la proyección, en meses. */
export const MESES_PROYECCION = 4;

/**
 * Días hábiles de un mes: los 63 del período de referencia de 3 meses entre 3.
 * Convierte el ritmo diario de Panquecitas del piloto en un volumen mensual
 * comparable con el promedio mensual de Barquisimeto.
 */
export const DIAS_HABILES_MES = DIAS_HABILES_3M / 3;

/**
 * Tipos de cliente que NO son segmento foco en Barquisimeto completo.
 *
 * El dashboard define "foco" con el "Segmento de Clientes 2" de la cartera
 * (SEGMENTOS_SIN_ALIMENTOS), pero el reporte de Barquisimeto completo solo
 * trae "Tipo de Cliente" (el giro). Esta lista es su equivalente por giro
 * (decisión con DIENN, 24-09-2026): licorerías, farmacias y perfumerías,
 * mascotas y agropecuarias. Los "CS" del segmento no tienen un giro propio y
 * no se pueden separar desde este archivo.
 */
export const TIPOS_NO_FOCO = [
  "LICOR/FRIAXCAJA/DEPO",
  "FARMACIAS",
  "PERFUMERIAS",
  "TIENDA MASC/PETSHOP",
  "DET ABA-AGROPECUARIA",
  "DISTR. ABA - PETFOOD",
] as const;

const TIPOS_NO_FOCO_FOLDED = new Set(TIPOS_NO_FOCO.map(foldSegmento));

/** ¿Este tipo de cliente es segmento foco? Sin tipo cuenta como foco, igual que en la cartera. */
export function esTipoFoco(tipo: string | null | undefined): boolean {
  return !TIPOS_NO_FOCO_FOLDED.has(foldSegmento(tipo));
}

/** Una fila del reporte tal como se guarda: cliente + material + día. */
export interface BqtoFila {
  sap_code: string;
  tipo_cliente: string | null;
  quantity_kg: number;
  date_of_sale: string;
}

export interface BqtoTipoRow {
  tipo: string;
  clientes: number;
  kg: number;
  foco: boolean;
}

export interface BqtoResumen {
  /** Σ de todas las filas (devoluciones restan). */
  totalKg: number;
  totalFocoKg: number;
  porMes: { mes: string; kg: number }[];
  meses: number;
  /** Días distintos con venta en el archivo: el divisor del promedio diario. */
  dias: number;
  desde: string;
  hasta: string;
  /** Clientes con venta neta > 0. */
  clientes: number;
  clientesFoco: number;
  promedioMesKg: number;
  promedioMesFocoKg: number;
  promedioDiaKg: number;
  porTipo: BqtoTipoRow[];
}

const SIN_TIPO = "Sin tipo";

export function resumenBqto(filas: BqtoFila[]): BqtoResumen | null {
  if (filas.length === 0) return null;

  const porCliente = new Map<string, { kg: number; tipo: string }>();
  const porMes = new Map<string, number>();
  const dias = new Set<string>();
  let totalKg = 0;

  for (const f of filas) {
    const kg = Number(f.quantity_kg) || 0;
    const dia = f.date_of_sale.slice(0, 10);
    totalKg += kg;
    dias.add(dia);
    porMes.set(dia.slice(0, 7), (porMes.get(dia.slice(0, 7)) ?? 0) + kg);
    const c = porCliente.get(f.sap_code);
    if (c) c.kg += kg;
    else porCliente.set(f.sap_code, { kg, tipo: f.tipo_cliente?.trim() || SIN_TIPO });
  }

  // El corte foco se hace por CLIENTE (su tipo), no por fila: así kg y
  // clientes de un mismo tipo siempre caen del mismo lado.
  const porTipo = new Map<string, BqtoTipoRow>();
  let totalFocoKg = 0;
  let clientes = 0;
  let clientesFoco = 0;
  for (const { kg, tipo } of porCliente.values()) {
    const foco = esTipoFoco(tipo === SIN_TIPO ? null : tipo);
    let fila = porTipo.get(tipo);
    if (!fila) {
      fila = { tipo, clientes: 0, kg: 0, foco };
      porTipo.set(tipo, fila);
    }
    fila.kg += kg;
    if (foco) totalFocoKg += kg;
    if (kg > 0) {
      fila.clientes += 1;
      clientes += 1;
      if (foco) clientesFoco += 1;
    }
  }

  const diasOrdenados = [...dias].sort();
  const meses = Math.max(1, porMes.size);
  return {
    totalKg,
    totalFocoKg,
    porMes: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, kg]) => ({ mes, kg })),
    meses,
    dias: dias.size,
    desde: diasOrdenados[0],
    hasta: diasOrdenados[diasOrdenados.length - 1],
    clientes,
    clientesFoco,
    promedioMesKg: totalKg / meses,
    promedioMesFocoKg: totalFocoKg / meses,
    promedioDiaKg: totalKg / Math.max(1, dias.size),
    porTipo: [...porTipo.values()].sort((a, b) => b.kg - a.kg),
  };
}

/** La activación de una ciudad (o del piloto entero) que se usa como referencia. */
export interface ReferenciaActivacion {
  etiqueta: string;
  /** Cartera vigente hoy. */
  cartera: number;
  /** Clientes con Radar de Panquecitas > 0. */
  activos: number;
  /** activos ÷ cartera — la activación de la tarjeta del dashboard. */
  activacionPct: number;
  /** Cartera sin los inactivos de segmentos no vendibles. */
  carteraFoco: number;
  /** activos ÷ carteraFoco — la activación "a escala" (segmentos foco). */
  activacionFocoPct: number;
  /** Radar de Panquecitas de esos activos. */
  kgActivos: number;
  /** Σ de meses hábiles de cada activo desde su primera compra hasta el último Radar. */
  mesesCliente: number;
  /** kgActivos ÷ mesesCliente. */
  kgPorActivoMes: number;
  /** Último día con Radar de Panquecitas. */
  corte: string | null;
}

export interface EscenarioProyeccion {
  clientesBase: number;
  activacionPct: number;
  clientesActivados: number;
  kgMes: number;
  kgPeriodo: number;
  metaMes: number;
  metaPeriodo: number;
  /** kgMes ÷ metaMes × 100. */
  pctMeta: number;
}

/**
 * Clientes de Barquisimeto × activación del piloto = clientes activados;
 * × kg de Panquecitas por cliente activo al mes = volumen mensual. Se compara
 * contra el 4% del promedio mensual de Harina PAN de esos mismos clientes.
 */
export function proyectar(
  clientesBase: number,
  activacionPct: number,
  kgPorActivoMes: number,
  harinaPanMesKg: number
): EscenarioProyeccion {
  const clientesActivados = Math.round((clientesBase * activacionPct) / 100);
  const kgMes = clientesActivados * kgPorActivoMes;
  const metaMes = harinaPanMesKg * META_PCT;
  return {
    clientesBase,
    activacionPct,
    clientesActivados,
    kgMes,
    kgPeriodo: kgMes * MESES_PROYECCION,
    metaMes,
    metaPeriodo: metaMes * MESES_PROYECCION,
    pctMeta: metaMes > 0 ? (kgMes / metaMes) * 100 : 0,
  };
}
