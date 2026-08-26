import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getUniverseLocations, getSellInTotalsByLocation, vigentesAl, sectorGroup, SECTOR_LABELS, type Sector } from "@/lib/universe";
import { contarDiasHabiles } from "@/lib/business-days";
import { bucketLabelFor, todayISO } from "@/lib/date-buckets";
import { PRODUCT_IDS } from "@/data/catalog";

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
 *   - no hay distinción clientes/universo: las tablas nuevas ya son
 *     solo-cartera por diseño, así que el promedio es un solo número;
 *   - Panquecitas del día se acota también a cartera únicamente (a
 *     diferencia de PAN, que suma además fuera de cartera), para comparar
 *     contra una referencia que ya es 100% cartera.
 */
export async function getRendimientoVsMavesa(
  categoria: MavesaCategoria,
  sector?: Sector
): Promise<RendimientoVsMavesaResult> {
  const universoTotal = await getUniverseLocations();
  const delSector = sector ? universoTotal.filter((l) => sectorGroup(l.oficina_venta) === sector) : universoTotal;
  const universo = vigentesAl(delSector, todayISO());
  if (universo.length === 0) return VACIO(categoria);
  const idsUniverso = new Set(universo.map((l) => l.id));

  const supabase = createSupabaseServiceClient();
  const productId = CATEGORIA_PRODUCT_ID[categoria];

  const referenciaData = await fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(
    () =>
      supabase
        .from(REFERENCIA_TABLA[categoria])
        .select("location_id, quantity_kg, date_of_sale")
        .eq("product_id", productId)
  );

  const referenciaFiltrada = referenciaData.filter((r) => idsUniverso.has(r.location_id));
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

  // Panquecitas por día — acotado a cartera únicamente (a diferencia de
  // getRendimiento3M, que también suma fuera de cartera para calzar con la
  // tarjeta de volumen del dashboard). Acá se compara contra una referencia
  // 100% cartera, así que el numerador se acota igual.
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
 *   - Panquecitas / Harina PAN → sap_sell_in_records (Carga Radar, la venta
 *     viva del piloto — misma fuente que getPanVsHarinaPan).
 *   - Margarina / Mayonesa → radar_{categoria}_actual_records (agosto en
 *     adelante) — NUNCA las tablas _referencia, que son exclusivas del
 *     gráfico de ratio (getRendimientoVsMavesa).
 *
 * No se recorta por vigentesAl(): es un acumulado de volumen, no una tasa
 * con denominador de población — mismo criterio que getVolumenLocations()
 * para métricas de volumen puro.
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

  const [panquecitasTotals, harinaPanTotals, margarinaRows, mayonesaRows] = await Promise.all([
    getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS),
    getSellInTotalsByLocation(PRODUCT_IDS.HARINA_PAN),
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
    return {
      sector,
      label: SECTOR_LABELS[sector],
      productos: [
        { nombre: "Panquecitas", volumenKg: sumar(ids, panquecitasTotals) },
        { nombre: "Margarina", volumenKg: sumar(ids, margarinaPorLocation) },
        { nombre: "Mayonesa", volumenKg: sumar(ids, mayonesaPorLocation) },
        { nombre: "Harina PAN", volumenKg: sumar(ids, harinaPanTotals) },
      ],
    };
  });
}
