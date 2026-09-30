// Old School — proyección simple de ciudades completas (DIENN, 30-09-2026,
// pedido de Asdrúbal). Módulo aparte de "Ciudades completas": allá la
// proyección es por tipo de cliente; aquí cada ciudad usa el perfil de SU
// sector piloto:
//   · Barquisimeto completo con los valores de Cabudare;
//   · Cumaná completa con los valores de Cumaná piloto.
//
// La proyección principal es por participación en la demanda (ver abajo).
// El método por cliente activo queda como referencia:
//   1. Equivalencia de activación, por separado para segmentos foco y fuera
//      de foco, en dos escenarios según cómo se corta el foco del piloto
//      (ver CriterioFoco):
//        clientes activados = clientes de la ciudad del grupo × activación del grupo en el piloto
//   2. Venta promedio diaria equivalente:
//        kg/día por activo = Radar de Panquecitas del sector ÷ días hábiles del piloto ÷ activos
//        kg/día = clientes activados × kg/día por activo
//   "Todos los clientes" = foco + fuera de foco, así que nunca queda por
//   debajo de foco (con una sola activación para todos no se cumplía: la del
//   piloto está diluida por sus inactivos fuera de foco).
//
// Puro, sin dependencias de servidor, igual que bqto-completo.ts.

import { DIAS_HABILES_3M } from "@/lib/business-days";
import { DIAS_HABILES_MES, MESES_PROYECCION, META_PCT, type BqtoResumen } from "@/lib/bqto-completo";

// ── Proyección por participación en la demanda (DIENN, 30-09-2026) ──
// La principal: cuánto representa la venta diaria de Panquecitas del sector
// piloto sobre la demanda de Harina PAN de su zona (su cartera), y ese mismo %
// aplicado a la Harina PAN de la ciudad completa. Barquisimeto con el % de
// Cabudare, Cumaná con el de Cumaná piloto.
//
// Dos bases para la Harina PAN del piloto, porque las dos fuentes no miden lo
// mismo:
//   · "dashboard": el promedio de PAN del gráfico de ratios (radar_3m_records
//     ÷ 63), el % que se ve en el dashboard.
//   · "misma fuente": el PAN de los clientes del piloto dentro del mismo
//     archivo de la ciudad completa (bqto_3m_ventas ÷ 63). Numerador del % y
//     demanda de la ciudad salen del mismo reporte.

export type BaseRatio = "dashboard" | "mismaFuente";

/** El % de la demanda que hoy vende en Panquecitas un sector piloto. */
export interface RatioDemanda {
  etiqueta: string;
  /** Panquecitas por día hábil desde el arranque (la serie del dashboard). */
  panqKgDia: number;
  dias: number;
  desde: string | null;
  hasta: string | null;
  /** Harina PAN por día de la cartera del sector según cada base. */
  panKgDia: Record<BaseRatio, number>;
  /** panqKgDia ÷ panKgDia × 100. */
  ratioPct: Record<BaseRatio, number>;
  /** Clientes de la cartera del piloto que aparecen en el archivo de la ciudad. */
  clientesEnArchivo: number;
}

export interface ProyeccionDemanda {
  /** Harina PAN por día de la ciudad completa (3 meses ÷ 63). */
  panKgDia: number;
  ratioPct: number;
  kgDia: number;
  kgMes: number;
  kgPeriodo: number;
  metaMes: number;
  pctMeta: number;
}

export function proyeccionDemanda(r: BqtoResumen, ratioPct: number): ProyeccionDemanda {
  const panKgDia = r.totalKg / DIAS_HABILES_3M;
  const kgDia = panKgDia * (ratioPct / 100);
  const kgMes = kgDia * DIAS_HABILES_MES;
  const metaMes = r.promedioMesKg * META_PCT;
  return {
    panKgDia,
    ratioPct,
    kgDia,
    kgMes,
    kgPeriodo: kgMes * MESES_PROYECCION,
    metaMes,
    pctMeta: metaMes > 0 ? (kgMes / metaMes) * 100 : 0,
  };
}

/** Suma de ciudades; el % que devuelve es el efectivo (kg ÷ PAN). */
export function sumarDemanda(partes: ProyeccionDemanda[]): ProyeccionDemanda {
  const suma = (f: (p: ProyeccionDemanda) => number) => partes.reduce((s, p) => s + f(p), 0);
  const panKgDia = suma((p) => p.panKgDia);
  const kgDia = suma((p) => p.kgDia);
  const kgMes = suma((p) => p.kgMes);
  const metaMes = suma((p) => p.metaMes);
  return {
    panKgDia,
    ratioPct: panKgDia > 0 ? (kgDia / panKgDia) * 100 : 0,
    kgDia,
    kgMes,
    kgPeriodo: suma((p) => p.kgPeriodo),
    metaMes,
    pctMeta: metaMes > 0 ? (kgMes / metaMes) * 100 : 0,
  };
}

// ── Método por cliente activo (el primero que se armó) ──────────────

/** Cartera y activos de un grupo de clientes del sector piloto. */
export interface GrupoPiloto {
  cartera: number;
  activos: number;
  /** activos ÷ cartera × 100. */
  activacionPct: number;
}

/**
 * Con qué criterio se corta foco / fuera de foco en el PILOTO. En la ciudad
 * siempre es por tipo de cliente: su archivo no trae el segmento.
 *   · "tipo" (conservador): el mismo corte que la ciudad. Los CS (Tradicional,
 *     Alta y Media Visibilidad) tienen giro de bodega y caen en foco; en
 *     Cabudare casi no están activos y bajan la activación foco.
 *   · "segmento" (optimista): el corte del dashboard (SEGMENTOS_SIN_ALIMENTOS),
 *     sin los CS. Supone que el foco de la ciudad se activa como los segmentos
 *     de alimentos del piloto.
 */
export type CriterioFoco = "tipo" | "segmento";

export const CRITERIOS_FOCO: { criterio: CriterioFoco; titulo: string; nota: string }[] = [
  {
    criterio: "tipo",
    titulo: "Escenario conservador — foco por tipo de cliente",
    nota: "Foco y fuera de foco del piloto cortados por tipo de cliente, igual que la ciudad: los CS del piloto cuentan como foco con su activación de hoy.",
  },
  {
    criterio: "segmento",
    titulo: "Escenario optimista — foco por segmento",
    nota: "Foco y fuera de foco del piloto cortados por segmento, como el dashboard (sin los CS): el foco de la ciudad se activa como los segmentos de alimentos del piloto.",
  },
];

/** Cómo está hoy un sector del piloto. */
export interface ReferenciaOldSchool {
  etiqueta: string;
  /** Cartera vigente hoy completa (la tarjeta de activación del dashboard). */
  total: GrupoPiloto;
  /** Foco / fuera de foco del piloto según cada criterio. */
  grupos: Record<CriterioFoco, { foco: GrupoPiloto; noFoco: GrupoPiloto }>;
  /** Radar de Panquecitas de la cartera vigente del sector desde el arranque del piloto. */
  kgPanquecitas: number;
  desde: string;
  /** Último día hábil con Radar de Panquecitas. */
  corte: string | null;
  diasHabiles: number;
  /** kgPanquecitas ÷ diasHabiles: la venta promedio diaria del sector. */
  kgDia: number;
  /** kgDia ÷ activos totales. */
  kgDiaPorActivo: number;
}

export interface EscenarioOldSchool {
  poblacion: string;
  /** Clientes de la ciudad completa (Harina PAN > 0 en su Radar de 3 meses). */
  clientes: number;
  /** Efectiva: activados ÷ clientes × 100. */
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
  destacada?: boolean;
}

function armarEscenario(
  poblacion: string,
  clientes: number,
  activados: number,
  panMes: number,
  kgDiaPorActivo: number,
  activosPiloto: number,
  destacada = false
): EscenarioOldSchool {
  const kgDia = activados * kgDiaPorActivo;
  const kgMes = kgDia * DIAS_HABILES_MES;
  const metaMes = panMes * META_PCT;
  return {
    poblacion,
    clientes,
    activacionPct: clientes > 0 ? (activados / clientes) * 100 : 0,
    activados,
    vecesPiloto: activosPiloto > 0 ? activados / activosPiloto : 0,
    kgDia,
    kgMes,
    kgPeriodo: kgMes * MESES_PROYECCION,
    metaMes,
    pctMeta: metaMes > 0 ? (kgMes / metaMes) * 100 : 0,
    destacada,
  };
}

/** Segmentos foco, fuera de foco y todos (= la suma de los dos), en ese orden. */
export function escenariosOldSchool(
  r: BqtoResumen,
  ref: ReferenciaOldSchool,
  criterio: CriterioFoco
): EscenarioOldSchool[] {
  const { foco, noFoco } = ref.grupos[criterio];
  const clientesNoFoco = r.clientes - r.clientesFoco;
  const activadosFoco = r.clientesFoco * (foco.activacionPct / 100);
  const activadosNoFoco = clientesNoFoco * (noFoco.activacionPct / 100);
  const a = ref.total.activos;
  return [
    armarEscenario("Segmentos foco", r.clientesFoco, activadosFoco, r.promedioMesFocoKg, ref.kgDiaPorActivo, a),
    armarEscenario(
      "Fuera de foco",
      clientesNoFoco,
      activadosNoFoco,
      r.promedioMesKg - r.promedioMesFocoKg,
      ref.kgDiaPorActivo,
      a
    ),
    armarEscenario(
      "Todos los clientes",
      r.clientes,
      activadosFoco + activadosNoFoco,
      r.promedioMesKg,
      ref.kgDiaPorActivo,
      a,
      true
    ),
  ];
}

/** Suma de las ciudades, población por población (en el mismo orden). */
export function sumarOldSchool(partes: EscenarioOldSchool[][], activosPiloto: number): EscenarioOldSchool[] {
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
      destacada: base.destacada,
    };
  });
}
