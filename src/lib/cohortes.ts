// Tandas de incorporación de clientes a la cartera del piloto (puras, sin
// dependencias de servidor/Supabase, para poder importarse también desde
// Client Components — mismo criterio que src/lib/sectors.ts).
//
// El piloto NO arrancó con la cartera completa: empezó con 358 clientes el
// 03-08-2026 y se fue ampliando. Sin registrar desde cuándo cuenta cada
// cliente, sumar los nuevos castiga retroactivamente todos los indicadores —
// las semanas de agosto pasarían a dividirse entre una cartera que en esa
// fecha no existía. Ver migration 020_fecha_incorporacion.sql.
//
// Para agregar una tanda futura: una entrada más en COHORTES_NUEVAS, antes
// de la de fallback. No hace falta tocar nada más.

export interface Cohorte {
  /** Nombre legible; se guarda en locations.cohorte y alimenta el filtro del dashboard. */
  nombre: string;
  /** Desde cuándo el cliente cuenta en el universo ("YYYY-MM-DD"). */
  desde: string;
  /**
   * Grupos vendedores de SAP que identifican la tanda. Vacío = "todo lo
   * demás" (regla de fallback, debe ir última).
   */
  gruposVendedores: readonly string[];
}

/**
 * Arranque del piloto. Coincide a propósito con HPM_RADAR_DESDE en
 * dienn-queries.ts: es la misma fecha de corte del piloto.
 */
export const PILOTO_INICIO = "2026-08-03";

/**
 * Los 358 originales. No tiene regla por grupo vendedor porque no se deduce
 * del archivo: son, por definición, los que ya estaban en `locations` cuando
 * corrió el migration 020 — que es justo lo que ese migration estampa.
 */
export const COHORTE_PILOTO_ORIGINAL: Cohorte = {
  nombre: "Piloto original",
  desde: PILOTO_INICIO,
  gruposVendedores: [],
};

/**
 * Tandas posteriores, en orden cronológico. Se evalúan de arriba abajo y gana
 * la primera que calce; la última (sin grupos) es el fallback.
 *
 *   - "Indirecto Cumaná" (14-08-2026): el modelo indirecto en Cumaná no
 *     existía antes de esa fecha. Los PDV reales que atiende se distinguen
 *     por los grupos vendedores U27 y U28 — hasta la 006 los únicos grupos
 *     de CUMANA eran U29 y U30. Las 5 franquiciadas que los abastecen NO
 *     entran al universo (ver EXCLUDED_DISTRIBUIDOR_SAP_CODES en sectors.ts):
 *     solo cuentan para leer lo facturado y lo pedido.
 *   - "Ampliación" (24-08-2026): el resto del archivo de cartera
 *     consolidada. Empieza a reportar ventas el lunes 24.
 *
 * Ver conversación con Alejandro (21-08-2026).
 */
export const COHORTES_NUEVAS: readonly Cohorte[] = [
  { nombre: "Indirecto Cumaná", desde: "2026-08-14", gruposVendedores: ["U27", "U28"] },
  { nombre: "Ampliación", desde: "2026-08-24", gruposVendedores: [] },
];

/** Todas las tandas, en orden — alimenta el filtro de cohorte del dashboard. */
export const COHORTES: readonly Cohorte[] = [COHORTE_PILOTO_ORIGINAL, ...COHORTES_NUEVAS];

/**
 * Tanda que le toca a un cliente que TODAVÍA no tiene fecha asignada. Solo se
 * aplica a clientes nuevos: los que ya tienen fecha_incorporacion nunca se
 * recalculan, para que volver a cargar el mismo archivo sea idempotente y no
 * reescriba la historia.
 */
export function cohorteParaClienteNuevo(grupoVendedor: string | null | undefined): Cohorte {
  const grupo = (grupoVendedor ?? "").trim().toUpperCase();
  for (const cohorte of COHORTES_NUEVAS) {
    if (cohorte.gruposVendedores.length === 0) return cohorte; // fallback
    if (cohorte.gruposVendedores.includes(grupo)) return cohorte;
  }
  // Inalcanzable mientras COHORTES_NUEVAS termine en una entrada sin grupos,
  // pero deja el comportamiento definido si alguien la quita por error.
  return COHORTES_NUEVAS[COHORTES_NUEVAS.length - 1] ?? COHORTE_PILOTO_ORIGINAL;
}

/**
 * ¿El cliente ya formaba parte del universo en esa fecha?
 *
 * Sin fecha registrada se considera vigente SIEMPRE, a propósito: si el
 * migration 020 todavía no corrió, toda la app se comporta exactamente como
 * antes en vez de vaciarse. Un deploy adelantado degrada, no rompe.
 */
export function estabaIncorporado(
  fechaIncorporacion: string | null | undefined,
  hasta: string
): boolean {
  if (!fechaIncorporacion) return true;
  return fechaIncorporacion.slice(0, 10) <= hasta;
}

/**
 * Recorta una lista de clientes a los que ya estaban incorporados en `hasta`
 * ("YYYY-MM-DD", inclusive). Es LA operación del modelo: se aplica tanto al
 * denominador (cuántos clientes había) como al numerador (cuáles pudieron
 * comprar), porque contar a un cliente en uno y no en el otro es justamente
 * lo que distorsiona las tasas.
 *
 * Genérica sobre la forma para poder usarse con Location y con las filas
 * reducidas que arman las queries de DIENN.
 */
export function vigentesAl<T extends { fecha_incorporacion?: string | null }>(
  items: readonly T[],
  hasta: string
): T[] {
  return items.filter((i) => estabaIncorporado(i.fecha_incorporacion, hasta));
}

/** Cohorte por nombre, para resolver el filtro del dashboard. */
export function cohortePorNombre(nombre: string): Cohorte | undefined {
  return COHORTES.find((c) => c.nombre === nombre);
}
