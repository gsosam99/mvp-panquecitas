// Old School — proyección simple por equivalencia de activación (DIENN,
// 30-09-2026, pedido de Asdrúbal). Módulo aparte de "Ciudades completas":
// allá la proyección es por tipo de cliente; aquí es un solo promedio por
// ciudad, con el perfil de SU sector piloto:
//   · Barquisimeto completo con los valores de Cabudare;
//   · Cumaná completa con los valores de Cumaná piloto.
//
//   1. Equivalencia de activación:
//        clientes activados = clientes de la ciudad completa × activación del sector piloto
//   2. Venta promedio diaria equivalente:
//        kg/día por activo = Radar de Panquecitas del sector ÷ días hábiles del piloto ÷ activos
//        kg/día de la ciudad = clientes activados × kg/día por activo
//
// Puro, sin dependencias de servidor, igual que bqto-completo.ts.

import { DIAS_HABILES_MES, MESES_PROYECCION, META_PCT, type BqtoResumen } from "@/lib/bqto-completo";

/** Cómo está hoy un sector del piloto. */
export interface ReferenciaOldSchool {
  etiqueta: string;
  /** Cartera vigente hoy. */
  cartera: number;
  /** Clientes con Radar de Panquecitas > 0 (la tarjeta de activación). */
  activos: number;
  /** activos ÷ cartera × 100. */
  activacionPct: number;
  /** Cartera sin los inactivos de segmentos no vendibles. */
  carteraFoco: number;
  /** activos ÷ carteraFoco × 100. */
  activacionFocoPct: number;
  /** Radar de Panquecitas de la cartera vigente del sector desde el arranque del piloto. */
  kgPanquecitas: number;
  desde: string;
  /** Último día hábil con Radar de Panquecitas. */
  corte: string | null;
  diasHabiles: number;
  /** kgPanquecitas ÷ diasHabiles: la venta promedio diaria del sector. */
  kgDia: number;
  /** kgDia ÷ activos. */
  kgDiaPorActivo: number;
}

export interface EscenarioOldSchool {
  poblacion: string;
  /** Clientes de la ciudad completa (Harina PAN > 0 en su Radar de 3 meses). */
  clientes: number;
  activacionPct: number;
  activados: number;
  /** activados ÷ activos del sector piloto: cuántas veces el piloto es la ciudad activada. */
  vecesPiloto: number;
  kgDia: number;
  kgMes: number;
  kgPeriodo: number;
  /** 4% de la Harina PAN mensual de esa población. */
  metaMes: number;
  /** kgMes ÷ metaMes × 100. */
  pctMeta: number;
}

function escenario(
  poblacion: string,
  clientes: number,
  activacionPct: number,
  panMes: number,
  ref: ReferenciaOldSchool
): EscenarioOldSchool {
  const activados = clientes * (activacionPct / 100);
  const kgDia = activados * ref.kgDiaPorActivo;
  const kgMes = kgDia * DIAS_HABILES_MES;
  const metaMes = panMes * META_PCT;
  return {
    poblacion,
    clientes,
    activacionPct,
    activados,
    vecesPiloto: ref.activos > 0 ? activados / ref.activos : 0,
    kgDia,
    kgMes,
    kgPeriodo: kgMes * MESES_PROYECCION,
    metaMes,
    pctMeta: metaMes > 0 ? (kgMes / metaMes) * 100 : 0,
  };
}

/**
 * Todos los clientes con la activación total del sector; segmentos foco con la
 * activación foco (activos ÷ cartera sin los no vendibles), que es la que
 * corresponde a una población sin esos segmentos.
 */
export function escenariosOldSchool(r: BqtoResumen, ref: ReferenciaOldSchool): EscenarioOldSchool[] {
  return [
    escenario("Todos los clientes", r.clientes, ref.activacionPct, r.promedioMesKg, ref),
    escenario("Segmentos foco", r.clientesFoco, ref.activacionFocoPct, r.promedioMesFocoKg, ref),
  ];
}

/** Suma de las ciudades, población por población (en el mismo orden). */
export function sumarOldSchool(
  partes: EscenarioOldSchool[][],
  activosPiloto: number
): EscenarioOldSchool[] {
  if (partes.length === 0) return [];
  return partes[0].map((base, i) => {
    const suma = (f: (e: EscenarioOldSchool) => number) => partes.reduce((s, p) => s + f(p[i]), 0);
    const clientes = suma((e) => e.clientes);
    const activados = suma((e) => e.activados);
    const kgMes = suma((e) => e.kgMes);
    const metaMes = suma((e) => e.metaMes);
    return {
      poblacion: base.poblacion,
      clientes,
      activacionPct: clientes > 0 ? (activados / clientes) * 100 : 0,
      activados,
      vecesPiloto: activosPiloto > 0 ? activados / activosPiloto : 0,
      kgDia: suma((e) => e.kgDia),
      kgMes,
      kgPeriodo: suma((e) => e.kgPeriodo),
      metaMes,
      pctMeta: metaMes > 0 ? (kgMes / metaMes) * 100 : 0,
    };
  });
}
