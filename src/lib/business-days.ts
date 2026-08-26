// Días hábiles (Lunes–Viernes). Todos los cálculos de la app que prorratean
// por días — ritmo diario de venta, días de inventario, rotación en calle —
// usan DÍAS HÁBILES, no días calendario: el producto se vende y se despacha de
// lunes a viernes, así que dividir por 7 (o contar fines de semana) subestima
// el ritmo diario real. Un mes tiene ~21-22 días hábiles.

/** Días hábiles por semana (L–V). */
export const DIAS_HABILES_POR_SEMANA = 5;

/**
 * Días hábiles en un ciclo de ronda quincenal. El ciclo dura ~14 días
 * calendario entre rondas; excluyendo fines de semana quedan ~10 días hábiles.
 */
export const DIAS_HABILES_POR_QUINCENA = 10;

/**
 * Días hábiles (L–V) entre dos fechas "YYYY-MM-DD", ambas incluidas.
 * Devuelve al menos 1 para poder usarse como divisor sin riesgo.
 *
 * Se cuenta en UTC a propósito: las fechas de los reportes SAP vienen como
 * fecha pura (sin hora ni zona), así que interpretarlas en local desplazaría
 * el día en husos negativos como el de Venezuela.
 */
export function contarDiasHabiles(desde: string, hasta: string): number {
  const inicio = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`);
  const fin = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(inicio) || Number.isNaN(fin) || fin < inicio) return 1;

  let habiles = 0;
  for (let t = inicio; t <= fin; t += 86_400_000) {
    const dow = new Date(t).getUTCDay(); // 0=Dom, 6=Sáb
    if (dow !== 0 && dow !== 6) habiles++;
  }
  return Math.max(1, habiles);
}

/**
 * Días hábiles del período de referencia de 3 meses (mayo–julio 2026).
 *
 * Es una CONSTANTE, no un conteo derivado del archivo (decisión del usuario,
 * 26-08-2026: "el promedio de todos debe ser su venta acumulada de los tres
 * meses [...] dividido entre días hábiles (63)"). Antes cada categoría se
 * dividía entre los días hábiles del rango que de hecho traía su archivo, así
 * que Harina PAN, Margarina y Mayonesa usaban divisores distintos y sus
 * promedios no eran comparables entre sí. Un solo divisor para las tres.
 */
export const DIAS_HABILES_3M = 63;
