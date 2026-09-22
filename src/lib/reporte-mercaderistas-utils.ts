import type { EstadoPrecio } from "@/lib/dienn-queries";
import type { EstadoPdv, ReportePdvRow, ReporteVisitaRow } from "@/lib/reporte-mercaderistas";
import type { PopMaterialOption, PopMessageOption } from "@/types";

// ────────────────────────────────────────────────────────────────
// Agregación del Reporte de Mercaderistas. Puro, sin dependencias de
// servidor, para que corra también en el Client Component: el dashboard
// recibe el reporte completo una sola vez y cada filtro (ciudad,
// mercaderista, rango de fechas, estado) recalcula todo en memoria.
//
// resumirEjecucion() sirve para los dos cortes del reporte, y en los dos
// cuenta VISITAS, no PDV — la diferencia está en lo que se le pasa:
//   - global: la última visita de cada PDV (una por PDV), para que un PDV
//     visitado muchas veces no pese más que los demás;
//   - por mercaderista: todas sus visitas, porque ahí lo que se mide es el
//     trabajo hecho.
// ────────────────────────────────────────────────────────────────

export const POP_MENSAJE_LABELS: Record<PopMessageOption, string> = {
  SIEMPRE_GANAS: "Siempre ganas",
  ALIMENTA_IDEAS: "Alimenta tus ideas",
};

export const POP_MATERIAL_LABELS: Record<PopMaterialOption, string> = {
  DANGLER: "Dangler",
  TENT_CARD: "Tent Card",
  PRECIADOR: "Preciador",
  OTRO: "Otro",
};

export const ESTADO_PDV_LABELS: Record<EstadoPdv, string> = {
  NO_VISITADO: "No visitado",
  VISITADO_SIN_COMPRA: "Visitado sin compra",
  VISITADO_CON_COMPRA: "Visitado con compra",
};

export const ESTADO_PRECIO_LABELS: Record<EstadoPrecio, string> = {
  SUBPRECIO: "Subprecio",
  CORRECTO: "Correcto",
  SOBREPRECIO: "Sobreprecio",
};

/** Conteo por clave, de mayor a menor. */
export interface Conteo {
  clave: string;
  label: string;
  visitas: number;
  pct: number;
}

export interface ResumenPrecio {
  /** Visitas con precio observado de esa presentación. */
  observadas: number;
  correcto: number;
  subprecio: number;
  sobreprecio: number;
  pctCorrecto: number | null;
  promedio: number | null;
  minimo: number | null;
  maximo: number | null;
}

export interface ResumenEjecucion {
  visitas: number;
  /** PDV distintos representados en esas visitas. */
  pdv: number;
  conProducto: number;
  pctProducto: number | null;
  /** Sobre las visitas CON producto: qué presentaciones maneja el PDV. */
  pctDisponible400: number | null;
  pctDisponible800: number | null;
  conPop: number;
  pctPop: number | null;
  conPreciador: number;
  pctPreciador: number | null;
  mensajes: Conteo[];
  materiales: Conteo[];
  ubicaciones: Conteo[];
  pctHarinaTrigo: number | null;
  precio400: ResumenPrecio;
  precio800: ResumenPrecio;
  /** Promedios de exhibición sobre las visitas con producto. */
  unidadesAnaquelProm: number | null;
  carasFrontalesProm: number | null;
  conAccesoDeposito: number;
  pctAccesoDeposito: number | null;
  unidadesDepositoProm: number | null;
}

export interface ResumenGlobal extends ResumenEjecucion {
  /** PDV del universo filtrado (denominador de la cobertura). */
  pdvUniverso: number;
  visitados: number;
  noVisitados: number;
  pctCobertura: number | null;
  visitasTotales: number;
  visitadosSinCompra: number;
  visitadosConCompra: number;
  pctVisitadosSinCompra: number | null;
}

export interface ResumenMercaderista extends ResumenEjecucion {
  mercaderista: string;
  ultimaVisita: string | null;
}

const pct1 = (parte: number, total: number): number | null =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

const prom = (valores: number[]): number | null =>
  valores.length > 0 ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10 : null;

function conteos(
  pares: [string, string][], // [clave, label] de cada ocurrencia
  total: number
): Conteo[] {
  const acc = new Map<string, { label: string; visitas: number }>();
  for (const [clave, label] of pares) {
    const prev = acc.get(clave);
    if (prev) prev.visitas += 1;
    else acc.set(clave, { label, visitas: 1 });
  }
  return Array.from(acc.entries())
    .map(([clave, { label, visitas }]) => ({ clave, label, visitas, pct: pct1(visitas, total) ?? 0 }))
    .sort((a, b) => b.visitas - a.visitas || a.label.localeCompare(b.label, "es"));
}

function resumirPrecio(precios: (number | null)[], estados: (EstadoPrecio | null)[]): ResumenPrecio {
  const valores = precios.filter((p): p is number => p != null);
  const observadas = valores.length;
  const cuenta = (e: EstadoPrecio) => estados.filter((s) => s === e).length;
  const correcto = cuenta("CORRECTO");

  return {
    observadas,
    correcto,
    subprecio: cuenta("SUBPRECIO"),
    sobreprecio: cuenta("SOBREPRECIO"),
    pctCorrecto: pct1(correcto, observadas),
    promedio: observadas > 0 ? Math.round((valores.reduce((s, v) => s + v, 0) / observadas) * 100) / 100 : null,
    minimo: observadas > 0 ? Math.min(...valores) : null,
    maximo: observadas > 0 ? Math.max(...valores) : null,
  };
}

/** Ejecución en PDV de un conjunto de visitas (ver nota de arriba sobre qué pasarle). */
export function resumirEjecucion(visitas: readonly ReporteVisitaRow[]): ResumenEjecucion {
  const total = visitas.length;
  const conProducto = visitas.filter((v) => v.productPresent);
  const conPop = visitas.filter((v) => v.popPresent);

  return {
    visitas: total,
    pdv: new Set(visitas.map((v) => v.locationId)).size,
    conProducto: conProducto.length,
    pctProducto: pct1(conProducto.length, total),
    pctDisponible400: pct1(conProducto.filter((v) => v.disponible400).length, conProducto.length),
    pctDisponible800: pct1(conProducto.filter((v) => v.disponible800).length, conProducto.length),
    conPop: conPop.length,
    pctPop: pct1(conPop.length, total),
    // El preciador se pregunta solo si hay POP, así que el denominador son las
    // visitas con POP — no todas.
    conPreciador: conPop.filter((v) => v.popPreciador === true).length,
    pctPreciador: pct1(conPop.filter((v) => v.popPreciador === true).length, conPop.length),
    mensajes: conteos(
      conPop.map((v): [string, string] =>
        v.popMensaje ? [v.popMensaje, POP_MENSAJE_LABELS[v.popMensaje]] : ["SIN_MENSAJE", "Sin mensaje registrado"]
      ),
      conPop.length
    ),
    materiales: conteos(
      conPop.flatMap((v) =>
        v.popMateriales.length > 0
          ? v.popMateriales.map((m): [string, string] => [m, POP_MATERIAL_LABELS[m]])
          : [["SIN_MATERIAL", "Sin material registrado"] as [string, string]]
      ),
      conPop.length
    ),
    ubicaciones: conteos(
      conProducto.flatMap((v) =>
        v.ubicaciones.length > 0
          ? v.ubicaciones.map((u): [string, string] => [u, u])
          : [["SIN_UBICACION", "Sin ubicación registrada"] as [string, string]]
      ),
      conProducto.length
    ),
    pctHarinaTrigo: pct1(conProducto.filter((v) => v.enHarinaTrigo).length, conProducto.length),
    precio400: resumirPrecio(
      visitas.map((v) => v.precio400),
      visitas.map((v) => v.estado400)
    ),
    precio800: resumirPrecio(
      visitas.map((v) => v.precio800),
      visitas.map((v) => v.estado800)
    ),
    unidadesAnaquelProm: prom(
      conProducto.map((v) => v.unidadesAnaquel).filter((u): u is number => u != null)
    ),
    carasFrontalesProm: prom(conProducto.map((v) => v.carasFrontales).filter((c): c is number => c != null)),
    conAccesoDeposito: visitas.filter((v) => v.accesoDeposito).length,
    pctAccesoDeposito: pct1(visitas.filter((v) => v.accesoDeposito).length, total),
    unidadesDepositoProm: prom(visitas.filter((v) => v.accesoDeposito).map((v) => v.unidadesDeposito)),
  };
}

/**
 * Vista global: cobertura sobre el universo filtrado + ejecución de la última
 * visita de cada PDV (la del período, si hay filtro de fechas).
 */
export function resumirGlobal(
  pdv: readonly PdvConPeriodo[],
  visitasDelPeriodo: readonly ReporteVisitaRow[]
): ResumenGlobal {
  const ultimas = pdv.map((p) => p.ultimaPeriodo).filter((v): v is ReporteVisitaRow => v != null);
  const visitados = ultimas.length;
  const sinCompra = pdv.filter((p) => p.estadoPeriodo === "VISITADO_SIN_COMPRA").length;

  return {
    ...resumirEjecucion(ultimas),
    pdvUniverso: pdv.length,
    visitados,
    noVisitados: pdv.length - visitados,
    pctCobertura: pct1(visitados, pdv.length),
    visitasTotales: visitasDelPeriodo.length,
    visitadosSinCompra: sinCompra,
    visitadosConCompra: pdv.filter((p) => p.estadoPeriodo === "VISITADO_CON_COMPRA").length,
    pctVisitadosSinCompra: pct1(sinCompra, visitados),
  };
}

/** Una fila por mercaderista, con TODAS sus visitas del período. */
export function resumirPorMercaderista(visitas: readonly ReporteVisitaRow[]): ResumenMercaderista[] {
  const porNombre = new Map<string, ReporteVisitaRow[]>();
  for (const v of visitas) {
    const lista = porNombre.get(v.mercaderista);
    if (lista) lista.push(v);
    else porNombre.set(v.mercaderista, [v]);
  }

  return Array.from(porNombre.entries())
    .map(([mercaderista, suyas]) => ({
      mercaderista,
      ultimaVisita: suyas.reduce((max, v) => (v.fecha > max ? v.fecha : max), suyas[0].fecha),
      ...resumirEjecucion(suyas),
    }))
    .sort((a, b) => b.visitas - a.visitas || a.mercaderista.localeCompare(b.mercaderista, "es"));
}

// ── Filtrado (lo que ve la tarjeta) ──────────────────────────────

/**
 * PDV con su recorte del período: la última visita DENTRO del rango de fechas
 * y del mercaderista elegidos, no la última absoluta. Sin filtros activos
 * coincide con `ultima`.
 */
export interface PdvConPeriodo extends ReportePdvRow {
  visitasPeriodo: ReporteVisitaRow[];
  ultimaPeriodo: ReporteVisitaRow | null;
  estadoPeriodo: EstadoPdv;
}

export interface FiltroReporte {
  /** "TOTAL" = las dos ciudades piloto. */
  sector: "TOTAL" | ReportePdvRow["sector"];
  mercaderista: string | null;
  /** "YYYY-MM-DD" inclusive; null = sin límite. */
  desde: string | null;
  hasta: string | null;
  estado: EstadoPdv | "TODOS";
  /** Texto libre: código SAP o nombre del cliente. */
  busqueda: string;
  /** Los "Fuera de cartera" quedan fuera por defecto (no son población). */
  incluirFueraDeCartera: boolean;
}

/**
 * Aplica los filtros y recalcula el período de cada PDV.
 *
 * El filtro de ESTADO sale aparte, en `visibles`: es un "muéstrame solo estos"
 * de la lista de PDV, no un recorte del universo. Si entrara en `filas`, pedir
 * "no visitados" dejaría la cobertura en 0% y el corte por mercaderista vacío.
 * Los indicadores globales se calculan con `filas` y `visitasPeriodo`; la
 * tabla, con `visibles`.
 *
 * `filas` y `visibles` vienen ordenadas con los no visitados primero (son la
 * acción pendiente) y el resto por visita más reciente.
 */
export function filtrarReporte(
  pdv: readonly ReportePdvRow[],
  visitas: readonly ReporteVisitaRow[],
  filtro: FiltroReporte
): { filas: PdvConPeriodo[]; visibles: PdvConPeriodo[]; visitasPeriodo: ReporteVisitaRow[] } {
  const busqueda = filtro.busqueda.trim().toLowerCase();

  const base = pdv.filter((p) => {
    if (filtro.sector !== "TOTAL" && p.sector !== filtro.sector) return false;
    if (!filtro.incluirFueraDeCartera && !p.enCartera) return false;
    if (busqueda && !`${p.sapCode} ${p.cliente}`.toLowerCase().includes(busqueda)) return false;
    return true;
  });
  const idsBase = new Set(base.map((p) => p.locationId));

  const visitasPeriodo = visitas.filter(
    (v) =>
      idsBase.has(v.locationId) &&
      (!filtro.mercaderista || v.mercaderista === filtro.mercaderista) &&
      (!filtro.desde || v.dia >= filtro.desde) &&
      (!filtro.hasta || v.dia <= filtro.hasta)
  );

  const porPdv = new Map<string, ReporteVisitaRow[]>();
  for (const v of visitasPeriodo) {
    const lista = porPdv.get(v.locationId);
    if (lista) lista.push(v);
    else porPdv.set(v.locationId, [v]);
  }

  const filas = base.map((p) => {
    // visitas ya viene de la más reciente a la más vieja y el filtro conserva
    // el orden, así que la primera es la última del período.
    const visitasPdv = porPdv.get(p.locationId) ?? [];
    const ultimaPeriodo = visitasPdv[0] ?? null;
    return {
      ...p,
      visitasPeriodo: visitasPdv,
      ultimaPeriodo,
      estadoPeriodo: (ultimaPeriodo === null
        ? "NO_VISITADO"
        : p.radarKg > 0
          ? "VISITADO_CON_COMPRA"
          : "VISITADO_SIN_COMPRA") as EstadoPdv,
    };
  });

  filas.sort((a, b) => {
    if (!a.ultimaPeriodo && !b.ultimaPeriodo) return a.cliente.localeCompare(b.cliente, "es");
    if (!a.ultimaPeriodo) return -1;
    if (!b.ultimaPeriodo) return 1;
    return b.ultimaPeriodo.fecha.localeCompare(a.ultimaPeriodo.fecha);
  });

  return {
    filas,
    visibles: filtro.estado === "TODOS" ? filas : filas.filter((f) => f.estadoPeriodo === filtro.estado),
    visitasPeriodo,
  };
}
