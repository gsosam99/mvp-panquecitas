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
// OJO — pertenecer a uno de estos segmentos NO basta para descartar a un
// cliente. El descarte exige las tres condiciones a la vez:
//
//   1. está INACTIVO (sin Radar de Panquecitas),
//   2. NO vende Harina PAN (si vende PAN, vende alimentos: es alcanzable),
//   3. su segmento está en esta lista.
//
// La segunda condición es la que evita botar clientes por prejuicio de
// categoría: una licorería que vende Harina PAN sí mueve comida y se queda en
// el denominador aunque su segmento esté acá.
//
// Los nombres salen de "Segmento de Clientes 2" de la Cartera Consolidada
// (locations.segmento_cliente, migration 016) — el mismo campo del Ranking de
// Volumen por Segmento.
export const SEGMENTOS_SIN_ALIMENTOS = [
  "CP Licorerias",
  "CP Esp Mascota",
  "CP Animales /Semilla",
  "CP Farmacias/Perf",
  "CP Cad Farmacia",
  "CS Alta Visibilidad",
  "CS Media Visibilidad",
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

/**
 * Tipos de cliente (el giro del negocio, 53 valores en la cartera) que se
 * marcan POR DEFECTO como "no le podemos vender" en la tarjeta de Activación
 * Ajustada.
 *
 * Es solo el punto de partida: la tarjeta deja marcar y desmarcar tipos, y el
 * número se recalcula en el momento. La razón es que el criterio todavía se
 * está cerrando con ventas — a nivel de SEGMENTO no se puede expresar (en
 * Barquisimeto los 7 segmentos sin alimentos llegan a 147 PDV y ventas reporta
 * al menos 224), y la lista de ventas no está disponible todavía. Antes que
 * adivinar una regla que cuadre por casualidad, se deja elegir.
 *
 * Este default cubre lo que no admite discusión: retail que no vende comida y
 * locales de ocio/bebidas. Los canales de CONSUMO EN SITIO (restaurantes,
 * luncherías, comida rápida…) quedan FUERA del default a propósito: ahí sí se
 * puede vender mezcla para panquecas, y es la zona gris que ventas tiene que
 * definir.
 */
export const TIPOS_SIN_ALIMENTOS_DEFAULT = [
  "LICOR/FRIAXCAJA/DEPO",
  "FARMACIAS",
  "TIENDA MASC/PETSHOP",
  "CLINICAS VETERINARIA",
  "MAYOR ABA-PETFOOD",
  "DET ABA-AGROPECUARIA",
  "PERFUMERIAS",
  "FERRETERIAS",
  "ZAPAT/TDAS ROPA/MERC",
  "LIBR PAPEL/CTRO FOTO",
  "CYBRCAFE/CTRO INTRNT",
  "TALL MECAN/AUTO",
  "GIMNASIOS / SAUNAS",
  "CLUB SOCIAL/DEPORT.",
  "CERVECERIAS",
  "BARES",
  "NIGHTCLUB/PUB/DISCO",
  "CANCHAS DE BOLAS",
  "BILLARES / BOWLING",
  "GALLERAS",
  "P.HIPIC/VND-PAGA/5Y6",
  "CINES Y TEATROS",
] as const;

const TIPOS_DEFAULT_FOLDED = new Set(TIPOS_SIN_ALIMENTOS_DEFAULT.map(foldSegmento));

/** ¿Este tipo de cliente viene marcado por defecto? Comparación normalizada. */
export function esTipoSinAlimentosPorDefecto(tipo: string | null | undefined): boolean {
  return TIPOS_DEFAULT_FOLDED.has(foldSegmento(tipo));
}
