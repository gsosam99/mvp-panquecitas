// Old School — proyección simple por equivalencia de activación (DIENN,
// 30-09-2026, pedido de Asdrúbal). Módulo aparte de "Ciudades completas":
// allá la proyección es por tipo de cliente; aquí es un solo promedio de venta
// por ciudad, con el perfil de SU sector piloto:
//   · Barquisimeto completo con los valores de Cabudare;
//   · Cumaná completa con los valores de Cumaná piloto.
//
//   1. Equivalencia de activación, por separado para segmentos foco y fuera
//      de foco (mismo criterio en el piloto y en la ciudad: esTipoFoco):
//        clientes activados = clientes de la ciudad del grupo × activación del grupo en el piloto
//   2. Venta promedio diaria equivalente:
//        kg/día por activo = Radar de Panquecitas del sector ÷ días hábiles del piloto ÷ activos
//        kg/día = clientes activados × kg/día por activo
//   "Todos los clientes" = foco + fuera de foco, así que nunca queda por
//   debajo de foco (con una sola activación para todos no se cumplía: la del
//   piloto está diluida por sus inactivos fuera de foco).
//
// Puro, sin dependencias de servidor, igual que bqto-completo.ts.

import { DIAS_HABILES_MES, MESES_PROYECCION, META_PCT, type BqtoResumen } from "@/lib/bqto-completo";

/** Cartera y activos de un grupo de clientes del sector piloto. */
export interface GrupoPiloto {
  cartera: number;
  activos: number;
  /** activos ÷ cartera × 100. */
  activacionPct: number;
}

/** Cómo está hoy un sector del piloto. */
export interface ReferenciaOldSchool {
  etiqueta: string;
  /** Cartera vigente hoy completa (la tarjeta de activación del dashboard). */
  total: GrupoPiloto;
  /** Solo tipos de cliente foco (esTipoFoco). */
  foco: GrupoPiloto;
  /** Tipos de cliente fuera de foco. */
  noFoco: GrupoPiloto;
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
export function escenariosOldSchool(r: BqtoResumen, ref: ReferenciaOldSchool): EscenarioOldSchool[] {
  const clientesNoFoco = r.clientes - r.clientesFoco;
  const activadosFoco = r.clientesFoco * (ref.foco.activacionPct / 100);
  const activadosNoFoco = clientesNoFoco * (ref.noFoco.activacionPct / 100);
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
