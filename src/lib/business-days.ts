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
