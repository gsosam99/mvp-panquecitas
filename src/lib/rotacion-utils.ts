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
 * - INDIRECTO: PDV de modelo indirecto; su reposición llega por franquiciada o
 *   distribuidora y el Radar puede no reflejarla completa (DIENN, 16-09-2026).
 */
export type NivelRotacion =
  | "AGOTADO"
  | "ALTA"
  | "MEDIA"
  | "BAJA"
  | "MUY_BAJA"
  | "INCONSISTENTE"
  | "PERIODO_CORTO"
  | "INDIRECTO";

export const ORDEN_NIVELES: NivelRotacion[] = [
  "AGOTADO",
  "ALTA",
  "MEDIA",
  "BAJA",
  "MUY_BAJA",
  "INCONSISTENTE",
  "PERIODO_CORTO",
  "INDIRECTO",
];

/** Niveles que no entran en la escala ni en los totales. */
export const NIVELES_FUERA_DE_ESCALA: ReadonlySet<NivelRotacion> = new Set<NivelRotacion>([
  "INCONSISTENTE",
  "PERIODO_CORTO",
  "INDIRECTO",
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
    case "INDIRECTO":
      return "modelo indirecto, fuera de la escala";
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
  inventarioKg: number;
  disponibleKg: number;
  vendidoKg: number;
  /** vendido ÷ disponible × 100; null sin disponible. */
  pctVendido: number | null;
  /** Σ ritmo de los PDV, kg/día hábil. */
  ritmoKgDia: number;
  /** Σ inventario ÷ Σ ritmo, días hábiles; null si no hubo venta. */
  coberturaDias: number | null;
  /** Nivel del grupo (total ponderado) con la misma escala que el PDV. */
  nivel: NivelRotacion | null;

  // ── Promedio simple por PDV (cada PDV pesa igual) ──
  /** Promedio de los días hábiles de cobertura de los PDV con venta (sin los "sin movimiento"). */
  promedioCoberturaDias: number | null;
  /** Nivel de la escala que corresponde a ese promedio. */
  nivelPromedio: NivelRotacion | null;
  /** PDV "sin movimiento" (cobertura infinita) que no entran al promedio de cobertura. */
  pdvSinMovimiento: number;
  /** Promedio del % vendido de los PDV (los "sin movimiento" cuentan con 0%). */
  promedioPctVendido: number | null;
  /** Promedio del ritmo de los PDV, kg/día hábil. */
  promedioRitmoKgDia: number | null;
  /** Promedio de días hábiles del período medido. */
  promedioDias: number | null;

  porNivel: Record<NivelRotacion, number>;
}

const promedio = (valores: number[]) =>
  valores.length > 0 ? valores.reduce((s, v) => s + v, 0) / valores.length : null;

/**
 * Agrega mediciones por PDV de dos formas:
 *
 * - TOTAL PONDERADO: se suma primero y se divide después (Σ inventario ÷ Σ
 *   ritmo). Los PDV con más volumen pesan más.
 * - PROMEDIO SIMPLE POR PDV: cada PDV pesa igual. La cobertura de un PDV "sin
 *   movimiento" es infinita y no se puede promediar: queda fuera de ese
 *   promedio y se informa cuántos son.
 *
 * En los dos casos, los fuera de la escala se cuentan pero no suman.
 */
export function resumirRotacion(filas: readonly MedicionRotacion[]): ResumenRotacion {
  const porNivel = Object.fromEntries(ORDEN_NIVELES.map((n) => [n, 0])) as Record<NivelRotacion, number>;
  let inventarioKg = 0;
  let disponibleKg = 0;
  let vendidoKg = 0;
  let ritmoKgDia = 0;
  const coberturas: number[] = [];
  const pcts: number[] = [];
  const ritmos: number[] = [];
  const diasPeriodo: number[] = [];
  let pdvSinMovimiento = 0;

  for (const f of filas) {
    porNivel[f.nivel] += 1;
    if (NIVELES_FUERA_DE_ESCALA.has(f.nivel)) continue;
    inventarioKg += f.inventarioKg;
    disponibleKg += f.disponibleKg;
    vendidoKg += f.vendidoKg;
    ritmoKgDia += f.ritmoKgDia;

    // Agotado: cobertura 0 (no le queda nada).
    const cobertura = f.nivel === "AGOTADO" ? 0 : f.coberturaDias;
    if (cobertura == null) pdvSinMovimiento += 1;
    else coberturas.push(cobertura);
    if (f.pctVendido != null) pcts.push(f.pctVendido);
    ritmos.push(f.ritmoKgDia);
    diasPeriodo.push(f.dias);
  }

  const pdvValidos = ritmos.length;
  const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
  const coberturaDias = ritmoKgDia > 0 ? Math.round((inventarioKg / ritmoKgDia) * 10) / 10 : null;
  const promedioCoberturaDias = r1(promedio(coberturas));
  const promedioRitmo = promedio(ritmos);

  return {
    pdv: filas.length,
    pdvValidos,
    inventarioKg: Math.round(inventarioKg * 10) / 10,
    disponibleKg: Math.round(disponibleKg * 10) / 10,
    vendidoKg: Math.round(vendidoKg * 10) / 10,
    pctVendido: disponibleKg > 0 ? Math.round((vendidoKg / disponibleKg) * 1000) / 10 : null,
    ritmoKgDia: Math.round(ritmoKgDia * 100) / 100,
    coberturaDias,
    nivel: pdvValidos > 0 ? nivelRotacion(inventarioKg, vendidoKg, coberturaDias) : null,
    promedioCoberturaDias,
    nivelPromedio: promedioCoberturaDias == null ? null : nivelPorCobertura(promedioCoberturaDias),
    pdvSinMovimiento,
    promedioPctVendido: r1(promedio(pcts)),
    promedioRitmoKgDia: promedioRitmo == null ? null : Math.round(promedioRitmo * 100) / 100,
    promedioDias: r1(promedio(diasPeriodo)),
    porNivel,
  };
}
