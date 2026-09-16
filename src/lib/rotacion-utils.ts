// Escala de rotación de Panquecitas en el PDV — puro, sin dependencias de
// servidor, para poder importarse desde Client Components (mismo criterio que
// src/lib/sectors.ts). La query que arma cada medición vive en
// src/lib/cruce-mercaderista-radar.ts.
//
// La escala se mide en DÍAS HÁBILES DE COBERTURA (lunes a viernes, igual que
// el resto de la app — ver business-days.ts): cuántos días hábiles le dura al
// PDV el inventario que contó el mercaderista al ritmo al que vendió en el
// período medido. Así se comparan PDV con períodos de distinta duración. Los
// cortes están atados a la ronda de visitas: 14 días naturales = 10 hábiles
// (DIENN, 16-09-2026). La escala solo CLASIFICA la rotación; no prescribe
// ninguna acción.

/** Menos de estos días hábiles de cobertura: rotación alta. */
export const COBERTURA_ALTA_DIAS = 5;
/** Desde ALTA hasta menos de estos días hábiles: rotación media. */
export const COBERTURA_MEDIA_DIAS = 10;
/** Desde MEDIA hasta estos días hábiles inclusive: rotación baja. Por encima: muy baja. */
export const COBERTURA_BAJA_DIAS = 20;
/** Período mínimo (días hábiles) entre el inicio y la visita para clasificar la rotación. */
export const PERIODO_MINIMO_DIAS = 5;
/** Segmentos con menos PDV medidos que esto se marcan como muestra chica. */
export const MUESTRA_MINIMA_SEGMENTO = 5;

/**
 * - AGOTADO: el mercaderista contó 0 — vendió todo lo disponible del período.
 * - ALTA / MEDIA / BAJA / MUY_BAJA: según los días hábiles de cobertura.
 *   MUY_BAJA incluye "sin movimiento": contó exactamente lo disponible.
 *
 * Fuera de la escala (se muestran, pero no suman en los totales):
 * - INCONSISTENTE: contó más producto del que tenía disponible (vendido < 0);
 *   el conteo o el Radar no cuadran.
 * - PERIODO_CORTO: menos de PERIODO_MINIMO_DIAS hábiles entre el inicio y la
 *   visita; muy poco tiempo para decir algo de su rotación.
 *
 * Los PDV de modelo indirecto SÍ se miden igual que los directos: su Radar es
 * la venta de la franquiciada o distribuidora a ese PDV (DIENN, 16-09-2026).
 */
export type NivelRotacion =
  | "AGOTADO"
  | "ALTA"
  | "MEDIA"
  | "BAJA"
  | "MUY_BAJA"
  | "INCONSISTENTE"
  | "PERIODO_CORTO";

export const ORDEN_NIVELES: NivelRotacion[] = [
  "AGOTADO",
  "ALTA",
  "MEDIA",
  "BAJA",
  "MUY_BAJA",
  "INCONSISTENTE",
  "PERIODO_CORTO",
];

/** Niveles que no entran en la escala ni en los totales. */
export const NIVELES_FUERA_DE_ESCALA: ReadonlySet<NivelRotacion> = new Set<NivelRotacion>([
  "INCONSISTENTE",
  "PERIODO_CORTO",
]);

/** Tolerancia para no marcar como inconsistente (o con venta) un redondeo de gramos. */
export const EPSILON_KG = 0.05;

/** Nivel que corresponde a una cobertura finita (días hábiles). */
export function nivelPorCobertura(coberturaDias: number): NivelRotacion {
  if (coberturaDias < COBERTURA_ALTA_DIAS) return "ALTA";
  if (coberturaDias < COBERTURA_MEDIA_DIAS) return "MEDIA";
  if (coberturaDias <= COBERTURA_BAJA_DIAS) return "BAJA";
  return "MUY_BAJA";
}

export function nivelRotacion(inventarioKg: number, vendidoKg: number, coberturaDias: number | null): NivelRotacion {
  if (vendidoKg < -EPSILON_KG) return "INCONSISTENTE";
  if (inventarioKg <= 0) return "AGOTADO";
  // Con inventario y sin venta la cobertura es infinita.
  if (coberturaDias == null) return "MUY_BAJA";
  return nivelPorCobertura(coberturaDias);
}

/** Texto del rango de la escala para un nivel ("de 5 a menos de 10 días hábiles de cobertura"). */
export function rangoNivel(nivel: NivelRotacion): string {
  switch (nivel) {
    case "AGOTADO":
      return "inventario 0 al momento de la visita";
    case "ALTA":
      return `menos de ${COBERTURA_ALTA_DIAS} días hábiles de cobertura`;
    case "MEDIA":
      return `de ${COBERTURA_ALTA_DIAS} a menos de ${COBERTURA_MEDIA_DIAS} días hábiles de cobertura`;
    case "BAJA":
      return `de ${COBERTURA_MEDIA_DIAS} a ${COBERTURA_BAJA_DIAS} días hábiles de cobertura`;
    case "MUY_BAJA":
      return `más de ${COBERTURA_BAJA_DIAS} días hábiles de cobertura, o sin movimiento en el período`;
    case "INCONSISTENTE":
      return "se contó más producto del disponible";
    case "PERIODO_CORTO":
      return `menos de ${PERIODO_MINIMO_DIAS} días hábiles de período, no se clasifica`;
  }
}

/** Lo mínimo de una medición por PDV que hace falta para agregarla. */
export interface MedicionRotacion {
  dias: number;
  inventarioKg: number;
  disponibleKg: number;
  vendidoKg: number;
  pctVendido: number | null;
  ritmoKgDia: number;
  coberturaDias: number | null;
  nivel: NivelRotacion;
}

export interface ResumenRotacion {
  /** PDV del grupo (incluye los que quedan fuera de la escala). */
  pdv: number;
  /** PDV que entran a los totales (sin los fuera de la escala). */
  pdvValidos: number;
  /** PDV "sin movimiento" (ritmo 0) dentro de la escala: suman inventario y no ritmo. */
  pdvSinMovimiento: number;
  inventarioKg: number;
  disponibleKg: number;
  vendidoKg: number;
  /** % vendido ponderado: Σ vendido ÷ Σ disponible × 100; null sin disponible. */
  pctVendido: number | null;
  /** Σ ritmo de los PDV, kg/día hábil. */
  ritmoKgDia: number;
  /** Ritmo por PDV: Σ ritmo ÷ PDV, kg/día hábil. */
  ritmoPorPdvKgDia: number | null;
  /** Cobertura ponderada: Σ inventario ÷ Σ ritmo, días hábiles; null si no hubo venta. */
  coberturaDias: number | null;
  /** Período ponderado por disponible: Σ (días × disponible) ÷ Σ disponible, días hábiles. */
  periodoDias: number | null;
  /** Nivel del grupo (cobertura ponderada) con la misma escala que el PDV. */
  nivel: NivelRotacion | null;
  porNivel: Record<NivelRotacion, number>;
}

/**
 * Agrega mediciones por PDV PONDERANDO por volumen (DIENN, 16-09-2026): se
 * suma primero y se divide después, no se promedian los ratios de cada PDV.
 * Un PDV chico con 190 días de cobertura no arrastra al grupo; pesa lo que
 * pesan sus kilos.
 *
 *   cobertura = Σ inventario ÷ Σ ritmo
 *   % vendido = Σ vendido ÷ Σ disponible
 *   período   = Σ (días × disponible) ÷ Σ disponible
 *
 * Los "sin movimiento" entran con su inventario y ritmo 0. Los fuera de la
 * escala se cuentan pero no suman.
 */
export function resumirRotacion(filas: readonly MedicionRotacion[]): ResumenRotacion {
  const porNivel = Object.fromEntries(ORDEN_NIVELES.map((n) => [n, 0])) as Record<NivelRotacion, number>;
  let inventarioKg = 0;
  let disponibleKg = 0;
  let vendidoKg = 0;
  let ritmoKgDia = 0;
  let diasPorDisponible = 0;
  let pdvValidos = 0;
  let pdvSinMovimiento = 0;

  for (const f of filas) {
    porNivel[f.nivel] += 1;
    if (NIVELES_FUERA_DE_ESCALA.has(f.nivel)) continue;
    pdvValidos += 1;
    if (f.nivel !== "AGOTADO" && f.coberturaDias == null) pdvSinMovimiento += 1;
    inventarioKg += f.inventarioKg;
    disponibleKg += f.disponibleKg;
    vendidoKg += f.vendidoKg;
    ritmoKgDia += f.ritmoKgDia;
    diasPorDisponible += f.dias * f.disponibleKg;
  }

  const coberturaDias = ritmoKgDia > 0 ? Math.round((inventarioKg / ritmoKgDia) * 10) / 10 : null;
  return {
    pdv: filas.length,
    pdvValidos,
    pdvSinMovimiento,
    inventarioKg: Math.round(inventarioKg * 10) / 10,
    disponibleKg: Math.round(disponibleKg * 10) / 10,
    vendidoKg: Math.round(vendidoKg * 10) / 10,
    pctVendido: disponibleKg > 0 ? Math.round((vendidoKg / disponibleKg) * 1000) / 10 : null,
    ritmoKgDia: Math.round(ritmoKgDia * 100) / 100,
    ritmoPorPdvKgDia: pdvValidos > 0 ? Math.round((ritmoKgDia / pdvValidos) * 100) / 100 : null,
    coberturaDias,
    periodoDias: disponibleKg > 0 ? Math.round((diasPorDisponible / disponibleKg) * 10) / 10 : null,
    nivel: pdvValidos > 0 ? nivelRotacion(inventarioKg, vendidoKg, coberturaDias) : null,
    porNivel,
  };
}
