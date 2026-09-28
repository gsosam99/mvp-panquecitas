// Ciudades completas — ratios aparte del piloto (DIENN, 24-09-2026).
// Empezó con Barquisimeto; Cumaná y la suma de las dos usan el mismo cálculo.
//
// Toma la Harina PAN de 3 meses de TODA la ciudad (reporte Radar
// N7_V_SD88_WEB_001, tabla bqto_3m_ventas) y responde:
//   1. cuánto se vendió en los 3 meses, por mes y por día;
//   2. cuánto es el 4% de eso al mes y en 4 meses, para todos los clientes y
//      solo para los segmentos foco;
//   3. cuánto volumen daría activar la ciudad completa con el perfil de hoy
//      del piloto POR TIPO DE CLIENTE (activación y kg por cliente de cada
//      tipo), y cómo queda contra ese 4%, con y sin los clientes gigantes.
//
// Puro, sin dependencias de servidor, igual que segmentos.ts: el cálculo se
// puede auditar y reutilizar sin Supabase.

import { DIAS_HABILES_3M } from "@/lib/business-days";
import { foldSegmento } from "@/lib/segmentos";
import type { Sector } from "@/lib/sectors";

/**
 * Ciudades con reporte "completo" (toda la ciudad, no solo la cartera). Cada
 * una se proyecta con la activación del piloto total y, si tiene un sector
 * piloto propio, también con la de ese sector (Barquisimeto con Cabudare,
 * Cumaná con Cumaná). Guanare, Maracay, Barcelona y Acarigua no tienen sector
 * piloto: solo el piloto total (DIENN, 25-09-2026).
 */
export const CIUDADES_COMPLETAS: Record<CiudadCompleta, { nombre: string; sector: Sector | null }> = {
  barquisimeto: { nombre: "Barquisimeto", sector: "barquisimeto_este" },
  guanare: { nombre: "Guanare", sector: null },
  maracay: { nombre: "Maracay", sector: null },
  barcelona: { nombre: "Barcelona", sector: null },
  acarigua: { nombre: "Acarigua", sector: null },
  cumana: { nombre: "Cumaná", sector: "cumana" },
};

export type CiudadCompleta = "barquisimeto" | "guanare" | "maracay" | "barcelona" | "acarigua" | "cumana";

/** Todas, en el orden de las pestañas. */
export const CIUDADES: CiudadCompleta[] = ["barquisimeto", "guanare", "maracay", "barcelona", "acarigua", "cumana"];

/**
 * La combinación siempre es Cumaná + una zona variable (DIENN, 25-09-2026):
 * Cumaná queda fija y la otra se elige entre estas.
 */
export const CIUDAD_FIJA: CiudadCompleta = "cumana";
export const ZONAS_VARIABLES: CiudadCompleta[] = CIUDADES.filter((c) => c !== CIUDAD_FIJA);

export function esCiudadCompleta(valor: unknown): valor is CiudadCompleta {
  return typeof valor === "string" && (CIUDADES as string[]).includes(valor);
}

/** Meta de Panquecitas: 4% del volumen de Harina PAN (la misma del dashboard). */
export const META_PCT = 0.04;

/** Horizonte de la proyección, en meses. */
export const MESES_PROYECCION = 4;

/**
 * Días hábiles de un mes: los 63 del período de referencia de 3 meses entre 3.
 * Convierte el ritmo diario de Panquecitas del piloto en un volumen mensual
 * comparable con el promedio mensual de Barquisimeto.
 */
export const DIAS_HABILES_MES = DIAS_HABILES_3M / 3;

/**
 * Tipos de cliente que NO son segmento foco en Barquisimeto completo.
 *
 * El dashboard define "foco" con el "Segmento de Clientes 2" de la cartera
 * (SEGMENTOS_SIN_ALIMENTOS), pero el reporte de Barquisimeto completo solo
 * trae "Tipo de Cliente" (el giro). Esta lista es su equivalente por giro
 * (decisión con DIENN, 24-09-2026): licorerías, farmacias y perfumerías,
 * mascotas y agropecuarias. Los "CS" del segmento no tienen un giro propio y
 * no se pueden separar desde este archivo.
 *
 * Revisado el 27-09-2026 contra el Radar de Panquecitas del piloto: las
 * licorerías sí compran (5.º tipo en kg), pero DIENN decidió dejarlas fuera
 * de foco igual.
 */
export const TIPOS_NO_FOCO = [
  "LICOR/FRIAXCAJA/DEPO",
  "FARMACIAS",
  "PERFUMERIAS",
  "TIENDA MASC/PETSHOP",
  "DET ABA-AGROPECUARIA",
  "DISTR. ABA - PETFOOD",
] as const;

const TIPOS_NO_FOCO_FOLDED = new Set(TIPOS_NO_FOCO.map(foldSegmento));

/** ¿Este tipo de cliente es segmento foco? Sin tipo cuenta como foco, igual que en la cartera. */
export function esTipoFoco(tipo: string | null | undefined): boolean {
  return !TIPOS_NO_FOCO_FOLDED.has(foldSegmento(tipo));
}

/** Una fila del reporte tal como se guarda: cliente + material + día. */
export interface BqtoFila {
  ciudad: string;
  sap_code: string;
  client_name?: string | null;
  tipo_cliente: string | null;
  quantity_kg: number;
  date_of_sale: string;
}

export interface BqtoTipoRow {
  tipo: string;
  clientes: number;
  kg: number;
  foco: boolean;
}

export interface BqtoResumen {
  /** Σ de todas las filas (devoluciones restan). */
  totalKg: number;
  totalFocoKg: number;
  porMes: { mes: string; kg: number }[];
  meses: number;
  /** Días distintos con venta en el archivo: el divisor del promedio diario. */
  dias: number;
  desde: string;
  hasta: string;
  /** Clientes con venta neta > 0. */
  clientes: number;
  clientesFoco: number;
  promedioMesKg: number;
  promedioMesFocoKg: number;
  promedioDiaKg: number;
  porTipo: BqtoTipoRow[];
  /** Cada cliente con venta neta > 0, con su Harina PAN mensual: base de la proyección por tipo. */
  porCliente: ClienteZona[];
}

/** Un cliente de la zona, como entra a la proyección. */
export interface ClienteZona {
  ciudad: string;
  sap_code: string;
  nombre: string;
  tipo: string;
  foco: boolean;
  /** Harina PAN de los 3 meses (neta). */
  kg: number;
  /** kg ÷ meses del archivo de su ciudad. */
  panMes: number;
}

export const SIN_TIPO = "Sin tipo";

export function resumenBqto(filas: BqtoFila[]): BqtoResumen | null {
  if (filas.length === 0) return null;

  const porCliente = new Map<string, { ciudad: string; sap_code: string; nombre: string; kg: number; tipo: string }>();
  const porMes = new Map<string, number>();
  const dias = new Set<string>();
  let totalKg = 0;

  for (const f of filas) {
    const kg = Number(f.quantity_kg) || 0;
    const dia = f.date_of_sale.slice(0, 10);
    totalKg += kg;
    dias.add(dia);
    porMes.set(dia.slice(0, 7), (porMes.get(dia.slice(0, 7)) ?? 0) + kg);
    // Llave con la ciudad: en la vista combinada un mismo código de dos
    // ciudades no se funde en un solo cliente.
    const llave = `${f.ciudad}|${f.sap_code}`;
    const c = porCliente.get(llave);
    if (c) {
      c.kg += kg;
      if (!c.nombre && f.client_name) c.nombre = f.client_name.trim();
    } else {
      porCliente.set(llave, {
        ciudad: f.ciudad,
        sap_code: f.sap_code,
        nombre: f.client_name?.trim() ?? "",
        kg,
        tipo: f.tipo_cliente?.trim() || SIN_TIPO,
      });
    }
  }

  // El corte foco se hace por CLIENTE (su tipo), no por fila: así kg y
  // clientes de un mismo tipo siempre caen del mismo lado.
  const porTipo = new Map<string, BqtoTipoRow>();
  let totalFocoKg = 0;
  let clientes = 0;
  let clientesFoco = 0;
  for (const { kg, tipo } of porCliente.values()) {
    const foco = esTipoFoco(tipo === SIN_TIPO ? null : tipo);
    let fila = porTipo.get(tipo);
    if (!fila) {
      fila = { tipo, clientes: 0, kg: 0, foco };
      porTipo.set(tipo, fila);
    }
    fila.kg += kg;
    if (foco) totalFocoKg += kg;
    if (kg > 0) {
      fila.clientes += 1;
      clientes += 1;
      if (foco) clientesFoco += 1;
    }
  }

  const diasOrdenados = [...dias].sort();
  const meses = Math.max(1, porMes.size);
  const clientesZona: ClienteZona[] = [...porCliente.values()]
    .filter((c) => c.kg > 0)
    .map((c) => ({
      ciudad: c.ciudad,
      sap_code: c.sap_code,
      nombre: c.nombre || c.sap_code,
      tipo: c.tipo,
      foco: esTipoFoco(c.tipo === SIN_TIPO ? null : c.tipo),
      kg: c.kg,
      panMes: c.kg / meses,
    }));
  return {
    totalKg,
    totalFocoKg,
    porMes: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, kg]) => ({ mes, kg })),
    meses,
    dias: dias.size,
    desde: diasOrdenados[0],
    hasta: diasOrdenados[diasOrdenados.length - 1],
    clientes,
    clientesFoco,
    promedioMesKg: totalKg / meses,
    promedioMesFocoKg: totalFocoKg / meses,
    promedioDiaKg: totalKg / Math.max(1, dias.size),
    porTipo: [...porTipo.values()].sort((a, b) => b.kg - a.kg),
    porCliente: clientesZona,
  };
}

/**
 * Resumen de varias ciudades juntas. Totales y clientes son la suma de todas
 * las filas; los PROMEDIOS mensual y diario son la suma de los promedios de
 * cada ciudad. Si los archivos no cubren los mismos meses, dividir el total
 * combinado entre la unión de meses daría un promedio por debajo del real.
 */
export function resumenCombinado(filasPorCiudad: BqtoFila[][]): BqtoResumen | null {
  const conDatos = filasPorCiudad.filter((f) => f.length > 0);
  const combinado = resumenBqto(conDatos.flat());
  if (!combinado) return null;
  const partes = conDatos.map(resumenBqto).filter((r): r is BqtoResumen => r !== null);
  const suma = (f: (r: BqtoResumen) => number) => partes.reduce((s, r) => s + f(r), 0);
  return {
    ...combinado,
    promedioMesKg: suma((r) => r.promedioMesKg),
    promedioMesFocoKg: suma((r) => r.promedioMesFocoKg),
    promedioDiaKg: suma((r) => r.promedioDiaKg),
    // Cada cliente con el panMes de SU ciudad, por el mismo motivo.
    porCliente: partes.flatMap((r) => r.porCliente),
  };
}

/** La activación de una ciudad (o del piloto entero) que se usa como referencia. */
export interface ReferenciaActivacion {
  etiqueta: string;
  /** Cartera vigente hoy. */
  cartera: number;
  /** Clientes con Radar de Panquecitas > 0. */
  activos: number;
  /** activos ÷ cartera — la activación de la tarjeta del dashboard. */
  activacionPct: number;
  /** Cartera sin los inactivos de segmentos no vendibles. */
  carteraFoco: number;
  /** activos ÷ carteraFoco — la activación "a escala" (segmentos foco). */
  activacionFocoPct: number;
  /** Radar de Panquecitas de esos activos. */
  kgActivos: number;
  /** Σ de meses hábiles de cada activo desde su primera compra hasta el último Radar. */
  mesesCliente: number;
  /** kgActivos ÷ mesesCliente. */
  kgPorActivoMes: number;
  /** Último día con Radar de Panquecitas. */
  corte: string | null;
  /** El mismo perfil, por tipo de cliente (llave: foldSegmento del tipo). */
  porTipo: Record<string, PerfilTipo>;
}

/** Cómo se comporta un tipo de cliente en la cartera del piloto. */
export interface PerfilTipo {
  /** Clientes de ese tipo en la cartera vigente. */
  cartera: number;
  /** De ellos, con Radar de Panquecitas > 0. */
  activos: number;
  /** Radar de Panquecitas de esos activos. */
  kgActivos: number;
  /** Σ de meses hábiles de cada activo desde su primera compra hasta el último Radar. */
  mesesCliente: number;
}

export interface EscenarioProyeccion {
  clientesBase: number;
  activacionPct: number;
  clientesActivados: number;
  kgMes: number;
  kgPeriodo: number;
  metaMes: number;
  metaPeriodo: number;
  /** kgMes ÷ metaMes × 100. */
  pctMeta: number;
}

/** Una fila del detalle de la proyección: un tipo de cliente de la zona. */
export interface FilaTipoProyeccion {
  tipo: string;
  /** Clientes de la zona de este tipo. */
  clientes: number;
  panMes: number;
  metaMes: number;
  /** false = el tipo no existe en la cartera del piloto: no hay perfil y proyecta 0. */
  conPerfil: boolean;
  carteraPiloto: number;
  activosPiloto: number;
  /** activos ÷ cartera del tipo en el piloto. */
  activacionPct: number;
  /** kg de Panquecitas al mes de un cliente activo de este tipo en el piloto. */
  kgPorActivoMes: number;
  activados: number;
  kgMes: number;
}

/**
 * Proyección POR TIPO DE CLIENTE (DIENN, 27-09-2026): cada tipo de la zona se
 * activa y compra igual que ese mismo tipo en el piloto.
 *
 *   volumen del tipo = clientes de la zona del tipo
 *                      × activación del tipo en el piloto
 *                      × kg de Panquecitas por cliente activo al mes del tipo
 *
 * Antes era un solo promedio para todos los clientes, y como el piloto está
 * dominado por clientes Indirectos chicos, un hipermercado proyectaba lo mismo
 * que una bodega. Un tipo que no está en la cartera del piloto no tiene perfil
 * y proyecta 0 (se marca en el detalle).
 *
 * La meta es el 4% de la Harina PAN mensual de los mismos clientes.
 */
export function proyeccionPorTipo(
  clientes: ClienteZona[],
  ref: ReferenciaActivacion
): { e: EscenarioProyeccion; filas: FilaTipoProyeccion[] } {
  const grupos = new Map<string, { clientes: number; panMes: number }>();
  for (const c of clientes) {
    const g = grupos.get(c.tipo) ?? { clientes: 0, panMes: 0 };
    g.clientes += 1;
    g.panMes += c.panMes;
    grupos.set(c.tipo, g);
  }

  const filas: FilaTipoProyeccion[] = [...grupos.entries()].map(([tipo, g]) => {
    const perfil = ref.porTipo[foldSegmento(tipo)];
    const activacion = perfil && perfil.cartera > 0 ? perfil.activos / perfil.cartera : 0;
    const kgPorActivoMes = perfil && perfil.mesesCliente > 0 ? perfil.kgActivos / perfil.mesesCliente : 0;
    const activados = g.clientes * activacion;
    return {
      tipo,
      clientes: g.clientes,
      panMes: g.panMes,
      metaMes: g.panMes * META_PCT,
      conPerfil: !!perfil && perfil.cartera > 0,
      carteraPiloto: perfil?.cartera ?? 0,
      activosPiloto: perfil?.activos ?? 0,
      activacionPct: activacion * 100,
      kgPorActivoMes,
      activados,
      kgMes: activados * kgPorActivoMes,
    };
  });
  filas.sort((a, b) => b.metaMes - a.metaMes);

  const suma = (f: (x: FilaTipoProyeccion) => number) => filas.reduce((s, x) => s + f(x), 0);
  const clientesBase = suma((x) => x.clientes);
  const activados = suma((x) => x.activados);
  const kgMes = suma((x) => x.kgMes);
  const metaMes = suma((x) => x.metaMes);
  return {
    e: {
      clientesBase,
      activacionPct: clientesBase > 0 ? (activados / clientesBase) * 100 : 0,
      clientesActivados: Math.round(activados),
      kgMes,
      kgPeriodo: kgMes * MESES_PROYECCION,
      metaMes,
      metaPeriodo: metaMes * MESES_PROYECCION,
      pctMeta: metaMes > 0 ? (kgMes / metaMes) * 100 : 0,
    },
    filas,
  };
}

/**
 * ¿Cliente "gigante"? Compra más Harina PAN al mes que el mayor cliente de la
 * cartera del piloto en un mes: no hay nadie en el piloto con quien compararlo.
 * Se muestran aparte para ver cuánto pesan en la meta (p. ej. CECOSESOLA, 54%
 * de la Harina PAN de Barquisimeto).
 */
export function esGigante(c: ClienteZona, umbralGiganteMes: number): boolean {
  return umbralGiganteMes > 0 && c.panMes > umbralGiganteMes;
}

/**
 * Suma de escenarios de varias ciudades (cada una con su propia activación).
 * La activación que devuelve es la EFECTIVA: activados ÷ clientes de todas.
 */
export function sumarEscenarios(escenarios: EscenarioProyeccion[]): EscenarioProyeccion {
  const suma = (f: (e: EscenarioProyeccion) => number) => escenarios.reduce((s, e) => s + f(e), 0);
  const clientesBase = suma((e) => e.clientesBase);
  const clientesActivados = suma((e) => e.clientesActivados);
  const kgMes = suma((e) => e.kgMes);
  const metaMes = suma((e) => e.metaMes);
  return {
    clientesBase,
    activacionPct: clientesBase > 0 ? (clientesActivados / clientesBase) * 100 : 0,
    clientesActivados,
    kgMes,
    kgPeriodo: kgMes * MESES_PROYECCION,
    metaMes,
    metaPeriodo: metaMes * MESES_PROYECCION,
    pctMeta: metaMes > 0 ? (kgMes / metaMes) * 100 : 0,
  };
}
