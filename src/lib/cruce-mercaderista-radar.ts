import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRowsChunked } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS } from "@/data/catalog";
import { getUniverseLocations, vigentesAl, sectorGroup, type Sector } from "@/lib/universe";
import { todayISO } from "@/lib/date-buckets";
import { presentacionFromVariant } from "@/lib/sellout-utils";
import { diasHabilesEntre } from "@/lib/business-days";
import {
  EPSILON_KG,
  PERIODO_MINIMO_DIAS,
  nivelRotacion,
  rangoNivel,
  type NivelRotacion,
} from "@/lib/rotacion-utils";

// ── Cruce: rotación de Panquecitas en el PDV (mercaderista × Radar) ──
// (pedido de DIENN, 14-09-2026; rehecho como rotación entre visitas el
// 16-09-2026)
//
// Responde: ¿a qué velocidad rota el producto en cada PDV? Se mide dentro de
// un período corto que termina en la ÚLTIMA visita del mercaderista:
//
//   vendido = inventario al inicio + Radar del período − inventario contado
//
// El inicio depende de cuántas visitas tenga el PDV:
//
//   - DOS O MÁS visitas: la visita anterior más reciente que tenga al menos
//     PERIODO_MINIMO_DIAS (5) días hábiles antes de la última, con su inventario contado.
//   - UNA visita (o ninguna anterior a 5 hábiles o más): el PRIMER pedido de
//     Panquecitas por Radar, con inventario 0. Panquecitas es un producto
//     nuevo del piloto: antes de su primer pedido el PDV no tenía producto,
//     así que no es una estimación.
//
// Correcciones del 16-09-2026 (DIENN, tras ver 91 PDV "sin venta"):
//   - Un período de menos de 5 días hábiles no se clasifica (PERIODO_CORTO): no
//     vender nada en 2 días no dice nada de la rotación.
//   - Vendido 0 se llama "sin movimiento" y, si el conteo es idéntico al de
//     la visita anterior, se marca (conteoRepetido): puede ser un conteo
//     copiado.
//   - Los PDV de modelo indirecto SÍ se miden igual que los directos: su
//     Radar es la venta de la franquiciada o distribuidora a ese PDV. Una
//     versión intermedia los dejaba fuera de la escala; DIENN lo corrigió.
//     esIndirecto se conserva para poder filtrarlos.
//
// Con eso:
//   % vendido  = vendido ÷ disponible (inventario inicial + Radar del período)
//   ritmo      = vendido ÷ días HÁBILES del período (kg/día hábil)
//   cobertura  = inventario contado ÷ ritmo (días hábiles que le dura lo que tiene)
//
// DÍAS HÁBILES (lunes a viernes, DIENN 16-09-2026, igual que business-days.ts):
// los del intervalo [inicio, visita) — el día de la visita no cuenta porque el
// conteo se hizo ese día, igual que su pedido Radar se toma como posterior.
//
// La escala (rotación alta / media / baja / muy baja) sale de la cobertura,
// que no depende de lo largo del período. Ver src/lib/rotacion-utils.ts.
//
// Antes este cruce dividía el inventario entre TODO el Radar acumulado del
// PDV, incluido lo despachado después de la visita: la proporción mejoraba
// sola con el tiempo y no medía velocidad. Esa proporción se conserva solo
// como referencia en el Excel.
//
// FECHAS: la visita se toma por día (created_at.slice(0, 10), igual que el
// resto del dashboard). Un pedido Radar con la MISMA fecha de una visita se
// considera POSTERIOR al conteo — el Radar no dice a qué hora llegó — así que
// no cuenta como comprado antes de la visita final y sí entra en el período
// que empieza en la visita anterior.
//
// POBLACIÓN: cartera vigente, con visita de mercaderista y con Radar de
// Panquecitas ANTES de la última visita (sin compra previa no hay qué medir,
// salvo que la visita anterior ya hubiera encontrado producto). Los visitados
// que no se pueden medir se cuentan aparte para que no desaparezcan en
// silencio.

export type TipoMedicion = "ENTRE_VISITAS" | "DESDE_PRIMER_PEDIDO";

export interface CruceInventarioRadarRow {
  locationId: string;
  name: string;
  sapCode: string;
  sector: Sector | null;
  zona: string | null;
  asesor: string | null;
  segmento: string | null;
  esquema: string | null;
  grupoVendedor: string | null;
  tipoCliente: string | null;
  mercaderista: string;

  tipoMedicion: TipoMedicion;
  /** Inicio del período ("YYYY-MM-DD"): visita anterior o primer pedido Radar. */
  fechaInicio: string;
  /** Última visita ("YYYY-MM-DD"). */
  fechaVisita: string;
  /** Días hábiles (L–V) del período: [inicio, visita). */
  dias: number;

  /** Inventario al inicio: el de la visita anterior, o 0 desde el primer pedido. */
  inventarioInicialKg: number;
  /** Radar de Panquecitas del período (neto de devoluciones). */
  radarPeriodoKg: number;
  /** inventario inicial + Radar del período. */
  disponibleKg: number;

  unidades400: number;
  unidades800: number;
  anaquelKg: number;
  depositoKg: number;
  /** false = en alguna de las visitas no hubo acceso al depósito; el inventario puede estar incompleto. */
  depositoIncluido: boolean;
  /** Inventario contado en la última visita. */
  inventarioKg: number;

  /** disponible − inventario contado. Negativo = inconsistente. */
  vendidoKg: number;
  /** vendido ÷ disponible × 100. */
  pctVendido: number | null;
  /** vendido ÷ días hábiles, kg/día hábil (0 si no vendió). */
  ritmoKgDia: number;
  /** inventario ÷ ritmo; null si no vendió nada. */
  coberturaDias: number | null;
  nivel: NivelRotacion;
  /** Lo que da la fórmula aunque el PDV quede fuera de la escala por período corto. */
  nivelFormula: NivelRotacion;
  /** Modelo indirecto según el esquema de atención. */
  esIndirecto: boolean;
  /** Entre visitas: mismas unidades de anaquel y mismo depósito que la visita anterior. */
  conteoRepetido: boolean;
  /** Por qué el PDV cae en ese nivel, con sus números. */
  justificacion: string;

  /** Radar despachado desde el día de la visita en adelante (volvió a pedir). */
  pedidoPosteriorKg: number;
  /** Referencia del cálculo anterior: todo el Radar del PDV. */
  radarTotalKg: number;
  /** Referencia del cálculo anterior: inventario ÷ Radar total × 100. */
  proporcionAcumuladaPct: number;
}

export interface CruceInventarioRadarResult {
  filas: CruceInventarioRadarRow[];
  /** PDV de la cartera vigente con al menos una visita. */
  visitados: number;
  /** Visitados sin Radar antes de la última visita (no se pueden medir). */
  visitadosSinCompraPrevia: number;
}

interface VisitaCruce {
  id: string;
  location_id: string;
  created_at: string;
  worker_first_name: string | null;
  worker_last_name: string | null;
  anaquel_400_units: number | null;
  anaquel_800_units: number | null;
  deposit_access: boolean;
}

interface RadarDia {
  location_id: string;
  quantity_kg: number;
  date_of_sale: string;
}

/** Días hábiles (L–V) de [desde, hasta): el día final no cuenta. */
function diasHabilesPeriodo(desde: string, hasta: string): number {
  return diasHabilesEntre(desde, hasta).filter((d) => d < hasta).length;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const num = (v: number, dec = 1) => v.toLocaleString("es-VE", { maximumFractionDigits: dec });
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

const NOMBRE_NIVEL: Record<NivelRotacion, string> = {
  AGOTADO: "agotado",
  ALTA: "rotación alta",
  MEDIA: "rotación media",
  BAJA: "rotación baja",
  MUY_BAJA: "rotación muy baja",
  INCONSISTENTE: "dato inconsistente",
  PERIODO_CORTO: "período corto",
};

function justificar(f: Omit<CruceInventarioRadarRow, "justificacion">): string {
  const periodo =
    f.tipoMedicion === "ENTRE_VISITAS"
      ? `Entre la visita del ${fechaCorta(f.fechaInicio)} (contó ${num(f.inventarioInicialKg)} kg) y la del ${fechaCorta(
          f.fechaVisita
        )} (${f.dias} días hábiles) le llegaron ${num(f.radarPeriodoKg)} kg por Radar: tuvo ${num(f.disponibleKg)} kg disponibles`
      : `Desde su primer pedido (${fechaCorta(f.fechaInicio)}) hasta la visita del ${fechaCorta(f.fechaVisita)} (${
          f.dias
        } días hábiles) compró ${num(f.disponibleKg)} kg por Radar`;

  // Lectura según la fórmula (nivelFormula); el nivel final puede quedar fuera
  // de la escala por período corto.
  const n = f.nivelFormula;
  let lectura: string;
  if (n === "INCONSISTENTE") {
    lectura = `, pero el mercaderista contó ${num(f.inventarioKg)} kg, ${num(-f.vendidoKg)} kg más de lo disponible. El conteo y el Radar no cuadran, así que no se clasifica`;
  } else if (n === "AGOTADO") {
    lectura = ` y el mercaderista contó 0 kg: vendió todo lo disponible (${num(f.vendidoKg)} kg, ${num(
      f.ritmoKgDia,
      2
    )} kg/día hábil) → ${NOMBRE_NIVEL.AGOTADO}`;
  } else if (f.coberturaDias == null) {
    lectura = ` y el mercaderista contó ${num(f.inventarioKg)} kg, exactamente lo que tenía disponible: no hubo movimiento de inventario en el período → ${NOMBRE_NIVEL[n]} (${rangoNivel(n)})`;
  } else {
    lectura = ` y el mercaderista contó ${num(f.inventarioKg)} kg: vendió ${num(f.vendidoKg)} kg (${num(
      f.pctVendido ?? 0
    )}%), ${num(f.ritmoKgDia, 2)} kg/día hábil. A ese ritmo lo que tiene le dura ${num(f.coberturaDias)} días hábiles → ${
      NOMBRE_NIVEL[n]
    } (${rangoNivel(n)})`;
  }

  let texto: string;
  if (f.nivel === "PERIODO_CORTO") {
    texto = `${periodo} y el mercaderista contó ${num(f.inventarioKg)} kg. Son solo ${f.dias} días hábiles (mínimo ${PERIODO_MINIMO_DIAS}): el período es muy corto para clasificar su rotación.`;
  } else {
    texto = `${periodo}${lectura}.`;
  }

  if (f.conteoRepetido) {
    texto += ` El conteo es idéntico al de la visita anterior (${f.unidades400} u. 400 g, ${f.unidades800} u. 800 g${
      f.depositoKg > 0 ? `, ${num(f.depositoKg)} kg en depósito` : ""
    }): puede ser falta de movimiento o un conteo repetido.`;
  }
  if (!f.depositoIncluido) {
    texto += " Sin acceso al depósito en alguna visita: el inventario puede estar incompleto y la rotación verse más alta de lo que es.";
  }
  return texto;
}

function esModeloIndirecto(esquema: string | null): boolean {
  return (esquema ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .includes("indirecto");
}

export async function getCruceInventarioRadar(): Promise<CruceInventarioRadarResult> {
  const vacio: CruceInventarioRadarResult = { filas: [], visitados: 0, visitadosSinCompraPrevia: 0 };

  // Cartera vigente hoy, igual que Sell-Out por cliente.
  const universo = vigentesAl(await getUniverseLocations(), todayISO());
  if (universo.length === 0) return vacio;
  const locationIds = universo.map((l) => l.id);

  const supabase = createSupabaseServiceClient();
  const [visitas, radar] = await Promise.all([
    fetchAllRowsChunked<VisitaCruce>(
      (lote) =>
        supabase
          .from("mercaderista_visits")
          .select(
            "id, location_id, created_at, worker_first_name, worker_last_name, anaquel_400_units, anaquel_800_units, deposit_access"
          )
          .in("location_id", lote),
      locationIds
    ),
    fetchAllRowsChunked<RadarDia>(
      (lote) =>
        supabase
          .from("sap_sell_in_records")
          .select("location_id, quantity_kg, date_of_sale")
          .eq("product_id", PRODUCT_IDS.PANQUECITAS)
          .in("location_id", lote),
      locationIds
    ),
  ]);

  // Visitas por PDV, de la más reciente a la más vieja. Se ordena por fecha y
  // no por orden de llegada: la lista viene partida en lotes y paginada por id.
  const visitasPorLoc = new Map<string, VisitaCruce[]>();
  for (const v of visitas) {
    const lista = visitasPorLoc.get(v.location_id) ?? [];
    lista.push(v);
    visitasPorLoc.set(v.location_id, lista);
  }
  if (visitasPorLoc.size === 0) return vacio;

  // Última visita y la anterior más reciente con al menos PERIODO_MINIMO_DIAS
  // de distancia: dos visitas muy seguidas no forman un período medible.
  const pares = new Map<string, { ultima: VisitaCruce; anterior: VisitaCruce | null }>();
  for (const [loc, lista] of visitasPorLoc) {
    lista.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    const ultima = lista[0];
    const diaUltima = ultima.created_at.slice(0, 10);
    const anterior =
      lista.find((v) => diasHabilesPeriodo(v.created_at.slice(0, 10), diaUltima) >= PERIODO_MINIMO_DIAS) ?? null;
    pares.set(loc, { ultima, anterior });
  }

  const radarPorLoc = new Map<string, RadarDia[]>();
  for (const r of radar) {
    const lista = radarPorLoc.get(r.location_id) ?? [];
    lista.push({ ...r, quantity_kg: Number(r.quantity_kg) });
    radarPorLoc.set(r.location_id, lista);
  }

  // Depósito (BODEGA) de las visitas usadas, en kg — solo presentaciones de Panquecitas.
  const visitIds: string[] = [];
  for (const { ultima, anterior } of pares.values()) {
    visitIds.push(ultima.id);
    if (anterior) visitIds.push(anterior.id);
  }
  const depositoKgPorVisita = new Map<string, number>();
  const { data: variantsData } = await supabase.from("variants").select("id, presentation_kg, units_per_bulk");
  const kgPorUnidad = new Map<string, number>(
    ((variantsData ?? []) as { id: string; presentation_kg: number; units_per_bulk: number }[]).map((v) => [
      v.id,
      v.presentation_kg * v.units_per_bulk,
    ])
  );
  const audits = await fetchAllRowsChunked<{ visit_id: string; variant_id: string; quantity: number }>(
    (lote) =>
      supabase.from("inventory_audits").select("visit_id, variant_id, quantity").eq("zone", "BODEGA").in("visit_id", lote),
    visitIds
  );
  for (const a of audits) {
    if (!presentacionFromVariant(a.variant_id)) continue;
    const kg = a.quantity * (kgPorUnidad.get(a.variant_id) ?? 0);
    depositoKgPorVisita.set(a.visit_id, (depositoKgPorVisita.get(a.visit_id) ?? 0) + kg);
  }

  const inventarioDe = (v: VisitaCruce) => {
    const anaquelKg = (v.anaquel_400_units ?? 0) * 0.4 + (v.anaquel_800_units ?? 0) * 0.8;
    const depositoKg = v.deposit_access ? depositoKgPorVisita.get(v.id) ?? 0 : 0;
    return { anaquelKg, depositoKg, totalKg: anaquelKg + depositoKg };
  };

  const filas: CruceInventarioRadarRow[] = [];
  let visitadosSinCompraPrevia = 0;

  for (const l of universo) {
    const par = pares.get(l.id);
    if (!par) continue;
    const { ultima } = par;
    const diaVisita = ultima.created_at.slice(0, 10);
    const radarLoc = radarPorLoc.get(l.id) ?? [];

    const radarTotalKg = radarLoc.reduce((s, r) => s + r.quantity_kg, 0);
    // Pedido del mismo día de la visita = posterior al conteo.
    const pedidoPosteriorKg = radarLoc.filter((r) => r.date_of_sale >= diaVisita).reduce((s, r) => s + r.quantity_kg, 0);
    const final = inventarioDe(ultima);

    let tipoMedicion: TipoMedicion;
    let fechaInicio: string;
    let inventarioInicialKg: number;
    let radarPeriodoKg: number;
    let depositoIncluido = ultima.deposit_access;
    let conteoRepetido = false;

    const anterior = par.anterior;
    if (anterior) {
      const diaAnterior = anterior.created_at.slice(0, 10);
      tipoMedicion = "ENTRE_VISITAS";
      fechaInicio = diaAnterior;
      const inicial = inventarioDe(anterior);
      inventarioInicialKg = inicial.totalKg;
      radarPeriodoKg = radarLoc
        .filter((r) => r.date_of_sale >= diaAnterior && r.date_of_sale < diaVisita)
        .reduce((s, r) => s + r.quantity_kg, 0);
      depositoIncluido = depositoIncluido && anterior.deposit_access;
      conteoRepetido =
        (anterior.anaquel_400_units ?? 0) === (ultima.anaquel_400_units ?? 0) &&
        (anterior.anaquel_800_units ?? 0) === (ultima.anaquel_800_units ?? 0) &&
        anterior.deposit_access === ultima.deposit_access &&
        Math.abs(inicial.depositoKg - final.depositoKg) <= EPSILON_KG &&
        final.totalKg > 0;
    } else {
      const previos = radarLoc.filter((r) => r.date_of_sale < diaVisita);
      const primerPedido = previos
        .filter((r) => r.quantity_kg > 0)
        .reduce<string | null>((min, r) => (min == null || r.date_of_sale < min ? r.date_of_sale : min), null);
      tipoMedicion = "DESDE_PRIMER_PEDIDO";
      fechaInicio = primerPedido ?? diaVisita;
      inventarioInicialKg = 0;
      radarPeriodoKg = previos.reduce((s, r) => s + r.quantity_kg, 0);
    }

    const disponibleKg = inventarioInicialKg + radarPeriodoKg;
    // Sin nada disponible no hay rotación que medir.
    if (disponibleKg <= 0) {
      visitadosSinCompraPrevia += 1;
      continue;
    }

    // Al menos 1 para poder dividir: un período de 0 hábiles (p. ej. pedido del
    // sábado y visita del lunes) igual queda como período corto.
    const dias = Math.max(1, diasHabilesPeriodo(fechaInicio, diaVisita));
    const vendidoKg = disponibleKg - final.totalKg;
    // Un vendido dentro de la tolerancia es "sin movimiento", no un ritmo
    // ínfimo con miles de días de cobertura.
    const ritmoKgDia = vendidoKg > EPSILON_KG ? vendidoKg / dias : 0;
    // Redondeada ANTES de clasificar, para que el nivel y la cifra que se
    // muestra en la justificación nunca se contradigan en un borde (6,96 → 7).
    const coberturaDias = ritmoKgDia > 0 ? r1(final.totalKg / ritmoKgDia) : null;
    const nivelFormula = nivelRotacion(final.totalKg, vendidoKg, coberturaDias);
    const esIndirecto = esModeloIndirecto(l.esquema_atencion);
    const nivel: NivelRotacion = dias < PERIODO_MINIMO_DIAS ? "PERIODO_CORTO" : nivelFormula;

    const fila: Omit<CruceInventarioRadarRow, "justificacion"> = {
      locationId: l.id,
      name: l.name,
      sapCode: l.sap_code,
      sector: sectorGroup(l.oficina_venta),
      zona: l.region,
      asesor: l.asesor_encargado,
      segmento: l.segmento_cliente?.trim() || null,
      esquema: l.esquema_atencion,
      grupoVendedor: l.grupo_vendedor,
      tipoCliente: l.tipo_cliente,
      mercaderista: `${ultima.worker_first_name ?? ""} ${ultima.worker_last_name ?? ""}`.trim(),
      tipoMedicion,
      fechaInicio,
      fechaVisita: diaVisita,
      dias,
      inventarioInicialKg: r1(inventarioInicialKg),
      radarPeriodoKg: r1(radarPeriodoKg),
      disponibleKg: r1(disponibleKg),
      unidades400: ultima.anaquel_400_units ?? 0,
      unidades800: ultima.anaquel_800_units ?? 0,
      anaquelKg: r1(final.anaquelKg),
      depositoKg: r1(final.depositoKg),
      depositoIncluido,
      inventarioKg: r1(final.totalKg),
      vendidoKg: r1(vendidoKg),
      pctVendido: r1((vendidoKg / disponibleKg) * 100),
      ritmoKgDia: Math.round(ritmoKgDia * 100) / 100,
      coberturaDias,
      nivel,
      nivelFormula,
      esIndirecto,
      conteoRepetido,
      pedidoPosteriorKg: r1(pedidoPosteriorKg),
      radarTotalKg: r1(radarTotalKg),
      proporcionAcumuladaPct: radarTotalKg > 0 ? r1((final.totalKg / radarTotalKg) * 100) : 0,
    };
    filas.push({ ...fila, justificacion: justificar(fila) });
  }

  return { filas, visitados: pares.size, visitadosSinCompraPrevia };
}
