// Segmentos de cartera donde NO se puede vender alimentos — y por lo tanto
// donde no es realista colocar Panquecitas (DIENN, 03-09-2026).
//
// Puro, sin dependencias de servidor, para poder importarse también desde
// Client Components — mismo criterio que src/lib/sectors.ts y cohortes.ts.
//
// PARA QUÉ SIRVE: la activación (clientes con Radar de Panquecitas ÷ cartera)
// se castiga con PDV a los que el producto nunca les va a entrar. Esta lista
// permite calcular una activación AJUSTADA que los saca del denominador.
//
// EL CRITERIO (DIENN, 03-09-2026) son DOS condiciones:
//
//   1. el cliente está INACTIVO — cero Radar de Panquecitas,
//   2. su segmento está en esta lista.
//
// Nada más. Que el PDV compre Harina PAN o no NO influye en el descarte: esa
// información se sigue mostrando en la tarjeta de inactivos por segmento, pero
// es solo informativa. (Una versión anterior la usaba como tercera condición
// —"si vende PAN mueve alimentos, se queda"— y DIENN la descartó.)
//
// Un cliente ACTIVO nunca se descarta, esté donde esté: ya se le vendió, así
// que es alcanzable por definición. Por eso el ajuste solo puede sacar gente
// del denominador y el numerador queda intacto.
//
// Los nombres salen de "Segmento de Clientes 2" de la Cartera Consolidada
// (locations.segmento_cliente, migration 016) — el mismo campo del Ranking de
// Volumen por Segmento. Los TRES segmentos CS entran, incluido CS Tradicional.
export const SEGMENTOS_SIN_ALIMENTOS = [
  "CP Licorerias",
  "CS Tradicional",
  "CS Alta Visibilidad",
  "CS Media Visibilidad",
  "CP Farmacias/Perf",
  "CP Cad Farmacia",
  "CP Animales /Semilla",
  "CP Esp Mascota",
] as const;

// Rango Unicode de marcas diacríticas combinantes — mismo enfoque que
// foldSector() en sectors.ts.
const DIACRITICS_RE = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

/**
 * Normaliza un nombre de segmento para comparar: sin tildes, sin
 * mayúsculas/minúsculas y sin espacios de más.
 *
 * Hace falta porque los nombres vienen de un Excel y llegan con variaciones
 * reales: "CP Animales /Semilla" trae un espacio antes de la barra, y
 * "CP Panadería" puede venir con o sin tilde según la exportación. Comparar
 * literal dejaría segmentos fuera de la lista sin que nadie se entere.
 */
export function foldSegmento(valor: string | null | undefined): string {
  return (valor ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/");
}

const SEGMENTOS_SIN_ALIMENTOS_FOLDED = new Set(SEGMENTOS_SIN_ALIMENTOS.map(foldSegmento));

/** ¿Este segmento es de los que no venden alimentos? */
export function esSegmentoSinAlimentos(segmento: string | null | undefined): boolean {
  return SEGMENTOS_SIN_ALIMENTOS_FOLDED.has(foldSegmento(segmento));
}

/** Etiqueta para los clientes sin segmento en la cartera. */
export const SEGMENTO_SIN_DATO = "Sin segmento";
