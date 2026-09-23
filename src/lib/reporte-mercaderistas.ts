import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRowsChunked } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS } from "@/data/catalog";
import { PVP_TARGETS, PVP_TOLERANCE } from "@/data/pvp-thresholds";
import { getBcvRateLookup, precioVisitaEnUsd } from "@/lib/bcv";
import { getSellInTotalsByLocation, getVolumenLocations, vigentesAl } from "@/lib/universe";
import { COHORTE_PILOTO_ORIGINAL } from "@/lib/cohortes";
import { sectorGroup, type Sector } from "@/lib/sectors";
import { todayISO } from "@/lib/date-buckets";
import { agruparCategoriaAnaquel, type EstadoPrecio } from "@/lib/dienn-queries";
import type { Location, PopMaterialOption, PopMessageOption } from "@/types";

// ────────────────────────────────────────────────────────────────
// Reporte de Mercaderistas (perfil DIENN) — qué encontró cada visita
// en el PDV: presencia de producto, material POP, precio de anaquel y
// ubicación en el anaquel.
//
// Todo sale de `mercaderista_visits` (el wizard de auditoría de la app de
// campo, src/components/field/AuditWizard.tsx) más las unidades de BODEGA de
// `inventory_audits`. No hay datos nuevos: lo que hace esta query es devolver
// el reporte COMPLETO en dos formas, para que el dashboard pueda dar la vista
// global y a la vez dejar bajar a un PDV puntual sin volver al servidor:
//
//   - `visitas`: una fila por visita (histórico completo, orden descendente).
//     Permite recortar por rango de fechas y por mercaderista en el cliente y
//     recalcular la "última visita del período".
//   - `pdv`: una fila por PDV del piloto, visitado o no, con su última visita
//     y su volumen Radar acumulado.
//
// DECISIONES (DIENN, 17-09-2026):
//
//   1. Los porcentajes globales se miden sobre la ÚLTIMA visita de cada PDV
//      (igual que el resto del dashboard: Precio Correcto, Posición en PDV,
//      Cobertura/Comunicación). Contar todas las visitas haría que un PDV
//      visitado 5 veces pesara 5 veces. El corte por mercaderista sí usa
//      todas sus visitas: ahí lo que se evalúa es el trabajo hecho.
//   2. El universo son los 358 del PILOTO INICIAL (cohorte "Piloto original",
//      ver cohortes.ts), no la cartera completa: los mercaderistas solo visitan
//      esos PDV, así que medir la cobertura contra los 1100+ de la cartera
//      ampliada la hundiría con PDV que nadie se propuso visitar. Se incluyen
//      todos, visitados o no, para poder ver quién NO ha sido visitado y quién
//      fue visitado pero NO compró Panquecitas (Radar = 0).
//   3. Un PDV de fuera de los 358 solo aparece si TIENE visitas registradas
//      (la app de campo lista todos los PDV del sector del mercaderista, así
//      que puede pasar). Entra marcado con enPiloto=false y el dashboard lo
//      deja fuera por defecto: así no entra en ningún denominador, pero una
//      visita hecha en campo nunca desaparece del reporte.
//
// Las funciones puras de agregación viven en reporte-mercaderistas-utils.ts,
// para poder correr también en el cliente (este archivo es server-only).
// ────────────────────────────────────────────────────────────────

const VISIT_COLUMNS =
  "id, location_id, created_at, worker_first_name, worker_last_name, worker_cedula, " +
  "pop_present, pop_message, pop_price_tag, pop_materials, pop_materials_other, " +
  "product_present, product_location, product_location_other, " +
  "price_400, price_400_na, price_800, price_800_na, " +
  "total_units_anaquel, anaquel_400_units, anaquel_800_units, front_faces, deposit_access";

interface VisitaCruda {
  id: string;
  location_id: string;
  created_at: string;
  worker_first_name: string | null;
  worker_last_name: string | null;
  worker_cedula: string | null;
  pop_present: boolean | null;
  pop_message: PopMessageOption | null;
  pop_price_tag: boolean | null;
  pop_materials: PopMaterialOption[] | null;
  pop_materials_other: string | null;
  product_present: boolean | null;
  product_location: string[] | null;
  product_location_other: string | null;
  price_400: number | null;
  price_400_na: boolean | null;
  price_800: number | null;
  price_800_na: boolean | null;
  total_units_anaquel: number | null;
  anaquel_400_units: number | null;
  anaquel_800_units: number | null;
  front_faces: number | null;
  deposit_access: boolean | null;
}

/** Etiqueta fija de la ubicación "buena": el pasillo de harina de trigo. */
export const UBICACION_HARINA_TRIGO = "Junto a harina de trigo";
const UBICACION_OTRA_SIN_ESPECIFICAR = "Otra categoría (sin especificar)";

export interface ReporteVisitaRow {
  visitId: string;
  locationId: string;
  /** created_at completo (ISO), la única fecha que tiene la visita. */
  fecha: string;
  /** "YYYY-MM-DD" — lo que usan los filtros de rango. */
  dia: string;
  mercaderista: string;
  cedula: string;
  productPresent: boolean;
  /**
   * El PDV maneja la presentación. Sale de price_*_na ("no disponible" en el
   * wizard), que es el único dato por presentación que se captura.
   */
  disponible400: boolean;
  disponible800: boolean;
  popPresent: boolean;
  popPreciador: boolean | null;
  popMensaje: PopMessageOption | null;
  popMateriales: PopMaterialOption[];
  popMaterialesOtro: string | null;
  /** Categorías de anaquel ya consolidadas (ver agruparCategoriaAnaquel). */
  ubicaciones: string[];
  enHarinaTrigo: boolean;
  /** Precio de anaquel en USD; null = no observado o presentación no disponible. */
  precio400: number | null;
  precio800: number | null;
  estado400: EstadoPrecio | null;
  estado800: EstadoPrecio | null;
  unidadesAnaquel: number | null;
  unidades400: number | null;
  unidades800: number | null;
  carasFrontales: number | null;
  accesoDeposito: boolean;
  unidadesDeposito: number;
}

export type EstadoPdv = "NO_VISITADO" | "VISITADO_SIN_COMPRA" | "VISITADO_CON_COMPRA";

export interface ReportePdvRow {
  locationId: string;
  sapCode: string;
  cliente: string;
  sector: Sector;
  centroPoblado: string | null;
  municipio: string | null;
  tipoCliente: string | null;
  segmento: string | null;
  /** esquema_atencion de la cartera: Directo / Mixto / Indirecto. */
  modelo: string | null;
  zona: string | null;
  asesor: string | null;
  grupoVendedor: string | null;
  cohorte: string | null;
  /**
   * true = es uno de los 358 del piloto inicial, el universo que visitan los
   * mercaderistas. false = PDV de otra tanda con visitas registradas: se
   * muestra, pero no entra en denominadores.
   */
  enPiloto: boolean;
  visitas: number;
  primeraVisita: string | null;
  /** Última visita registrada (histórico completo, sin recortar por fecha). */
  ultima: ReporteVisitaRow | null;
  /** Todos los mercaderistas que lo han visitado, del más reciente al primero. */
  mercaderistas: string[];
  /** Panquecitas confirmadas por Carga Radar (kg acumulados del piloto). */
  radarKg: number;
  estado: EstadoPdv;
}

export interface ReporteMercaderistasResult {
  pdv: ReportePdvRow[];
  /** Histórico completo de visitas, de la más reciente a la más vieja. */
  visitas: ReporteVisitaRow[];
  /** Mercaderistas con al menos una visita registrada, alfabético. */
  mercaderistas: string[];
}

function clasificarPrecio(observado: number, target: number): EstadoPrecio {
  if (Math.abs(observado - target) <= PVP_TOLERANCE) return "CORRECTO";
  return observado > target ? "SOBREPRECIO" : "SUBPRECIO";
}

/** Categorías de anaquel de una visita, ya consolidadas. */
function ubicacionesDe(v: VisitaCruda): string[] {
  if (v.product_present !== true || !v.product_location) return [];
  const out: string[] = [];
  if (v.product_location.includes("HARINA_TRIGO")) out.push(UBICACION_HARINA_TRIGO);
  if (v.product_location.includes("OTRA_CATEGORIA")) {
    const especifica = v.product_location_other?.trim();
    out.push(especifica ? agruparCategoriaAnaquel(especifica) : UBICACION_OTRA_SIN_ESPECIFICAR);
  }
  return out;
}

/** ¿Es uno de los 358 del arranque? Ver COHORTE_PILOTO_ORIGINAL en cohortes.ts. */
function esPilotoOriginal(cohorte: string | null | undefined): boolean {
  return (cohorte ?? "").trim() === COHORTE_PILOTO_ORIGINAL.nombre;
}

function nombreMercaderista(v: VisitaCruda): string {
  const nombre = `${v.worker_first_name ?? ""} ${v.worker_last_name ?? ""}`.trim();
  return nombre.length > 0 ? nombre : "Sin identificar";
}

export async function getReporteMercaderistas(): Promise<ReporteMercaderistasResult> {
  const supabase = createSupabaseServiceClient();

  // Se leen las visitas de TODOS los PDV de los sectores piloto, no solo de los
  // 358: la app de campo le lista al mercaderista todos los PDV de su sector,
  // así que puede haber visitas fuera del universo y hay que poder mostrarlas.
  // El recorte a los 358 se hace al armar las filas, más abajo.
  const universo = vigentesAl(await getVolumenLocations(), todayISO());
  if (universo.length === 0) return { pdv: [], visitas: [], mercaderistas: [] };

  const locationIds = universo.map((l) => l.id);

  const [radarTotals, rateAt] = await Promise.all([
    getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS),
    // Precios cargados en Bs por error (> 100) se normalizan a USD con la tasa
    // del día de la visita — ver src/lib/bcv.ts.
    getBcvRateLookup(),
  ]);

  const visitsData = await fetchAllRowsChunked<VisitaCruda>(
    (lote) => supabase.from("mercaderista_visits").select(VISIT_COLUMNS).in("location_id", lote),
    locationIds
  );

  // Unidades en depósito de CADA visita (no solo de la última): el reporte
  // muestra el historial por PDV. inventory_audits.quantity está en la unidad
  // de la variante, así que se multiplica por units_per_bulk para tener
  // unidades sueltas comparables — igual que getAdminExecutionSnapshot().
  const depositoPorVisita = new Map<string, number>();
  if (visitsData.length > 0) {
    const { data: variantsData } = await supabase.from("variants").select("id, units_per_bulk");
    const unitsPerBulk = new Map(
      ((variantsData ?? []) as { id: string; units_per_bulk: number }[]).map((v) => [v.id, v.units_per_bulk])
    );

    const audits = await fetchAllRowsChunked<{ visit_id: string; variant_id: string; quantity: number }>(
      (lote) =>
        supabase
          .from("inventory_audits")
          .select("visit_id, variant_id, quantity")
          .eq("zone", "BODEGA")
          .in("location_id", lote),
      locationIds
    );

    for (const a of audits) {
      const unidades = a.quantity * (unitsPerBulk.get(a.variant_id) ?? 1);
      depositoPorVisita.set(a.visit_id, (depositoPorVisita.get(a.visit_id) ?? 0) + unidades);
    }
  }

  const locById = new Map<string, Location>(universo.map((l) => [l.id, l]));
  const porPdv = new Map<string, ReporteVisitaRow[]>();
  const visitas: ReporteVisitaRow[] = [];
  const mercaderistas = new Set<string>();

  for (const v of visitsData) {
    const loc = locById.get(v.location_id);
    if (!loc) continue;
    const sector = sectorGroup(loc.oficina_venta);
    if (!sector) continue;
    const target = PVP_TARGETS[sector];

    const precio400 = precioVisitaEnUsd(v.price_400_na ? null : v.price_400, v.created_at, rateAt);
    const precio800 = precioVisitaEnUsd(v.price_800_na ? null : v.price_800, v.created_at, rateAt);
    const ubicaciones = ubicacionesDe(v);
    const mercaderista = nombreMercaderista(v);
    mercaderistas.add(mercaderista);

    const row: ReporteVisitaRow = {
      visitId: v.id,
      locationId: v.location_id,
      fecha: v.created_at,
      dia: v.created_at.slice(0, 10),
      mercaderista,
      cedula: v.worker_cedula ?? "",
      productPresent: v.product_present === true,
      disponible400: v.price_400_na !== true,
      disponible800: v.price_800_na !== true,
      popPresent: v.pop_present === true,
      popPreciador: v.pop_present === true ? v.pop_price_tag ?? null : null,
      popMensaje: v.pop_message,
      popMateriales: v.pop_materials ?? [],
      popMaterialesOtro: v.pop_materials_other,
      ubicaciones,
      enHarinaTrigo: ubicaciones.includes(UBICACION_HARINA_TRIGO),
      precio400,
      precio800,
      estado400: precio400 != null ? clasificarPrecio(precio400, target.p400) : null,
      estado800: precio800 != null ? clasificarPrecio(precio800, target.p800) : null,
      unidadesAnaquel: v.total_units_anaquel,
      unidades400: v.anaquel_400_units,
      unidades800: v.anaquel_800_units,
      carasFrontales: v.front_faces,
      accesoDeposito: v.deposit_access === true,
      unidadesDeposito: depositoPorVisita.get(v.id) ?? 0,
    };

    visitas.push(row);
    const lista = porPdv.get(v.location_id);
    if (lista) lista.push(row);
    else porPdv.set(v.location_id, [row]);
  }

  // Más reciente primero, aquí y en el historial de cada PDV: es el orden en
  // que se lee el reporte y el que define "la última visita".
  const masRecientePrimero = (a: ReporteVisitaRow, b: ReporteVisitaRow) => b.fecha.localeCompare(a.fecha);
  visitas.sort(masRecientePrimero);
  for (const lista of porPdv.values()) lista.sort(masRecientePrimero);

  const pdv: ReportePdvRow[] = [];
  for (const l of universo) {
    const sector = sectorGroup(l.oficina_venta);
    if (!sector) continue;
    const suyas = porPdv.get(l.id) ?? [];
    const enPiloto = esPilotoOriginal(l.cohorte);
    // Fuera de los 358 solo entra el que tenga visitas registradas: el resto de
    // la cartera ampliada no es universo de mercaderistas y solo ensuciaría la
    // lista con cientos de PDV "no visitados" que nadie tenía que visitar.
    if (!enPiloto && suyas.length === 0) continue;
    const radarKg = radarTotals.get(l.id) ?? 0;

    pdv.push({
      locationId: l.id,
      sapCode: l.sap_code ?? "",
      cliente: l.name,
      sector,
      centroPoblado: l.centro_poblado,
      municipio: l.municipio,
      tipoCliente: l.tipo_cliente,
      segmento: l.segmento_cliente ?? null,
      modelo: l.esquema_atencion,
      zona: l.zona_venta,
      asesor: l.asesor_encargado,
      grupoVendedor: l.grupo_vendedor,
      cohorte: l.cohorte,
      enPiloto,
      visitas: suyas.length,
      primeraVisita: suyas.length > 0 ? suyas[suyas.length - 1].fecha : null,
      ultima: suyas[0] ?? null,
      mercaderistas: Array.from(new Set(suyas.map((v) => v.mercaderista))),
      radarKg: Math.round(radarKg * 10) / 10,
      estado:
        suyas.length === 0 ? "NO_VISITADO" : radarKg > 0 ? "VISITADO_CON_COMPRA" : "VISITADO_SIN_COMPRA",
    });
  }

  return {
    pdv,
    visitas,
    mercaderistas: Array.from(mercaderistas).sort((a, b) => a.localeCompare(b, "es")),
  };
}
