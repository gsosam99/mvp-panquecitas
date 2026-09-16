// Escala de rotación de Panquecitas en el PDV — puro, sin dependencias de
// servidor, para poder importarse desde Client Components (mismo criterio que
// src/lib/sectors.ts). La query que arma cada medición vive en
// src/lib/cruce-mercaderista-radar.ts.
//
// La escala se mide en DÍAS DE COBERTURA: cuántos días le dura al PDV el
// inventario que contó el mercaderista al ritmo al que vendió en el período
// medido. Así se comparan PDV con períodos de distinta duración. Los cortes
// están atados a la ronda de visitas de 14 días (DIENN, 16-09-2026). La escala
// solo CLASIFICA la rotación; no prescribe ninguna acción.

/** Menos de estos días de cobertura: rotación alta. */
export const COBERTURA_ALTA_DIAS = 7;
/** Desde ALTA hasta menos de estos días: rotación media. */
export const COBERTURA_MEDIA_DIAS = 14;
/** Desde MEDIA hasta estos días inclusive: rotación baja. Por encima: muy baja. */
export const COBERTURA_BAJA_DIAS = 28;
/** Segmentos con menos PDV medidos que esto se marcan como muestra chica. */
export const MUESTRA_MINIMA_SEGMENTO = 5;

/**
 * - AGOTADO: el mercaderista contó 0 — vendió todo lo disponible del período.
 * - ALTA / MEDIA / BAJA / MUY_BAJA: según los días de cobertura.
 * - INCONSISTENTE: contó más producto del que tenía disponible (vendido < 0);
 *   el conteo o el Radar no cuadran y no se clasifica.
 */
export type NivelRotacion = "AGOTADO" | "ALTA" | "MEDIA" | "BAJA" | "MUY_BAJA" | "INCONSISTENTE";

export const ORDEN_NIVELES: NivelRotacion[] = ["AGOTADO", "ALTA", "MEDIA", "BAJA", "MUY_BAJA", "INCONSISTENTE"];

/** Tolerancia para no marcar como inconsistente un redondeo de gramos. */
const EPSILON_KG = 0.05;

export function nivelRotacion(inventarioKg: number, vendidoKg: number, coberturaDias: number | null): NivelRotacion {
  if (vendidoKg < -EPSILON_KG) return "INCONSISTENTE";
  if (inventarioKg <= 0) return "AGOTADO";
  // Con inventario y sin venta la cobertura es infinita.
  if (coberturaDias == null) return "MUY_BAJA";
  if (coberturaDias < COBERTURA_ALTA_DIAS) return "ALTA";
  if (coberturaDias < COBERTURA_MEDIA_DIAS) return "MEDIA";
  if (coberturaDias <= COBERTURA_BAJA_DIAS) return "BAJA";
  return "MUY_BAJA";
}

/** Texto del rango de la escala para un nivel ("de 7 a menos de 14 días de cobertura"). */
export function rangoNivel(nivel: NivelRotacion): string {
  switch (nivel) {
    case "AGOTADO":
      return "inventario 0 al momento de la visita";
    case "ALTA":
      return `menos de ${COBERTURA_ALTA_DIAS} días de cobertura`;
    case "MEDIA":
      return `de ${COBERTURA_ALTA_DIAS} a menos de ${COBERTURA_MEDIA_DIAS} días de cobertura`;
    case "BAJA":
      return `de ${COBERTURA_MEDIA_DIAS} a ${COBERTURA_BAJA_DIAS} días de cobertura`;
    case "MUY_BAJA":
      return `más de ${COBERTURA_BAJA_DIAS} días de cobertura, o sin venta en el período`;
    case "INCONSISTENTE":
      return "se contó más producto del disponible";
  }
}

/** Lo mínimo de una medición por PDV que hace falta para agregarla. */
export interface MedicionRotacion {
  inventarioKg: number;
  disponibleKg: number;
  vendidoKg: number;
  ritmoKgDia: number;
  nivel: NivelRotacion;
}

export interface ResumenRotacion {
  /** PDV medidos (incluye inconsistentes). */
  pdv: number;
  /** PDV que entran a los totales (sin inconsistentes). */
  pdvValidos: number;
  inventarioKg: number;
  disponibleKg: number;
  vendidoKg: number;
  /** vendido ÷ disponible × 100; null sin disponible. */
  pctVendido: number | null;
  /** Σ ritmo de los PDV, kg/día. */
  ritmoKgDia: number;
  /** Σ inventario ÷ Σ ritmo; null si no hubo venta. */
  coberturaDias: number | null;
  /** Nivel del grupo con la misma escala que el PDV. */
  nivel: NivelRotacion | null;
  porNivel: Record<NivelRotacion, number>;
}

/**
 * Agrega mediciones por PDV. Se suma primero y se divide después (Σ inventario
 * ÷ Σ ritmo), no se promedian las coberturas: un PDV chico con 200 días no
 * debe arrastrar al grupo. Los INCONSISTENTES se cuentan pero no suman.
 */
export function resumirRotacion(filas: readonly MedicionRotacion[]): ResumenRotacion {
  const porNivel = Object.fromEntries(ORDEN_NIVELES.map((n) => [n, 0])) as Record<NivelRotacion, number>;
  let inventarioKg = 0;
  let disponibleKg = 0;
  let vendidoKg = 0;
  let ritmoKgDia = 0;
  let pdvValidos = 0;

  for (const f of filas) {
    porNivel[f.nivel] += 1;
    if (f.nivel === "INCONSISTENTE") continue;
    pdvValidos += 1;
    inventarioKg += f.inventarioKg;
    disponibleKg += f.disponibleKg;
    vendidoKg += f.vendidoKg;
    ritmoKgDia += f.ritmoKgDia;
  }

  const coberturaDias = ritmoKgDia > 0 ? Math.round((inventarioKg / ritmoKgDia) * 10) / 10 : null;
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
    porNivel,
  };
}
