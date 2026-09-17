import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  getUniverseLocations,
  vigentesAl,
  sectorGroup,
  SECTOR_LABELS,
  type Sector,
} from "@/lib/universe";
import { DIAS_HABILES_3M, contarDiasHabiles, diasHabilesEntre, siguienteDiaHabil } from "@/lib/business-days";
import { COMBINACIONES, combinacionDeGrupo, nombreCombinacion } from "@/lib/combinaciones";
import { COHORTES, cohortePorNombre } from "@/lib/cohortes";
import { bucketLabelFor, todayISO } from "@/lib/date-buckets";
import { PRODUCT_IDS } from "@/data/catalog";
import { getVolumenRadarAcumulado, getRendimiento3M } from "@/lib/dienn-queries";

// Queries de la comparativa Panquecitas vs. Margarina/Mayonesa (Mavesa), en
// archivo APARTE de dienn-queries.ts a propósito: ese archivo ya tiene ~30
// usos hardcodeados de PRODUCT_IDS.PANQUECITAS/HARINA_PAN y ninguna query
// genérica por producto — aislar esto reduce a cero el riesgo de romper algo
// del dashboard actual. Ver plan "Comparativa Panquecitas vs.
// Margarina/Mayonesa (Mavesa) por ciudad".
//
// Cada función de acá lee de UNA sola tabla con un solo rol:
//   - getRendimientoVsMavesa   → solo las tablas *_referencia_records
//   - getComparativaPortafolioPorCiudad → solo las tablas *_actual_records
// Nunca se cruzan: cargar el archivo equivocado en el endpoint equivocado
// puede dar un número raro, pero jamás mezcla referencia con actual porque
// cada query solo sabe leer de su tabla.

export type MavesaCategoria = "margarina" | "mayonesa";

const REFERENCIA_TABLA: Record<MavesaCategoria, string> = {
  margarina: "radar_margarina_referencia_records",
  mayonesa: "radar_mayonesa_referencia_records",
};

const ACTUAL_TABLA: Record<MavesaCategoria, string> = {
  margarina: "radar_margarina_actual_records",
  mayonesa: "radar_mayonesa_actual_records",
};

const CATEGORIA_PRODUCT_ID: Record<MavesaCategoria, string> = {
  margarina: PRODUCT_IDS.MARGARINA,
  mayonesa: PRODUCT_IDS.MAYONESA,
};

/** "2026-07" → "2026-07-31". Mismo criterio que dienn-queries.ts (ultimoDiaDelMes). */
function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const dia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

// Mismo corte que RENDIMIENTO_DIARIO_DESDE en dienn-queries.ts: el gráfico de
// rendimiento diario del piloto arranca el 03-08-2026, no antes.
const RENDIMIENTO_DIARIO_DESDE = "2026-08-03";

export interface RendimientoVsMavesaPunto {
  dia: string;
  label: string;
  panquecitasKg: number;
  ratioPct: number;
}

export interface RendimientoVsMavesaResult {
  categoria: MavesaCategoria;
  /** kg/día del período REAL cubierto por el archivo de referencia (no fijo a 3 meses). */
  promedioReferencia: number;
  /** 4% de promedioReferencia — misma meta que el gráfico de PAN. */
  meta4Pct: number;
  diasPeriodo: number;
  desde: string;
  hasta: string;
  totalReferenciaKg: number;
  /** Cuántos PDV de la cartera ya compraron esta categoría al menos una vez en el período. */
  clientesConCompra: number;
  /** PDV de la cartera del corte (Cumaná/Cabudare/total), hayan comprado o no. */
  clientesEnCartera: number;
  puntos: RendimientoVsMavesaPunto[];
}

const VACIO = (categoria: MavesaCategoria): RendimientoVsMavesaResult => ({
  categoria,
  promedioReferencia: 0,
  meta4Pct: 0,
  diasPeriodo: 0,
  desde: "",
  hasta: "",
  totalReferenciaKg: 0,
  clientesConCompra: 0,
  clientesEnCartera: 0,
  puntos: [],
});

/**
 * Ratio diario de Panquecitas contra el promedio histórico de Margarina o
 * Mayonesa — misma mecánica que getRendimiento3M en dienn-queries.ts, pero:
 *   - el promedio sale del período REAL de la tabla de referencia (los meses
 *     que de hecho tenga cargados), no fijo a 3 meses;
 *   - "universo" = toda la cartera del piloto (decisión del usuario,
 *     26-08-2026: "universo toma todos los clientes de la cartera") — la
 *     tabla de referencia ya es cartera-only desde la carga, así que no hace
 *     falta filtrar de nuevo acá; el total es el mismo que si se llamara
 *     "clientes" (quien no compró no aporta filas, así que restringir a
 *     "ya compró al menos una vez" no cambia la suma — sí se informa el
 *     conteo por separado en `clientesConCompra`).
 */
export async function getRendimientoVsMavesa(
  categoria: MavesaCategoria,
  sector?: Sector
): Promise<RendimientoVsMavesaResult> {
  const universoTotal = await getUniverseLocations();
  const delSectorCartera = sector
    ? universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector)
    : universoTotal;
  const universo = vigentesAl(delSectorCartera, todayISO());
  const idsUniverso = new Set(universo.map((l) => l.id));

  const supabase = createSupabaseServiceClient();
  const productId = CATEGORIA_PRODUCT_ID[categoria];

  const referenciaData = await fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(() =>
    supabase
      .from(REFERENCIA_TABLA[categoria])
      .select("location_id, quantity_kg, date_of_sale")
      .eq("product_id", productId)
  );

  const referenciaFiltrada = referenciaData.filter((r) => idsUniverso.has(r.location_id));
  if (referenciaFiltrada.length === 0) return VACIO(categoria);

  const clientesConCompra = new Set(referenciaFiltrada.map((r) => r.location_id)).size;
  const totalReferenciaKg = referenciaFiltrada.reduce((s, r) => s + Number(r.quantity_kg), 0);

  // MISMO divisor que Harina PAN: venta acumulada de los 3 meses ÷ 63 días
  // hábiles (decisión del usuario, 26-08-2026). Antes cada categoría se
  // dividía entre los días hábiles del rango que traía SU archivo, así que
  // los promedios de Margarina, Mayonesa y PAN no eran comparables.
  // inicioPeriodo/finPeriodo se siguen usando para mostrar el rango al pie.
  const fechas = referenciaFiltrada.map((r) => r.date_of_sale.slice(0, 10)).sort();
  const inicioPeriodo = `${fechas[0].slice(0, 7)}-01`;
  const finPeriodo = ultimoDiaDelMes(fechas[fechas.length - 1].slice(0, 7));
  const diasPeriodo = DIAS_HABILES_3M;

  const promedioReferencia = totalReferenciaKg / diasPeriodo;
  if (promedioReferencia <= 0) return VACIO(categoria);

  // Panquecitas por día — misma cartera (idsUniverso) que la referencia.
  const panqData = await fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("location_id, quantity_kg, date_of_sale")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
  );

  const kgPorDia = new Map<string, number>();
  // Último día reportado en TODO el piloto, SIN recortar por sector ni por
  // cartera: es el cierre del rango de la serie y tiene que ser el mismo para
  // las dos ciudades. Si cada sector terminara en su propio último día, la
  // ciudad que no vendió ese día se quedaría sin él y volvería a pasar
  // exactamente lo que el relleno de abajo viene a arreglar.
  let ultimoDiaReportado = "";
  for (const r of panqData) {
    const fecha = r.date_of_sale.slice(0, 10);
    // El corte del arranque se mira sobre la fecha REAL: una venta del
    // domingo 02-08 es previa al piloto y no se arrastra a su primer lunes.
    if (fecha < RENDIMIENTO_DIARIO_DESDE) continue;
    const dia = siguienteDiaHabil(fecha);
    if (dia > ultimoDiaReportado) ultimoDiaReportado = dia;
    if (!idsUniverso.has(r.location_id)) continue;
    kgPorDia.set(dia, (kgPorDia.get(dia) ?? 0) + Number(r.quantity_kg));
  }

  // La serie cubre TODOS los días hábiles desde el arranque del piloto, no
  // solo los que tuvieron venta: un día hábil sin venta vale 0 y cuenta en el
  // divisor del ratio acumulado (DIENN, 11-09-2026). Las ventas de fin de
  // semana ya vienen sumadas al lunes siguiente. Ver siguienteDiaHabil().
  const puntos: RendimientoVsMavesaPunto[] = diasHabilesEntre(
    RENDIMIENTO_DIARIO_DESDE,
    ultimoDiaReportado
  ).map((dia) => {
    const kg = kgPorDia.get(dia) ?? 0;
    return {
      dia,
      label: bucketLabelFor(dia, "day"),
      panquecitasKg: Math.round(kg * 10) / 10,
      ratioPct: Math.round((kg / promedioReferencia) * 100 * 10) / 10,
    };
  });

  return {
    categoria,
    promedioReferencia: Math.round(promedioReferencia * 10) / 10,
    meta4Pct: Math.round(promedioReferencia * 0.04 * 10) / 10,
    diasPeriodo,
    desde: inicioPeriodo,
    hasta: finPeriodo,
    totalReferenciaKg: Math.round(totalReferenciaKg * 10) / 10,
    clientesConCompra,
    clientesEnCartera: idsUniverso.size,
    puntos,
  };
}

export interface PortafolioProducto {
  nombre: string;
  volumenKg: number;
}

export interface PortafolioPorCiudadRow {
  sector: Sector;
  label: string;
  productos: PortafolioProducto[];
}

const PILOT_SECTOR_KEYS: Sector[] = ["cumana", "barquisimeto_este"];

/**
 * Totales acumulados HASTA LA FECHA por ciudad — Panquecitas, Margarina y
 * Mayonesa (las 3 que pidió el usuario) + Harina PAN (para el toggle
 * "Comparar con Harina PAN" del gráfico de barras).
 *
 * Fuente de cada uno:
 *   - Panquecitas / Harina PAN → getVolumenRadarAcumulado(sector), la MISMA
 *     query que ya alimenta la tarjeta de volumen del dashboard de DIENN —
 *     no se reimplementa la suma a mano porque esa función ya aplica dos
 *     recortes que si no coincide con la tarjeta oficial: solo cuenta
 *     Harina PAN desde el 03-08-2026 (esHpmVigente) y descarta ventas
 *     anteriores a la fecha de incorporación de cada cliente.
 *   - Margarina / Mayonesa → radar_{categoria}_actual_records (agosto en
 *     adelante) — NUNCA las tablas _referencia, que son exclusivas del
 *     gráfico de ratio (getRendimientoVsMavesa).
 */
export async function getComparativaPortafolioPorCiudad(): Promise<PortafolioPorCiudadRow[]> {
  const supabase = createSupabaseServiceClient();
  const universo = await getUniverseLocations();

  const idsPorSector = new Map<Sector, Set<string>>();
  for (const sector of PILOT_SECTOR_KEYS) idsPorSector.set(sector, new Set());
  for (const l of universo) {
    const sector = sectorGroup(l.oficina_venta);
    if (sector) idsPorSector.get(sector)!.add(l.id);
  }

  const [volumenCumana, volumenBarquisimeto, margarinaRows, mayonesaRows] = await Promise.all([
    getVolumenRadarAcumulado("cumana"),
    getVolumenRadarAcumulado("barquisimeto_este"),
    fetchAllRows<{ location_id: string; quantity_kg: number }>(() =>
      supabase
        .from(ACTUAL_TABLA.margarina)
        .select("location_id, quantity_kg")
        .eq("product_id", PRODUCT_IDS.MARGARINA)
    ),
    fetchAllRows<{ location_id: string; quantity_kg: number }>(() =>
      supabase
        .from(ACTUAL_TABLA.mayonesa)
        .select("location_id, quantity_kg")
        .eq("product_id", PRODUCT_IDS.MAYONESA)
    ),
  ]);
  const volumenPorSector = { cumana: volumenCumana, barquisimeto_este: volumenBarquisimeto };

  const margarinaPorLocation = new Map<string, number>();
  for (const r of margarinaRows) margarinaPorLocation.set(r.location_id, (margarinaPorLocation.get(r.location_id) ?? 0) + Number(r.quantity_kg));
  const mayonesaPorLocation = new Map<string, number>();
  for (const r of mayonesaRows) mayonesaPorLocation.set(r.location_id, (mayonesaPorLocation.get(r.location_id) ?? 0) + Number(r.quantity_kg));

  function sumar(ids: Set<string>, porLocation: Map<string, number>): number {
    let total = 0;
    for (const id of ids) total += porLocation.get(id) ?? 0;
    return Math.round(total * 10) / 10;
  }

  return PILOT_SECTOR_KEYS.map((sector) => {
    const ids = idsPorSector.get(sector)!;
    const volumen = volumenPorSector[sector];
    return {
      sector,
      label: SECTOR_LABELS[sector],
      productos: [
        { nombre: "Panquecitas", volumenKg: Math.round(volumen.panquecitasTon * 1000 * 10) / 10 },
        { nombre: "Margarina", volumenKg: sumar(ids, margarinaPorLocation) },
        { nombre: "Mayonesa", volumenKg: sumar(ids, mayonesaPorLocation) },
        { nombre: "Harina PAN", volumenKg: Math.round(volumen.harinaPanTon * 1000 * 10) / 10 },
      ],
    };
  });
}

export interface Ventas3MesesRow {
  sector: Sector;
  label: string;
  productos: PortafolioProducto[];
}

/**
 * Barras de Margarina, Mayonesa y Harina PAN de los ÚLTIMOS 3 MESES (mayo-
 * julio, las tablas de REFERENCIA), por ciudad.
 *
 * Población = toda la cartera del piloto (decisión del usuario, 26-08-2026:
 * "universo toma todos los clientes de la cartera, clientes toma los
 * clientes que ya han comprado por lo menos 1 vez"). Ya NO se cruza contra
 * si el PDV compra Panquecitas — ese cruce hacía que el total de Margarina/
 * Mayonesa/Harina PAN cambiara según un filtro que no tiene nada que ver con
 * esas categorías, y era la causa real de números que no cuadraban. Como
 * "ya compró al menos 1 vez" no excluye ninguna fila que ya esté sumando
 * (quien no compró aporta 0 de todas formas), el total es uno solo por
 * ciudad — no hace falta el toggle Cliente/Universo acá.
 *
 * Harina PAN reusa getRendimiento3M("universo", sector) (misma tabla
 * radar_3m_records) en vez de reimplementar la suma.
 *
 * Las barras son el ACUMULADO de los 3 meses en kg, para comparar una
 * categoría contra otra (decisión del usuario, 26-08-2026). NO se divide
 * entre días hábiles acá: ese divisor es de los PROMEDIOS que alimentan
 * los gráficos de ratio (getRendimiento3M y getRendimientoVsMavesa), no de
 * este gráfico.
 */
export async function getVentas3MesesPorCiudad(): Promise<Ventas3MesesRow[]> {
  const supabase = createSupabaseServiceClient();
  const universoTotal = await getUniverseLocations();

  const [margarinaRows, mayonesaRows, harinaPanCumana, harinaPanBarquisimeto] = await Promise.all([
    fetchAllRows<{ location_id: string; quantity_kg: number }>(() =>
      supabase
        .from(REFERENCIA_TABLA.margarina)
        .select("location_id, quantity_kg")
        .eq("product_id", PRODUCT_IDS.MARGARINA)
    ),
    fetchAllRows<{ location_id: string; quantity_kg: number }>(() =>
      supabase
        .from(REFERENCIA_TABLA.mayonesa)
        .select("location_id, quantity_kg")
        .eq("product_id", PRODUCT_IDS.MAYONESA)
    ),
    getRendimiento3M("universo", "cumana"),
    getRendimiento3M("universo", "barquisimeto_este"),
  ]);
  const harinaPanPorSector: Record<Sector, number> = {
    cumana: harinaPanCumana.totalPanKg,
    barquisimeto_este: harinaPanBarquisimeto.totalPanKg,
  };

  const margarinaPorLocation = new Map<string, number>();
  for (const r of margarinaRows) margarinaPorLocation.set(r.location_id, (margarinaPorLocation.get(r.location_id) ?? 0) + Number(r.quantity_kg));
  const mayonesaPorLocation = new Map<string, number>();
  for (const r of mayonesaRows) mayonesaPorLocation.set(r.location_id, (mayonesaPorLocation.get(r.location_id) ?? 0) + Number(r.quantity_kg));

  function sumar(ids: Set<string>, porLocation: Map<string, number>): number {
    let total = 0;
    for (const id of ids) total += porLocation.get(id) ?? 0;
    return Math.round(total * 10) / 10;
  }

  return PILOT_SECTOR_KEYS.map((sector) => {
    const delSector = universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector);
    const idsUniverso = new Set(vigentesAl(delSector, todayISO()).map((l) => l.id));

    return {
      sector,
      label: SECTOR_LABELS[sector],
      productos: [
        { nombre: "Margarina", volumenKg: sumar(idsUniverso, margarinaPorLocation) },
        { nombre: "Mayonesa", volumenKg: sumar(idsUniverso, mayonesaPorLocation) },
        { nombre: "Harina PAN", volumenKg: harinaPanPorSector[sector] },
      ],
    };
  });
}

// ── Ratios y volumen por COMBINACIÓN del piloto ────────────────────
// (pedido de DIENN, 08-09-2026)
//
// El piloto no corrió una sola dinámica: cada grupo vendedor trabajó con un
// precio y un eje de comunicación distintos (ver src/lib/combinaciones.ts).
// Comparar Cumaná contra Cabudare mezcla las dos variables a la vez; la
// unidad de análisis real es la combinación.
//
// EL RATIO, por categoría y por combinación (DIENN, 08/09-09-2026):
//
//   numerador   = Σ kg Panquecitas de esos grupos ÷ días hábiles TRANSCURRIDOS
//   denominador = Σ kg de esa categoría de esos MISMOS grupos ÷ 63 días hábiles
//
// Los dos lados se acotan a los PDV de los grupos vendedores de la
// combinación: nada usa el total de la ciudad ni del piloto.
//
// El denominador de Margarina y Mayonesa es el del resto del dashboard; el de
// Harina PAN suma TODAS las filas del Radar 3M en vez del último corte del mes
// (DIENN, 17-09-2026 — ver el fetch). El numerador tampoco es el mismo: acá
// divide entre los días hábiles transcurridos y no entre los días CON VENTA
// que usa el ratio universal. Es deliberado y la razón está en el uso —ver el
// comentario junto al cálculo—: esta tabla compara cuatro combinaciones entre
// sí, y con un divisor distinto por fila el orden deja de significar quién
// vende más.
//
// "Ventas kg" es el acumulado de Panquecitas de la combinación — el volumen
// crudo, sin dividir. OJO: suma solo PDV de la CARTERA, así que no cuadra con
// la tarjeta de Volumen Radar, que además incluye los PDV fuera de cartera.

export interface CombinacionRow {
  numero: number;
  nombre: string;
  sector: Sector;
  ciudad: string;
  /** Precio de cada presentación: son dos, no una. */
  precio800: number;
  precio400: number;
  comunicacion: string;
  gruposVendedores: string[];
  /** PDV de la cartera en esa combinación (universo, compren o no). */
  clientes: number;
  /** Acumulado de Panquecitas del piloto (kg) — la columna "Ventas kg". */
  panquecitasKg: number;
  /** Ratios de ritmo diario: Panquecitas ÷ categoría × 100. `null` si la
   *  categoría no tiene volumen en esa combinación. */
  ratioHarinaPan: number | null;
  ratioMargarina: number | null;
  ratioMayonesa: number | null;
  /** Promedios diarios que alimentan cada ratio, para poder auditarlos. */
  panquecitasKgDia: number;
  harinaPanKgDia: number;
  margarinaKgDia: number;
  mayonesaKgDia: number;
  /**
   * Días en que esa combinación despachó Panquecitas. NO es el divisor —el
   * divisor son los días hábiles transcurridos, igual para las cuatro— sino
   * el dato de intermitencia: explica por qué dos filas con volumen parecido
   * pueden rendir distinto.
   */
  diasConVenta: number;
  /** PDV de la combinación que ya compraron Panquecitas al menos una vez. */
  activos: number;
  /**
   * PDV con compra de Panquecitas en 2 o más FECHAS distintas — la recompra
   * se mide sobre los activos, no sobre la cartera: un PDV que nunca compró
   * no pudo recomprar y meterlo en el denominador mide activación, no
   * recompra (DIENN, 17-09-2026).
   */
  conRecompra: number;
}

export interface CombinacionesResult {
  filas: CombinacionRow[];
  /** PDV cuyo grupo vendedor no cae en ninguna combinación. */
  sinCombinacion: number;
  /** Grupos vendedores encontrados en la cartera que no están mapeados. */
  gruposSinMapear: string[];
  diasReferencia: number;
  diasPanquecitas: number;
  desdePanquecitas: string;
  /**
   * Panquecitas (kg) de TODOS los PDV del alcance, incluidos los que no caen
   * en ninguna combinación. Es el "ventas totales" contra el que se mide la
   * participación de cada precio y cada comunicación.
   */
  totalPanquecitasKg: number;
  /** Tanda a la que se recortó la cartera, o null si es la cartera completa. */
  cohorte: string | null;
}

/**
 * Todo lo que se lee de la base para armar las combinaciones. Se carga UNA
 * vez y se reutiliza para cada tanda: la tabla por tanda pide seis cortes de
 * los mismos datos, y volver a leer las cuatro tablas por cada uno multiplica
 * por seis el tiempo de la página sin cambiar un solo número.
 */
interface DatosCombinaciones {
  hoy: string;
  diasPanquecitas: number;
  universoTotal: Awaited<ReturnType<typeof getUniverseLocations>>;
  margarina: { location_id: string; quantity_kg: number }[];
  mayonesa: { location_id: string; quantity_kg: number }[];
  harinaPan: { sap_code: string; quantity_kg: number }[];
  panquecitas: { location_id: string; quantity_kg: number; date_of_sale: string }[];
}

/**
 * @param opciones.soloCohorte Recorta la cartera a UNA tanda (ej. "Piloto
 *   original", los 358 del arranque). Sin él, la cartera vigente completa —
 *   el comportamiento de siempre de la tabla de combinaciones.
 */
export async function getCombinacionesPiloto(
  opciones: { soloCohorte?: string } = {}
): Promise<CombinacionesResult> {
  return calcularCombinaciones(await cargarDatosCombinaciones(), opciones.soloCohorte);
}

/**
 * Ventana de venta de una tanda: desde que SUS PDV son cartera, nunca antes
 * del arranque del piloto.
 *
 * Una tanda que entró el 08-09 no vendió nada entre el 03-08 y esa fecha
 * porque todavía no existía como cartera. Dividir sus kilos entre los días
 * hábiles de todo el piloto le baja el ratio a una fracción del real y la
 * tabla la muestra como si no hubiera pasado nada (DIENN, 17-09-2026). Cada
 * tanda se mide con sus propios días.
 */
function desdeDeCohorte(soloCohorte?: string): string {
  const desde = soloCohorte ? cohortePorNombre(soloCohorte)?.desde : undefined;
  return desde && desde > RENDIMIENTO_DIARIO_DESDE ? desde : RENDIMIENTO_DIARIO_DESDE;
}

async function cargarDatosCombinaciones(): Promise<DatosCombinaciones> {
  const hoy = todayISO();
  const supabase = createSupabaseServiceClient();
  const [universoTotal, margarina, mayonesa, harinaPan, panquecitas] = await Promise.all([
    getUniverseLocations(),
    fetchAllRows<{ location_id: string; quantity_kg: number }>(() =>
      supabase
        .from(REFERENCIA_TABLA.margarina)
        .select("location_id, quantity_kg")
        .eq("product_id", PRODUCT_IDS.MARGARINA)
    ),
    fetchAllRows<{ location_id: string; quantity_kg: number }>(() =>
      supabase
        .from(REFERENCIA_TABLA.mayonesa)
        .select("location_id, quantity_kg")
        .eq("product_id", PRODUCT_IDS.MAYONESA)
    ),
    // Harina PAN = SUMA de todas las filas del Radar 3M (radar_3m_ventas_dia),
    // no el último corte del mes de radar_3m_records (DIENN, 17-09-2026). En el
    // archivo cada fila es el despacho de ese día —el valor baja de una fecha a
    // otra dentro del mismo mes—, así que el último corte se quedaba con ~40%
    // de los kilos e inflaba el ratio. Solo esta tabla: los gráficos de ratio
    // 3M siguen con su propia lectura.
    fetchAllRows<{ sap_code: string; quantity_kg: number }>(() =>
      supabase.from("radar_3m_ventas_dia").select("sap_code, quantity_kg").eq("product_id", PRODUCT_IDS.HARINA_PAN)
    ),
    fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(() =>
      supabase
        .from("sap_sell_in_records")
        .select("location_id, quantity_kg, date_of_sale")
        .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    ),
  ]);

  return {
    hoy,
    diasPanquecitas: contarDiasHabiles(RENDIMIENTO_DIARIO_DESDE, hoy),
    universoTotal,
    margarina,
    mayonesa,
    harinaPan,
    panquecitas,
  };
}

function calcularCombinaciones(datos: DatosCombinaciones, soloCohorte?: string): CombinacionesResult {
  const { hoy, universoTotal, margarina, mayonesa, harinaPan, panquecitas } = datos;
  // Ventana propia de la tanda: sus kilos y su divisor arrancan el día que
  // entró a la cartera, no el día que arrancó el piloto.
  const desdePanquecitas = desdeDeCohorte(soloCohorte);
  const diasPanquecitas =
    desdePanquecitas === RENDIMIENTO_DIARIO_DESDE
      ? datos.diasPanquecitas
      : contarDiasHabiles(desdePanquecitas, hoy);
  const vacio: CombinacionesResult = {
    filas: [],
    sinCombinacion: 0,
    gruposSinMapear: [],
    diasReferencia: DIAS_HABILES_3M,
    diasPanquecitas,
    desdePanquecitas,
    totalPanquecitasKg: 0,
    cohorte: soloCohorte ?? null,
  };

  // El recorte por tanda se aplica ANTES de todo lo demás, así que alcanza a
  // los dos lados del ratio (Panquecitas y la categoría de referencia) y al
  // conteo de PDV. Un cliente sin cohorte registrada no cae en ninguna tanda.
  const universo = vigentesAl(universoTotal, hoy).filter(
    (l) => !soloCohorte || (l.cohorte ?? "").trim() === soloCohorte
  );
  if (universo.length === 0) return vacio;

  // locId → combinación. Los que no caen en ninguna se cuentan aparte en vez
  // de repartirse en la más cercana: un grupo nuevo tiene que verse.
  const combiPorLoc = new Map<string, number>();
  const gruposSinMapear = new Set<string>();
  let sinCombinacion = 0;
  const clientesPorCombi = new Map<number, number>();
  // PDV del alcance, estén o no en una combinación: base de totalPanquecitasKg.
  const enAlcance = new Set<string>();
  for (const l of universo) {
    if (!sectorGroup(l.oficina_venta)) continue;
    enAlcance.add(l.id);
    const numero = combinacionDeGrupo(l.grupo_vendedor);
    if (numero === null) {
      sinCombinacion += 1;
      const g = (l.grupo_vendedor ?? "").trim().toUpperCase();
      if (g) gruposSinMapear.add(g);
      continue;
    }
    combiPorLoc.set(l.id, numero);
    clientesPorCombi.set(numero, (clientesPorCombi.get(numero) ?? 0) + 1);
  }

  const locIdBySapCode = new Map(universo.map((l) => [l.sap_code.trim(), l.id]));
  const kg = new Map<number, { marg: number; mayo: number; pan: number; panq: number }>();
  const acc = (numero: number) => {
    let a = kg.get(numero);
    if (!a) {
      a = { marg: 0, mayo: 0, pan: 0, panq: 0 };
      kg.set(numero, a);
    }
    return a;
  };
  for (const r of margarina) {
    const n = combiPorLoc.get(r.location_id);
    if (n != null) acc(n).marg += Number(r.quantity_kg);
  }
  for (const r of mayonesa) {
    const n = combiPorLoc.get(r.location_id);
    if (n != null) acc(n).mayo += Number(r.quantity_kg);
  }
  for (const r of harinaPan) {
    const locId = locIdBySapCode.get(r.sap_code.trim());
    const n = locId ? combiPorLoc.get(locId) : undefined;
    if (n != null) acc(n).pan += Number(r.quantity_kg);
  }
  // Panquecitas POR DÍA y por combinación: el ratio universal es el promedio
  // de los ratios diarios, así que hace falta el detalle día a día y no solo
  // el acumulado.
  const panqPorDia = new Map<number, Map<string, number>>();
  // Fechas DISTINTAS con compra por PDV: 1 = activo, ≥2 = recompró. Una
  // devolución (kg ≤ 0) no es una compra, mismo criterio que el resto del
  // dashboard.
  const fechasCompraPorLoc = new Map<string, Set<string>>();
  let totalPanquecitasKg = 0;
  for (const r of panquecitas) {
    const fecha = r.date_of_sale.slice(0, 10);
    // La ventana es la de la tanda: kilos, días con venta, activos y recompra
    // se cuentan desde que esos PDV son cartera.
    if (fecha < desdePanquecitas) continue;
    if (enAlcance.has(r.location_id)) totalPanquecitasKg += Number(r.quantity_kg);
    if (Number(r.quantity_kg) > 0 && combiPorLoc.has(r.location_id)) {
      const fechas = fechasCompraPorLoc.get(r.location_id) ?? new Set<string>();
      fechas.add(fecha);
      fechasCompraPorLoc.set(r.location_id, fechas);
    }
    // Fin de semana → lunes siguiente, igual que las series diarias: así
    // `diasConVenta` se cuenta en días hábiles (ver siguienteDiaHabil).
    const dia = siguienteDiaHabil(fecha);
    const n = combiPorLoc.get(r.location_id);
    if (n == null) continue;
    acc(n).panq += Number(r.quantity_kg);
    let porDia = panqPorDia.get(n);
    if (!porDia) {
      porDia = new Map<string, number>();
      panqPorDia.set(n, porDia);
    }
    porDia.set(dia, (porDia.get(dia) ?? 0) + Number(r.quantity_kg));
  }

  const r1 = (v: number) => Math.round(v * 10) / 10;

  // Activos y recompra POR COMBINACIÓN, contando PDV y no filas.
  const activosPorCombi = new Map<number, number>();
  const recompraPorCombi = new Map<number, number>();
  for (const [locId, fechas] of fechasCompraPorLoc) {
    const n = combiPorLoc.get(locId);
    if (n == null) continue;
    activosPorCombi.set(n, (activosPorCombi.get(n) ?? 0) + 1);
    if (fechas.size >= 2) recompraPorCombi.set(n, (recompraPorCombi.get(n) ?? 0) + 1);
  }

  const filas = COMBINACIONES.map((c) => {
    const a = kg.get(c.numero) ?? { marg: 0, mayo: 0, pan: 0, panq: 0 };
    // Promedio de referencia de cada categoría: Σ kg ÷ 63 días hábiles. Fijo,
    // igual que en getRendimiento3M.
    const panDia = a.pan / DIAS_HABILES_3M;
    const margDia = a.marg / DIAS_HABILES_3M;
    const mayoDia = a.mayo / DIAS_HABILES_3M;

    // Numerador: Panquecitas de la combinación entre los días hábiles
    // TRANSCURRIDOS desde el arranque del piloto — el MISMO divisor para las
    // cuatro filas (DIENN, 09-09-2026).
    //
    // Esta tabla existe para COMPARAR las cuatro combinaciones entre sí, y
    // con divisores distintos deja de ser una comparación — una combinación
    // que vendió concentrada en pocos días quedaba por encima de otra que
    // vendió más kilos repartidos. Con el mismo divisor, el orden dice quién
    // vende más. Desde el 11-09-2026 el ratio universal de los gráficos
    // también cuenta todos los días hábiles (con 0 los que no hubo venta),
    // así que los dos criterios ya coinciden.
    //
    // `diasConVenta` se sigue reportando, pero como dato de intermitencia y no
    // como divisor: es lo que explica por qué una fila puede rendir distinto
    // con volúmenes parecidos.
    const diasConVenta = panqPorDia.get(c.numero)?.size ?? 0;
    const panqDia = a.panq / diasPanquecitas;
    const ratio = (catDia: number) => (catDia > 0 ? Math.round((panqDia / catDia) * 1000) / 10 : null);

    return {
      numero: c.numero,
      nombre: nombreCombinacion(c.numero),
      sector: c.sector,
      ciudad: SECTOR_LABELS[c.sector],
      precio800: c.precio800,
      precio400: c.precio400,
      comunicacion: c.comunicacion,
      gruposVendedores: [...c.gruposVendedores],
      clientes: clientesPorCombi.get(c.numero) ?? 0,
      panquecitasKg: r1(a.panq),
      ratioHarinaPan: ratio(panDia),
      ratioMargarina: ratio(margDia),
      ratioMayonesa: ratio(mayoDia),
      panquecitasKgDia: r1(panqDia),
      harinaPanKgDia: r1(panDia),
      margarinaKgDia: r1(margDia),
      mayonesaKgDia: r1(mayoDia),
      diasConVenta,
      activos: activosPorCombi.get(c.numero) ?? 0,
      conRecompra: recompraPorCombi.get(c.numero) ?? 0,
    };
  });

  return {
    filas,
    sinCombinacion,
    gruposSinMapear: [...gruposSinMapear].sort(),
    diasReferencia: DIAS_HABILES_3M,
    diasPanquecitas,
    desdePanquecitas,
    totalPanquecitasKg: r1(totalPanquecitasKg),
    cohorte: soloCohorte ?? null,
  };
}

// ── La misma tabla, una por TANDA de incorporación ─────────────────
// (pedido de DIENN, 17-09-2026)
//
// La cartera no entró toda el mismo día: arrancó con 358 el 03-08 y se amplió
// en cuatro hitos más (ver src/lib/cohortes.ts). Mezclarlas en una sola tabla
// compara PDV con seis semanas de venta contra PDV con una: el filtro de tanda
// deja ver cada una con su propia activación, recompra, ratio y kilos.
//
// Todas las tandas salen de UNA sola lectura de la base — de ahí el refactor
// de arriba en cargar/calcular.

export interface CombinacionesTanda {
  /** Nombre de la tanda, o `null` para la cartera completa. */
  cohorte: string | null;
  /** Etiqueta del filtro ("Cartera completa", "Piloto original"...). */
  etiqueta: string;
  /** Desde cuándo cuentan sus PDV ("YYYY-MM-DD"); null en la cartera completa. */
  desde: string | null;
  resultado: CombinacionesResult;
}

export async function getCombinacionesPorTanda(): Promise<CombinacionesTanda[]> {
  const datos = await cargarDatosCombinaciones();
  return [
    {
      cohorte: null,
      etiqueta: "Cartera completa",
      desde: null,
      resultado: calcularCombinaciones(datos),
    },
    ...COHORTES.map((c) => ({
      cohorte: c.nombre,
      etiqueta: c.nombre,
      desde: c.desde,
      resultado: calcularCombinaciones(datos, c.nombre),
    })),
  ];
}

// ── Venta diaria por SEGMENTO de cliente y categoría ───────────────
// (pedido de DIENN, 03-09-2026)
//
// Responde: ¿cuánto vende al día cada segmento de cada categoría, y cómo se
// para Panquecitas contra eso?
//
// POBLACIÓN: universo = toda la cartera del piloto, haya comprado o no. Es lo
// que permite dividir por PDV y comparar segmentos de tamaños muy distintos
// (Bodegas tiene 282 PDV y Cad Farmacia 6): sin eso, el gráfico solo mide el
// tamaño del segmento.
//
// DOS PERÍODOS, a propósito. Margarina, Mayonesa y Harina PAN salen de los
// reportes de REFERENCIA (mayo–julio), que es la única ventana donde las tres
// son comparables entre sí. Panquecitas no existía entonces: su promedio
// diario se calcula sobre los días hábiles transcurridos desde el arranque del
// piloto. Por eso se comparan RITMOS (kg/día) y no totales — un total de 3
// meses contra uno de 1 mes no diría nada. El pie del gráfico lo declara.
//
// Se devuelven los TOTALES crudos por segmento × ciudad. Las divisiones
// —entre días, entre PDV— y el recorte a los segmentos grandes los hace el
// cliente, así que sus botones no vuelven a pedir datos.

export interface VentaPorSegmentoRow {
  segmento: string;
  sector: Sector;
  /** PDV de la cartera en ese segmento y ciudad (universo, compren o no). */
  clientes: number;
  margarinaKg: number;
  mayonesaKg: number;
  harinaPanKg: number;
  panquecitasKg: number;
}

export interface VentaPorSegmentoResult {
  filas: VentaPorSegmentoRow[];
  /** Divisor de Margarina / Mayonesa / Harina PAN: los 63 días hábiles de mayo–julio. */
  diasReferencia: number;
  /** Divisor de Panquecitas: días hábiles desde el arranque del piloto hasta hoy. */
  diasPanquecitas: number;
  desdePanquecitas: string;
}

export async function getVentaDiariaPorSegmento(): Promise<VentaPorSegmentoResult> {
  const hoy = todayISO();
  const vacio: VentaPorSegmentoResult = {
    filas: [],
    diasReferencia: DIAS_HABILES_3M,
    diasPanquecitas: contarDiasHabiles(RENDIMIENTO_DIARIO_DESDE, hoy),
    desdePanquecitas: RENDIMIENTO_DIARIO_DESDE,
  };

  const universoTotal = await getUniverseLocations();
  const universo = vigentesAl(universoTotal, hoy);
  if (universo.length === 0) return vacio;

  // locId → segmento + ciudad. Solo los de sector piloto: el resto no tiene
  // dónde ir en el gráfico.
  const meta = new Map<string, { segmento: string; sector: Sector }>();
  for (const l of universo) {
    const sector = sectorGroup(l.oficina_venta);
    if (!sector) continue;
    meta.set(l.id, { segmento: l.segmento_cliente?.trim() || "Sin segmento", sector });
  }

  const supabase = createSupabaseServiceClient();
  const [margarina, mayonesa, harinaPan, panquecitas] = await Promise.all([
    fetchAllRows<{ location_id: string; quantity_kg: number }>(() =>
      supabase
        .from(REFERENCIA_TABLA.margarina)
        .select("location_id, quantity_kg")
        .eq("product_id", PRODUCT_IDS.MARGARINA)
    ),
    fetchAllRows<{ location_id: string; quantity_kg: number }>(() =>
      supabase
        .from(REFERENCIA_TABLA.mayonesa)
        .select("location_id, quantity_kg")
        .eq("product_id", PRODUCT_IDS.MAYONESA)
    ),
    // Harina PAN sale de radar_3m_records, que guarda por sap_code y no por
    // location_id: se resuelve contra la cartera igual que en getRendimiento3M.
    fetchAllRows<{ sap_code: string; quantity_kg: number }>(() =>
      supabase.from("radar_3m_records").select("sap_code, quantity_kg").eq("product_id", PRODUCT_IDS.HARINA_PAN)
    ),
    fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(() =>
      supabase
        .from("sap_sell_in_records")
        .select("location_id, quantity_kg, date_of_sale")
        .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    ),
  ]);

  const locIdBySapCode = new Map(universo.map((l) => [l.sap_code.trim(), l.id]));

  // Acumulador por `${segmento}|${sector}`.
  const acc = new Map<string, VentaPorSegmentoRow>();
  const filaDe = (locId: string): VentaPorSegmentoRow | null => {
    const m = meta.get(locId);
    if (!m) return null;
    const key = `${m.segmento}|${m.sector}`;
    let fila = acc.get(key);
    if (!fila) {
      fila = {
        segmento: m.segmento,
        sector: m.sector,
        clientes: 0,
        margarinaKg: 0,
        mayonesaKg: 0,
        harinaPanKg: 0,
        panquecitasKg: 0,
      };
      acc.set(key, fila);
    }
    return fila;
  };

  // Primero la población: todo PDV de la cartera cuenta, compre o no.
  for (const locId of meta.keys()) {
    const fila = filaDe(locId);
    if (fila) fila.clientes += 1;
  }

  for (const r of margarina) {
    const fila = filaDe(r.location_id);
    if (fila) fila.margarinaKg += Number(r.quantity_kg);
  }
  for (const r of mayonesa) {
    const fila = filaDe(r.location_id);
    if (fila) fila.mayonesaKg += Number(r.quantity_kg);
  }
  for (const r of harinaPan) {
    const locId = locIdBySapCode.get(r.sap_code.trim());
    const fila = locId ? filaDe(locId) : null;
    if (fila) fila.harinaPanKg += Number(r.quantity_kg);
  }
  for (const r of panquecitas) {
    if (r.date_of_sale.slice(0, 10) < RENDIMIENTO_DIARIO_DESDE) continue;
    const fila = filaDe(r.location_id);
    if (fila) fila.panquecitasKg += Number(r.quantity_kg);
  }

  const redondear = (v: number) => Math.round(v * 10) / 10;
  return {
    filas: [...acc.values()].map((f) => ({
      ...f,
      margarinaKg: redondear(f.margarinaKg),
      mayonesaKg: redondear(f.mayonesaKg),
      harinaPanKg: redondear(f.harinaPanKg),
      panquecitasKg: redondear(f.panquecitasKg),
    })),
    diasReferencia: DIAS_HABILES_3M,
    diasPanquecitas: contarDiasHabiles(RENDIMIENTO_DIARIO_DESDE, hoy),
    desdePanquecitas: RENDIMIENTO_DIARIO_DESDE,
  };
}
