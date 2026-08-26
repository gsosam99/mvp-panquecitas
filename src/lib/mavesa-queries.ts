import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  getUniverseLocations,
  getVolumenLocations,
  getSellInTotalsByLocation,
  vigentesAl,
  sectorGroup,
  SECTOR_LABELS,
  type Sector,
} from "@/lib/universe";
import { contarDiasHabiles } from "@/lib/business-days";
import { bucketLabelFor, todayISO } from "@/lib/date-buckets";
import { PRODUCT_IDS } from "@/data/catalog";
import { getVolumenRadarAcumulado, getRendimiento3M, type Pan3MPoblacion } from "@/lib/dienn-queries";

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
  puntos: [],
});

/**
 * Ratio diario de Panquecitas contra el promedio histórico de Margarina o
 * Mayonesa — misma mecánica que getRendimiento3M en dienn-queries.ts, pero:
 *   - el promedio sale del período REAL de la tabla de referencia (los meses
 *     que de hecho tenga cargados), no fijo a 3 meses;
 *   - el promedio es el UNIVERSO completo del reporte (decisión del usuario,
 *     26-08-2026: "para el de los ratios toma el universo") — NO se acota a
 *     la cartera del piloto, mismo criterio que "PAN Universo" en
 *     getRendimiento3M. La tabla de referencia ya guarda location_id null
 *     para lo que no resuelve contra ninguna location (ver migration 023 /
 *     radar-categoria-upload.ts `soloCartera: false`); esas filas SÍ suman
 *     al total pero no entran en el corte por ciudad, porque no se les puede
 *     asignar sector;
 *   - Panquecitas del día SÍ se acota a la cartera del piloto (es la venta
 *     real del piloto, no tiene un "universo" más amplio que comparar).
 */
export async function getRendimientoVsMavesa(
  categoria: MavesaCategoria,
  sector?: Sector
): Promise<RendimientoVsMavesaResult> {
  // Cartera del piloto — sigue siendo la población de Panquecitas (numerador).
  const universoTotal = await getUniverseLocations();
  const delSectorCartera = sector
    ? universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector)
    : universoTotal;
  const universo = vigentesAl(delSectorCartera, todayISO());
  const idsUniverso = new Set(universo.map((l) => l.id));

  const supabase = createSupabaseServiceClient();
  const productId = CATEGORIA_PRODUCT_ID[categoria];

  const referenciaData = await fetchAllRows<{ location_id: string | null; quantity_kg: number; date_of_sale: string }>(
    () =>
      supabase
        .from(REFERENCIA_TABLA[categoria])
        .select("location_id, quantity_kg, date_of_sale")
        .eq("product_id", productId)
  );

  // El universo del reporte es TODAS las locations de los sectores piloto
  // (no solo cartera) — mismo set amplio que usó la carga (getVolumenLocations).
  // Si se pide un sector, se acota por ahí; las filas con location_id null
  // (sin match en absoluto) quedan fuera del corte por sector, pero cuentan
  // en el TOTAL (sector indefinido).
  let referenciaFiltrada = referenciaData;
  if (sector) {
    const volumen = await getVolumenLocations();
    const idsSector = new Set(volumen.filter((l) => sectorGroup(l.oficina_venta) === sector).map((l) => l.id));
    referenciaFiltrada = referenciaData.filter((r) => r.location_id !== null && idsSector.has(r.location_id));
  }
  if (referenciaFiltrada.length === 0) return VACIO(categoria);

  const totalReferenciaKg = referenciaFiltrada.reduce((s, r) => s + Number(r.quantity_kg), 0);

  // Mismo criterio que getRendimiento3M: el período son los MESES presentes,
  // de su primer día al último — no las fechas literales, que pueden recortar
  // el período por los dos extremos e inflar el promedio.
  const fechas = referenciaFiltrada.map((r) => r.date_of_sale.slice(0, 10)).sort();
  const inicioPeriodo = `${fechas[0].slice(0, 7)}-01`;
  const finPeriodo = ultimoDiaDelMes(fechas[fechas.length - 1].slice(0, 7));
  const diasPeriodo = contarDiasHabiles(inicioPeriodo, finPeriodo);

  const promedioReferencia = totalReferenciaKg / diasPeriodo;
  if (promedioReferencia <= 0) return VACIO(categoria);

  // Panquecitas por día — acotado a la cartera del piloto: es la venta real
  // que se quiere entender, y se compara contra el universo (más amplio) de
  // Margarina/Mayonesa de esa misma ciudad.
  const panqData = await fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(() =>
    supabase
      .from("sap_sell_in_records")
      .select("location_id, quantity_kg, date_of_sale")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
  );

  const kgPorDia = new Map<string, number>();
  for (const r of panqData) {
    if (!idsUniverso.has(r.location_id)) continue;
    const dia = r.date_of_sale.slice(0, 10);
    if (dia < RENDIMIENTO_DIARIO_DESDE) continue;
    kgPorDia.set(dia, (kgPorDia.get(dia) ?? 0) + Number(r.quantity_kg));
  }

  const puntos: RendimientoVsMavesaPunto[] = [...kgPorDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, kg]) => ({
      dia,
      label: bucketLabelFor(dia, "day"),
      panquecitasKg: Math.round(kg * 10) / 10,
      ratioPct: Math.round((kg / promedioReferencia) * 100 * 10) / 10,
    }));

  return {
    categoria,
    promedioReferencia: Math.round(promedioReferencia * 10) / 10,
    meta4Pct: Math.round(promedioReferencia * 0.04 * 10) / 10,
    diasPeriodo,
    desde: inicioPeriodo,
    hasta: finPeriodo,
    totalReferenciaKg: Math.round(totalReferenciaKg * 10) / 10,
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
  clientes: PortafolioProducto[];
  universo: PortafolioProducto[];
}

/**
 * Barras de Margarina, Mayonesa y Harina PAN de los ÚLTIMOS 3 MESES (mayo-
 * julio, las tablas de REFERENCIA), por ciudad, con el mismo criterio
 * Cliente/Universo que ya usa el gráfico de PAN
 * (getRendimiento3M/Pan3MPoblacion):
 *   - "clientes": solo los PDV de la cartera del piloto que ADEMÁS compran
 *     Panquecitas.
 *   - "universo": toda la cartera del piloto, compren Panquecitas o no.
 *
 * A diferencia de getRendimientoVsMavesa (que usa el UNIVERSO del reporte
 * completo, incluyendo PDV fuera de cartera, para el promedio de
 * referencia), acá las dos poblaciones son subconjuntos de la CARTERA —
 * mismo criterio exacto que "PAN Cliente"/"PAN Universo" hoy.
 *
 * Harina PAN reusa getRendimiento3M (misma tabla radar_3m_records, mismo
 * cálculo de población) en vez de reimplementarlo.
 */
export async function getVentas3MesesPorCiudad(): Promise<Ventas3MesesRow[]> {
  const supabase = createSupabaseServiceClient();
  const universoTotal = await getUniverseLocations();
  const panqTotals = await getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS);

  const [[margarinaRows, mayonesaRows], harinaPanResultados] = await Promise.all([
    Promise.all([
      fetchAllRows<{ location_id: string | null; quantity_kg: number }>(() =>
        supabase
          .from(REFERENCIA_TABLA.margarina)
          .select("location_id, quantity_kg")
          .eq("product_id", PRODUCT_IDS.MARGARINA)
      ),
      fetchAllRows<{ location_id: string | null; quantity_kg: number }>(() =>
        supabase
          .from(REFERENCIA_TABLA.mayonesa)
          .select("location_id, quantity_kg")
          .eq("product_id", PRODUCT_IDS.MAYONESA)
      ),
    ]),
    Promise.all(
      PILOT_SECTOR_KEYS.flatMap((sector) =>
        (["clientes", "universo"] as Pan3MPoblacion[]).map((poblacion) => getRendimiento3M(poblacion, sector))
      )
    ),
  ]);
  // 4 resultados en el mismo orden que se pidieron: [cumana-clientes,
  // cumana-universo, barquisimeto-clientes, barquisimeto-universo].
  const harinaPanPorSectorPoblacion: Record<Sector, Record<Pan3MPoblacion, number>> = {
    cumana: { clientes: harinaPanResultados[0].totalPanKg, universo: harinaPanResultados[1].totalPanKg },
    barquisimeto_este: { clientes: harinaPanResultados[2].totalPanKg, universo: harinaPanResultados[3].totalPanKg },
  };

  const margarinaPorLocation = new Map<string, number>();
  for (const r of margarinaRows) {
    if (r.location_id === null) continue;
    margarinaPorLocation.set(r.location_id, (margarinaPorLocation.get(r.location_id) ?? 0) + Number(r.quantity_kg));
  }
  const mayonesaPorLocation = new Map<string, number>();
  for (const r of mayonesaRows) {
    if (r.location_id === null) continue;
    mayonesaPorLocation.set(r.location_id, (mayonesaPorLocation.get(r.location_id) ?? 0) + Number(r.quantity_kg));
  }

  function sumar(ids: Set<string>, porLocation: Map<string, number>): number {
    let total = 0;
    for (const id of ids) total += porLocation.get(id) ?? 0;
    return Math.round(total * 10) / 10;
  }

  return PILOT_SECTOR_KEYS.map((sector) => {
    const delSector = universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector);
    const universo = vigentesAl(delSector, todayISO());
    const idsUniverso = new Set(universo.map((l) => l.id));
    const idsClientes = new Set(universo.filter((l) => (panqTotals.get(l.id) ?? 0) > 0).map((l) => l.id));

    const armar = (ids: Set<string>, poblacion: Pan3MPoblacion): PortafolioProducto[] => [
      { nombre: "Margarina", volumenKg: sumar(ids, margarinaPorLocation) },
      { nombre: "Mayonesa", volumenKg: sumar(ids, mayonesaPorLocation) },
      { nombre: "Harina PAN", volumenKg: harinaPanPorSectorPoblacion[sector][poblacion] },
    ];

    return {
      sector,
      label: SECTOR_LABELS[sector],
      clientes: armar(idsClientes, "clientes"),
      universo: armar(idsUniverso, "universo"),
    };
  });
}
