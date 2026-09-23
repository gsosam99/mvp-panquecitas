"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ExportExcelButton, ExportExcelMultiButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelColumn, ExcelChartConfig, ExcelSheetSpec } from "@/lib/export-excel";
import { ReportPrintButton } from "@/components/dashboard/ReportPrintButton";
import { ReportPrintHeader } from "@/components/dashboard/ReportPrintHeader";
import { DemandaInsatisfechaChart } from "@/components/dashboard/DemandaInsatisfechaChart";
import { VentaRecompraActivacionChart } from "@/components/dashboard/VentaRecompraActivacionChart";
import { PosicionPdvChart } from "@/components/dashboard/PosicionPdvChart";
import { SellOutPorPosicionChart } from "@/components/dashboard/SellOutPorPosicionChart";
import { CarteraTotalDiaChart, type CarteraTotalDiaChartPoint } from "@/components/dashboard/CarteraTotalDiaChart";
import {
  PanVsHarinaPanChart,
  type PanVsHarinaPanChartPoint,
} from "@/components/dashboard/PanVsHarinaPanChart";
import { SellOutResumenChart } from "@/components/dashboard/SellOutResumenChart";
import { PrecioCorrectoChart } from "@/components/dashboard/PrecioCorrectoChart";
import { RankingSegmentoChart } from "@/components/dashboard/RankingSegmentoChart";
import {
  Rendimiento3MChart,
  type Rendimiento3MRatioCiudad,
} from "@/components/dashboard/Rendimiento3MChart";
import {
  RendimientoVsMavesaChart,
  type RendimientoVsMavesaRatioCiudad,
} from "@/components/dashboard/RendimientoVsMavesaChart";
import { Ventas3MesesPorCiudadChart } from "@/components/dashboard/Ventas3MesesPorCiudadChart";
import { ClientesInactivosSegmentos } from "@/components/dashboard/ClientesInactivosSegmentos";
import {
  VentaDiariaPorSegmentoChart,
  type VentaSegmentoPunto,
} from "@/components/dashboard/VentaDiariaPorSegmentoChart";
import { CombinacionesPilotoTabla } from "@/components/dashboard/CombinacionesPilotoTabla";
import { TandasClientesTabla } from "@/components/dashboard/TandasClientesTabla";
import { CombinacionesParticipacionCharts } from "@/components/dashboard/CombinacionesParticipacionCharts";
import { CruceMercaderistaRadar } from "@/components/dashboard/CruceMercaderistaRadar";
import { ReporteMercaderistas } from "@/components/dashboard/ReporteMercaderistas";
import type { CruceInventarioRadarResult } from "@/lib/cruce-mercaderista-radar";
import type { ReporteMercaderistasResult } from "@/lib/reporte-mercaderistas";
import { ClientesSinRecompra } from "@/components/dashboard/ClientesSinRecompra";
import type { ClientesSinRecompraResult } from "@/lib/clientes-sin-recompra-utils";
import { Impacto400g } from "@/components/dashboard/Impacto400g";
import type { Impacto400gResult } from "@/lib/impacto-400g-utils";
import { resumirRotacion } from "@/lib/rotacion-utils";
import { FiltroFechas } from "@/components/dashboard/FiltroFechas";
import { siguienteDiaHabil } from "@/lib/business-days";
import { PILOTO_INICIO } from "@/lib/cohortes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  filterSellOutClientes,
  type SellOutClienteDiffRow,
} from "@/lib/sellout-utils";
import type {
  CoberturaComunicacionPoint,
  DemandaInsatisfechaPoint,
  DetalleSegmentoRow,
  MixProductoTonPoint,
  PanComparisonGranularity,
  PanComparisonPoblacion,
  PanVsHarinaPanPoint,
  PenetracionRadarVsHpm,
  PosicionPdvPoint,
  PosicionClienteRow,
  CarteraSegmentoResult,
  CarteraTotalDiaPunto,
  PrecioCorrectoRow,
  Pan3MPoblacion,
  RankingSegmentoRow,
  Rendimiento3MResult,
  MaterialPopPreciadorResult,
  RunningVentasResult,
  RecompraFranquiciadosResult,
  StockOutClientePoint,
  StockOutResult,
  TimeGranularity,
  VentaRecompraActivacionPoint,
  VolumenRadarAcumulado,
  ActivacionAjustadaResult,
  AlcanceCartera,
  SegmentoRecompra,
  BasePan,
  SeriePanq,
} from "@/lib/dienn-queries";
import type { MotivoNoVentaRow } from "@/lib/efectividad-queries";
import type { Sector } from "@/lib/sectors";
import type {
  MavesaCategoria,
  RendimientoVsMavesaResult,
  PortafolioPorCiudadRow,
  Ventas3MesesRow,
  VentaPorSegmentoResult,
  CombinacionesResult,
  CombinacionesTanda,
} from "@/lib/mavesa-queries";

export interface SectorBundle {
  /** Volumen FACTURADO — exclusivo de Pedidos y Facturado (Cantidad Facturada). */
  totalToneladas: number;
  /** Volumen PEDIDO — exclusivo de Pedidos y Facturado (Cantidad Pedido), mismo universo que totalToneladas. */
  totalToneladasPedidas: number;
  /** Volumen FACTURADO total (Cantidad Facturada cruda, sin filtrar por presentación). */
  totalFacturadoToneladas: number;
  /** Toneladas reales despachadas/confirmadas según "Carga Radar", por producto. No se mezcla con las dos anteriores. */
  volumenRadarAcumulado: VolumenRadarAcumulado;
  /** Toneladas facturadas SAP por presentación (400g / 800g), desde Pedidos y Facturado. */
  mixProducto: MixProductoTonPoint[];
  /** Pedido / Facturado / Radar de Panquecitas acumulados en el tiempo, para ver la demanda insatisfecha. */
  demandaInsatisfecha: Record<TimeGranularity, DemandaInsatisfechaPoint[]>;
  /** Panquecitas vs Harina PAN, AMBOS desde Carga Radar (misma fuente para que sean comparables). */
  panVsHarinaPan: Record<PanComparisonPoblacion, Record<PanComparisonGranularity, PanVsHarinaPanPoint[]>>;
  runningVentas: RunningVentasResult;
  /** Recompra de las franquiciadas (≥2 fechas de facturación), desde Pedidos y Facturado. */
  recompraFranquiciados: RecompraFranquiciadosResult;
  /** Venta acumulada (Radar) + tasa de recompra + % activación de clientes, por día/semana/mes. */
  ventaRecompraActivacion: Record<TimeGranularity, VentaRecompraActivacionPoint[]>;
  /** Comparativa de penetración Radar Panquecitas vs. HPM sobre la lista objetivo. */
  penetracionRadarVsHpm: PenetracionRadarVsHpm;
  /** Clientes con venta y pocas unidades en tienda (≤3 directo / ≤2 indirecto), con su ubicación. */
  stockOut: StockOutResult;
  /** Ratio de preciador sobre clientes visitados con ventas en SAP (Radar > 0). */
  materialPopPreciador: MaterialPopPreciadorResult;
  /** Distribución de la posición del producto en el PDV (encuestas). */
  posicionPdv: PosicionPdvPoint[];
  detalleSegmentos: DetalleSegmentoRow[];
  /** Ranking de volumen de Panquecitas por "Segmento de Clientes 2" de la cartera. */
  rankingSegmentos: RankingSegmentoRow[];
  /** Rendimiento diario vs. promedio histórico 3M de Harina PAN, por población. */
  rendimiento3M: Record<Pan3MPoblacion, Rendimiento3MResult>;
  /** Rendimiento diario vs. promedio 3M por grupo de clientes (cartera × segmento × compra): sus Panquecitas vs. su PAN. */
  rendimiento3MFocoRecompra: Record<AlcanceCartera, Record<SegmentoRecompra, Record<BasePan, Record<SeriePanq, Rendimiento3MResult>>>>;
  /** Rendimiento diario de Panquecitas vs. promedio histórico de Margarina/Mayonesa (Mavesa), por categoría. */
  rendimientoVsMavesa: Record<MavesaCategoria, RendimientoVsMavesaResult>;
  /** Los mismos ratios sin la tanda "Indirecto Cumaná 2" (ampliación de franquiciados, 08-09). */
  ratiosSinAmpliacion: {
    rendimiento3MUniverso: Rendimiento3MResult;
    rendimiento3MFocoRecompra: SectorBundle["rendimiento3MFocoRecompra"];
    rendimientoVsMavesa: Record<MavesaCategoria, RendimientoVsMavesaResult>;
  };
  /** Conversión de degustaciones (tickets recibidos ÷ entregados) de la ciudad/sector. */
  conversionDegustaciones: { samples: number; conversions: number; rate: number };
  /** Inactivos por segmento, cuántos venden PAN, y la activación sin los PDV no alcanzables. */
  activacionAjustada: ActivacionAjustadaResult;
}

const PAN_POBLACION_OPTIONS: { key: PanComparisonPoblacion; label: string }[] = [
  { key: "clientes", label: "PAN Clientes" },
  { key: "universo", label: "PAN Universo" },
];

const PAN_GRANULARITY_OPTIONS: { key: PanComparisonGranularity; label: string }[] = [
  { key: "day", label: "Día" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "quarter", label: "3 Meses" },
];

type FilterKey = "TOTAL" | Sector;
type FuenteFilter = "TODOS" | "Calculado" | "Reportado_B2B";

const GRANULARITY_OPTIONS: { key: TimeGranularity; label: string }[] = [
  { key: "day", label: "Día" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
];

// ── Export a Excel de los gráficos de efectividad (columnas + gráfico nativo) ──
// Fuente única, usada por los 3 botones individuales y por el botón combinado.
// El gráfico global lleva columnas de conteo (Activos/Facturados/Pedidos) que
// los de sector omiten, por eso los índices de series difieren.
const TOTAL_ACUM_COLUMNS: ExcelColumn<CarteraTotalDiaPunto>[] = [
  { header: "Período", value: (r) => r.dia, width: 16 },
  { header: "Radar por período (kg)", value: (r) => r.radarKgDia, width: 20 },
  { header: "A visitar", value: (r) => r.programados, width: 12 },
  { header: "Activos", value: (r) => r.activos, width: 12 },
  { header: "% Efect. activos", value: (r) => r.efectividadActivos, width: 16 },
  { header: "Facturados", value: (r) => r.facturados, width: 12 },
  { header: "% Efect. facturados", value: (r) => r.efectividadFacturados, width: 18 },
  { header: "Pedidos", value: (r) => r.pedidos, width: 12 },
  { header: "% Efect. pedidos", value: (r) => r.efectividadPedidos, width: 16 },
  { header: "% Activación Directo", value: (r) => r.efectividadDirecto, width: 18 },
  { header: "% Activación Indirecto", value: (r) => r.efectividadIndirecto, width: 20 },
  { header: "% Acum. activos", value: (r) => r.efectividadActivosAcum, width: 16 },
  { header: "% Acum. facturados", value: (r) => r.efectividadFacturadosAcum, width: 18 },
  { header: "% Acum. pedidos", value: (r) => r.efectividadPedidosAcum, width: 16 },
  { header: "% Acum. Directo", value: (r) => r.efectividadDirectoAcum, width: 16 },
  { header: "% Acum. Indirecto", value: (r) => r.efectividadIndirectoAcum, width: 18 },
  { header: "Radar Directo (kg)", value: (r) => r.radarKgDiaDirecto, width: 18 },
  { header: "Radar Indirecto (kg)", value: (r) => r.radarKgDiaIndirecto, width: 20 },
  { header: "% Acum. aterrizado (cartera de hoy)", value: (r) => r.efectividadActivosAcumAterrizada, width: 30 },
  { header: "% Acum. aterrizado a escala (sin no vendibles)", value: (r) => r.efectividadActivosAcumAterrizadaVendible, width: 34 },
  { header: "% Acum. Directo aterrizado", value: (r) => r.efectividadDirectoAcumAterrizada, width: 24 },
  { header: "% Acum. Indirecto aterrizado", value: (r) => r.efectividadIndirectoAcumAterrizada, width: 26 },
  { header: "% Acum. Directo aterrizado a escala", value: (r) => r.efectividadDirectoAcumAterrizadaVendible, width: 32 },
  { header: "% Acum. Indirecto aterrizado a escala", value: (r) => r.efectividadIndirectoAcumAterrizadaVendible, width: 34 },
];
const TOTAL_ACUM_CHART: ExcelChartConfig = {
  categoryCol: 0,
  title: "Total acumulado — Radar (kg) y efectividad (%)",
  series: [
    { col: 1, type: "bar" },
    { col: 4, type: "line" },
    { col: 9, type: "line" },
    { col: 10, type: "line" },
  ],
};
const SECTOR_ACUM_COLUMNS: ExcelColumn<CarteraTotalDiaPunto>[] = [
  { header: "Período", value: (r) => r.dia, width: 16 },
  { header: "Radar por período (kg)", value: (r) => r.radarKgDia, width: 20 },
  { header: "A visitar", value: (r) => r.programados, width: 12 },
  { header: "% Efect. activos", value: (r) => r.efectividadActivos, width: 16 },
  { header: "% Efect. facturados", value: (r) => r.efectividadFacturados, width: 18 },
  { header: "% Efect. pedidos", value: (r) => r.efectividadPedidos, width: 16 },
  { header: "% Activación Directo", value: (r) => r.efectividadDirecto, width: 18 },
  { header: "% Activación Indirecto", value: (r) => r.efectividadIndirecto, width: 20 },
  { header: "% Acum. activos", value: (r) => r.efectividadActivosAcum, width: 16 },
  { header: "% Acum. facturados", value: (r) => r.efectividadFacturadosAcum, width: 18 },
  { header: "% Acum. pedidos", value: (r) => r.efectividadPedidosAcum, width: 16 },
  { header: "% Acum. Directo", value: (r) => r.efectividadDirectoAcum, width: 16 },
  { header: "% Acum. Indirecto", value: (r) => r.efectividadIndirectoAcum, width: 18 },
  { header: "Radar Directo (kg)", value: (r) => r.radarKgDiaDirecto, width: 18 },
  { header: "Radar Indirecto (kg)", value: (r) => r.radarKgDiaIndirecto, width: 20 },
];

// ── Filtro global de fechas (FiltroFechas) ─────────────────────────
// null = todas las fechas. Solo recorta puntos DIARIOS: una clave de semana,
// mes o trimestre pasa igual, así que con otra granularidad el gráfico no cambia.
type DiasFiltro = ReadonlySet<string> | null;
const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;

function filtrarPorDias<T>(puntos: T[], clave: (p: T) => string, dias: DiasFiltro): T[] {
  if (dias === null) return puntos;
  return puntos.filter((p) => {
    const k = clave(p);
    // Una venta de fin de semana se lee en el lunes siguiente, igual que en
    // las series de rendimiento: el filtro solo ofrece días hábiles.
    return !ES_DIA.test(k) || dias.has(siguienteDiaHabil(k));
  });
}

/** Mismo resultado de rendimiento, con solo los días elegidos (el ratio acumulado se recalcula con ellos). */
function conDias<R extends { puntos: { dia: string }[] }>(r: R, dias: DiasFiltro): R {
  if (dias === null) return r;
  return { ...r, puntos: r.puntos.filter((p) => dias.has(p.dia)) };
}

/**
 * De dónde salen los gráficos de ratios: la cartera vigente o la misma sin la
 * ampliación de franquiciados de Cumaná ("Indirecto Cumaná 2", 08-09-2026).
 */
function fuenteRatios(b: SectorBundle, sinAmpliacion: boolean) {
  return sinAmpliacion
    ? {
        universo3M: b.ratiosSinAmpliacion.rendimiento3MUniverso,
        focoRec: b.ratiosSinAmpliacion.rendimiento3MFocoRecompra,
        mavesa: b.ratiosSinAmpliacion.rendimientoVsMavesa,
      }
    : { universo3M: b.rendimiento3M.universo, focoRec: b.rendimiento3MFocoRecompra, mavesa: b.rendimientoVsMavesa };
}

const sectorAcumChart = (label: string): ExcelChartConfig => ({
  categoryCol: 0,
  title: `Total acumulado ${label} — Radar (kg) y efectividad (%)`,
  series: [
    { col: 1, type: "bar" },
    { col: 3, type: "line" },
    { col: 6, type: "line" },
    { col: 7, type: "line" },
  ],
});

// Espejo del umbral de backend (getStockOut) — dienn-queries es server-only y no
// puede importarse como valor en este Client Component; solo para mostrar el texto.
const STOCK_OUT_UMBRAL_DIENN = 3;
const STOCK_OUT_UMBRAL_INDIRECTO = 2;

interface Props {
  bundles: Record<FilterKey, SectorBundle>;
  coberturaComunicacion: Record<TimeGranularity, CoberturaComunicacionPoint[]>;
  tiendaIdeal: { pct: number; cumplen: number; total: number };
  sectorLabels: Record<Sector, string>;
  pilotSectors: readonly Sector[];
  sellOutClientes: SellOutClienteDiffRow[];
  zonas: string[];
  asesores: string[];
  /** Motivos de no venta clasificados (reporte SAP de Efectividad de Visita). Globales, no por sector. */
  motivosNoVenta: MotivoNoVentaRow[];
  /** Posición en PDV por cliente (última visita), para cruzar con el Sell-Out. Global; se acota vía el Sell-Out filtrado. */
  posicionPorCliente: PosicionClienteRow[];
  /** Cartera por ciudad × modelo (volumen Radar + efectividad por plan de visita), por segmento y total por día. Global. */
  carteraPorSegmento: CarteraSegmentoResult;
  /** Precio correcto: PVP capturado en campo vs objetivo por ciudad (una fila por PDV×presentación evaluable). Global. */
  precioCorrecto: PrecioCorrectoRow[];
  /** Totales acumulados de Panquecitas/Margarina/Mayonesa/Harina PAN por ciudad, hasta la fecha. Global. */
  portafolioPorCiudad: PortafolioPorCiudadRow[];
  /** Margarina/Mayonesa/Harina PAN de los últimos 3 meses (referencia) por ciudad, con Cliente/Universo ya resueltos. Global. */
  ventas3MesesPorCiudad: Ventas3MesesRow[];
  /** Totales por segmento × ciudad de las 4 categorías, para el promedio diario por segmento. Global. */
  ventaDiariaPorSegmento: VentaPorSegmentoResult;
  /** Ratios y volumen por combinación de precio × comunicación del piloto. Global. */
  combinacionesPiloto: CombinacionesResult;
  /** Las mismas combinaciones, solo con la cartera del piloto inicial (tanda "Piloto original"). Global. */
  combinacionesPilotoOriginal: CombinacionesResult;
  /** La misma tabla de combinaciones, una por tanda de incorporación, para el filtro de tandas. Global. */
  tandasClientes: CombinacionesTanda[];
  /** Inventario reportado por mercaderistas vs venta Radar, por PDV. Global; se corta por ciudad en el cliente. */
  cruceMercaderistaRadar: CruceInventarioRadarResult;
  /** Reporte de Mercaderistas: histórico de visitas + una fila por PDV del piloto. Global; se filtra en el cliente. */
  reporteMercaderistas: ReporteMercaderistasResult;
  /** Clientes con 1 sola compra o +2 semanas sin pedir. Global; se corta por ciudad en el cliente. */
  clientesSinRecompra: ClientesSinRecompraResult;
  /** Impacto del bloqueo del 400g (Radar 400g/800g antes y después del 15-09). Global; se corta por ciudad en el cliente. */
  impacto400g: Impacto400gResult;
}

export function DiennDashboardClient({
  bundles,
  tiendaIdeal,
  sectorLabels,
  pilotSectors,
  sellOutClientes,
  zonas,
  asesores,
  posicionPorCliente,
  carteraPorSegmento,
  precioCorrecto,
  ventas3MesesPorCiudad,
  ventaDiariaPorSegmento,
  combinacionesPiloto,
  combinacionesPilotoOriginal,
  tandasClientes,
  cruceMercaderistaRadar,
  reporteMercaderistas,
  clientesSinRecompra,
  impacto400g,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("TOTAL");
  const [zonaFilter, setZonaFilter] = useState("");
  const [asesorFilter, setAsesorFilter] = useState("");
  const [fuenteFilter, setFuenteFilter] = useState<FuenteFilter>("TODOS");
  const [granularity, setGranularity] = useState<TimeGranularity>("week");
  const [comboGranularity, setComboGranularity] = useState<TimeGranularity>("week");
  // Línea opcional de recompra foco (solo segmentos foco) en el gráfico combo.
  const [recompraFocoOn, setRecompraFocoOn] = useState(false);
  const [stockOutOpen, setStockOutOpen] = useState(false);
  // Total acumulado: métrica de efectividad + granularidad + series opcionales por modelo.
  const [carteraMetrica, setCarteraMetrica] = useState<"activos" | "facturados" | "pedidos">("activos");
  const [totalGranularity, setTotalGranularity] = useState<TimeGranularity>("day");
  const [showDirectoTotal, setShowDirectoTotal] = useState(false);
  const [showIndirectoTotal, setShowIndirectoTotal] = useState(false);
  // Vista de las líneas: por período ("día") o acumulada (activos ÷ cartera total).
  // Dos toggles separados: uno para la línea principal, otro para los modelos.
  const [efectividadAcum, setEfectividadAcum] = useState(false);
  const [modeloAcum, setModeloAcum] = useState(false);
  // Barras de volumen Radar del período por modelo: dos toggles independientes.
  // Con ambos apagados se ve el total; al prender uno/ambos, esas barras.
  const [ventasDirecto, setVentasDirecto] = useState(false);
  const [ventasIndirecto, setVentasIndirecto] = useState(false);
  // Mismos toggles pero por CIUDAD (Cumaná / Cabudare): las barras llevan los kg
  // y se distinguen por color (sin texto de ciudad). Independientes de los de modelo.
  const [ventasCumana, setVentasCumana] = useState(false);
  const [ventasCabudare, setVentasCabudare] = useState(false);
  // La línea de efectividad total (Radar / Facturado / Pedidos) se puede apagar
  // para dejar solo las barras y/o las capas por modelo y ciudad.
  const [showEfectividadTotal, setShowEfectividadTotal] = useState(true);
  // Capas de efectividad por ciudad (superpuestas a la total, independientes):
  // una acumulada y otra diaria — se pueden prender ambas, una, o ninguna.
  const [ciudadAcum, setCiudadAcum] = useState(false);
  const [ciudadDia, setCiudadDia] = useState(false);
  // Cuál ciudad se superpone: ambas, solo Cumaná o solo Cabudare.
  const [ciudadSel, setCiudadSel] = useState<"ambas" | "cumana" | "barquisimeto_este">("ambas");
  // Activación "a escala": la acumulada de la ciudad contra la cartera SIN los
  // inactivos de segmentos no vendibles (ver SEGMENTOS_SIN_ALIMENTOS).
  const [escalaCumanaOn, setEscalaCumanaOn] = useState(false);
  const [escalaCabudareOn, setEscalaCabudareOn] = useState(false);
  // Lo mismo para el TOTAL del piloto: activación acumulada contra la cartera
  // de segmentos foco (DIENN, 14-09-2026).
  const [escalaTotalOn, setEscalaTotalOn] = useState(false);
  // Activación "aterrizada": la acumulada de siempre contra la cartera de hoy
  // completa desde el día 1 (sin saltos por ampliación de cartera). Total y por ciudad.
  const [aterrizadaTotalOn, setAterrizadaTotalOn] = useState(false);
  const [aterrizadaCumanaOn, setAterrizadaCumanaOn] = useState(false);
  const [aterrizadaCabudareOn, setAterrizadaCabudareOn] = useState(false);
  // Las aterrizadas con todos los segmentos o "a escala" (sin los inactivos de
  // segmentos no vendibles, como las líneas "a escala").
  const [aterrizadaEscala, setAterrizadaEscala] = useState(false);
  // Aterrizada por modelo (Directo / Indirecto), con el mismo botón de escala.
  const [aterrizadaDirectoOn, setAterrizadaDirectoOn] = useState(false);
  const [aterrizadaIndirectoOn, setAterrizadaIndirectoOn] = useState(false);

  const [sellOutClienteOpen, setSellOutClienteOpen] = useState(false);
  // Posición del producto en PDV: una sola tarjeta, se ve por conteo de clientes
  // ("posicion") o por Sell-Out generado ("sellout").
  const [posicionVista, setPosicionVista] = useState<"posicion" | "sellout">("posicion");
  // Precio Correcto: filtro por ciudad + toggle Vista A (dirección) / B (detalle).
  const [precioVista, setPrecioVista] = useState<"A" | "B">("A");
  const [precioCiudad, setPrecioCiudad] = useState<string>("TODAS");
  const [panPoblacion, setPanPoblacion] = useState<PanComparisonPoblacion>("clientes");
  // Ratio ACUMULADO por ciudad, superpuesto en los dos gráficos vs Harina PAN.
  // Se calcula acá con los bundles por sector que ya llegan del servidor.
  const [ratioPorCiudadPan, setRatioPorCiudadPan] = useState(false);
  // Gráfico adicional de 3M: solo segmentos foco y solo recompra. Estado
  // propio, para que sus botones no muevan el gráfico de arriba.
  // Cartera vigente completa o solo la cartera piloto original (los 358).
  const [focoRecCartera, setFocoRecCartera] = useState<AlcanceCartera>("completa");
  // Solo segmentos foco, o cualquier segmento.
  const [focoRecSegmento, setFocoRecSegmento] = useState<SegmentoRecompra>("foco");
  // De quién sale el promedio de PAN: toda la cartera, recompra de PAN o recompra de Panquecitas.
  const [focoRecBasePan, setFocoRecBasePan] = useState<BasePan>("cartera");
  // Serie de Panquecitas: ventas totales o solo de recompra (sin la primera compra).
  const [focoRecSerie, setFocoRecSerie] = useState<SeriePanq>("recompra");
  const [showPanDiarioFocoRec, setShowPanDiarioFocoRec] = useState(true);
  const [ratioPorCiudadFocoRec, setRatioPorCiudadFocoRec] = useState(false);
  const [ciudadFocoRec, setCiudadFocoRec] = useState<"TOTAL" | Sector>("TOTAL");
  // Gráfico "Rendimiento vs. Margarina/Mayonesa": misma mecánica que el de 3M
  // de PAN, pero sin distinción clientes/universo (las tablas de Mavesa ya
  // son solo-cartera) y con selector de categoría.
  const [categoriaMavesa, setCategoriaMavesa] = useState<MavesaCategoria>("margarina");
  const [showReferenciaMavesaDiario, setShowReferenciaMavesaDiario] = useState(true);
  const [ratioPorCiudadMavesa, setRatioPorCiudadMavesa] = useState(false);
  const [ciudadMavesa, setCiudadMavesa] = useState<"TOTAL" | Sector>("TOTAL");
  // Barras de Margarina/Mayonesa/Harina PAN de los últimos 3 meses (referencia).
  const [ventas3MesesComoPct, setVentas3MesesComoPct] = useState(false);
  // Línea opcional sobre esas barras: Cumaná = 100% y Cabudare como % de Cumaná.
  const [ventas3MesesIndiceCumana, setVentas3MesesIndiceCumana] = useState(false);
  // Promedio de venta diaria por segmento: ciudad, métrica y qué se muestra.
  const [segCiudad, setSegCiudad] = useState<"TOTAL" | Sector>("TOTAL");
  const [segPorPdv, setSegPorPdv] = useState(false);
  const [segTodos, setSegTodos] = useState(false);
  const [segPanquecitas, setSegPanquecitas] = useState(false);
  // Corte del ratio "Panquecitas vs categoría" bajo las barras (Harina PAN):
  // clientes con recompra de segmentos foco o de cualquier segmento (gráfico de
  // rendimiento diario), o "cartera": el cálculo original, toda la cartera sin
  // filtro de recompra (PAN Universo de getRendimiento3M).
  const [ventas3MesesSegmento, setVentas3MesesSegmento] = useState<SegmentoRecompra | "cartera">("foco");
  // Ranking por segmento: volumen en kg o como % del total.
  const [rankingComoPct, setRankingComoPct] = useState(false);
  const [panGranularity, setPanGranularity] = useState<PanComparisonGranularity>("month");
  const bundle = bundles[filter];

  // Filtro global de fechas: null = todas. Los días que ofrece son los días
  // hábiles con serie desde el arranque del piloto (los mismos de los gráficos
  // de rendimiento diario y de efectividad por día).
  const [diasSel, setDiasSel] = useState<string[] | null>(null);
  const diasFiltro = useMemo<DiasFiltro>(() => (diasSel === null ? null : new Set(diasSel)), [diasSel]);
  const diasDisponibles = useMemo(() => {
    const dias = new Set<string>();
    const t = bundles.TOTAL;
    for (const p of t.rendimiento3M.universo.puntos) dias.add(p.dia);
    for (const p of t.rendimientoVsMavesa.margarina.puntos) dias.add(p.dia);
    for (const p of t.rendimientoVsMavesa.mayonesa.puntos) dias.add(p.dia);
    for (const p of carteraPorSegmento.totalPorDia.day) {
      if (!ES_DIA.test(p.dia)) continue;
      const dia = siguienteDiaHabil(p.dia);
      if (dia >= PILOTO_INICIO) dias.add(dia);
    }
    return [...dias].sort();
  }, [bundles, carteraPorSegmento]);

  // Botón de los gráficos de ratios: sin la ampliación de franquiciados de
  // Cumaná ("Indirecto Cumaná 2"). Un solo estado para todos los ratios.
  const [sinAmpliacion, setSinAmpliacion] = useState(false);
  const botonSinAmpliacion = (
    <button
      onClick={() => setSinAmpliacion((v) => !v)}
      title="Recalcula los ratios sin los ~975 PDV de los franquiciados de Cumaná incorporados el 08-09 (tanda Indirecto Cumaná 2)"
      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
        sinAmpliacion
          ? "border-rose-700 bg-rose-700 text-white"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      {sinAmpliacion ? "Sin ampliación franquiciados Cumaná" : "Excluir ampliación franquiciados Cumaná"}
    </button>
  );

  const sellOutPorCliente = useMemo(
    () =>
      filterSellOutClientes(sellOutClientes, {
        sector: filter === "TOTAL" ? undefined : filter,
        zona: zonaFilter || undefined,
        asesor: asesorFilter || undefined,
        fuente: fuenteFilter,
      }),
    [sellOutClientes, filter, zonaFilter, asesorFilter, fuenteFilter]
  );
  // Resumen agregado (SAP − inventario PDV) para el gráfico comparativo.
  const sellOutResumen = useMemo(() => {
    const sellIn = sellOutPorCliente.reduce((s, r) => s + r.sellInSapKg, 0);
    const inv = sellOutPorCliente.reduce((s, r) => s + r.inventarioPdvKg, 0);
    const sellOut = sellOutPorCliente.reduce((s, r) => s + r.sellOutKg, 0);
    return [
      { concepto: "Sell-In SAP", kg: Math.round(sellIn * 10) / 10 },
      { concepto: "Inventario PDV", kg: Math.round(inv * 10) / 10 },
      { concepto: "Sell-Out", kg: Math.round(sellOut * 10) / 10 },
    ];
  }, [sellOutPorCliente]);

  // Sell-Out por posición en PDV: cruza el Sell-Out por cliente (ya filtrado)
  // con la posición de su última visita. Un cliente con el producto en varias
  // ubicaciones suma su Sell-Out en cada categoría — así se ve qué posición
  // generó más venta.
  const sellOutPorPosicion = useMemo(() => {
    const posByLoc = new Map<string, string[]>();
    for (const p of posicionPorCliente) posByLoc.set(p.locationId, p.categorias);
    const agg = new Map<string, { sellOutKg: number; clientes: number }>();
    for (const r of sellOutPorCliente) {
      const cats = posByLoc.get(r.locationId);
      if (!cats) continue;
      for (const cat of cats) {
        const e = agg.get(cat) ?? { sellOutKg: 0, clientes: 0 };
        e.sellOutKg += r.sellOutKg;
        e.clientes += 1;
        agg.set(cat, e);
      }
    }
    return Array.from(agg.entries())
      .map(([categoria, v]) => ({ categoria, sellOutKg: Math.round(v.sellOutKg * 10) / 10, clientes: v.clientes }))
      .sort((a, b) => b.sellOutKg - a.sellOutKg);
  }, [sellOutPorCliente, posicionPorCliente]);

  // Total acumulado: un punto por bucket de la granularidad elegida. La línea
  // de efectividad usa la métrica seleccionada (Radar / Facturado / Pedidos);
  // el mismo mapeo alimenta el gráfico global y los dos por sector (comparativo).
  // Efectividad de la métrica activa (Radar / Facturado / Pedidos), en su forma
  // diaria y acumulada — se reutiliza para la línea total y las de ciudad.
  const metricDia = (p: CarteraTotalDiaPunto) =>
    carteraMetrica === "activos"
      ? p.efectividadActivos
      : carteraMetrica === "facturados"
      ? p.efectividadFacturados
      : p.efectividadPedidos;
  const metricAcum = (p: CarteraTotalDiaPunto) =>
    carteraMetrica === "activos"
      ? p.efectividadActivosAcum
      : carteraMetrica === "facturados"
      ? p.efectividadFacturadosAcum
      : p.efectividadPedidosAcum;
  const mapTotalPoint = (p: CarteraTotalDiaPunto): CarteraTotalDiaChartPoint => ({
    label: p.label,
    radarKgDia: p.radarKgDia,
    radarKgDiaDirecto: p.radarKgDiaDirecto,
    radarKgDiaIndirecto: p.radarKgDiaIndirecto,
    programados: p.programados,
    // Línea principal: por período (día) o acumulada (activos ÷ cartera total).
    efectividad: efectividadAcum ? metricAcum(p) : metricDia(p),
    // Líneas por modelo: mismo toggle, independiente del de la línea principal.
    efectividadDirecto: modeloAcum ? p.efectividadDirectoAcum : p.efectividadDirecto,
    efectividadIndirecto: modeloAcum ? p.efectividadIndirectoAcum : p.efectividadIndirecto,
  });
  // Color de la línea de efectividad según la métrica: Radar rojo, Facturado
  // azul marino, Pedidos naranja.
  const efectividadColor =
    carteraMetrica === "activos" ? "#dc2626" : carteraMetrica === "facturados" ? "#1e3a8a" : "#ea580c";
  // Gráfico global: además de la línea total, se superponen (opcional) las
  // efectividades por ciudad — acumulada y/o diaria — mergeadas por bucket.
  const carteraTotalDiaData = useMemo(() => {
    const base = filtrarPorDias(carteraPorSegmento.totalPorDia[totalGranularity], (p) => p.dia, diasFiltro);
    const cIdx = new Map(carteraPorSegmento.totalPorSector.cumana[totalGranularity].map((p) => [p.dia, p]));
    const bIdx = new Map(
      carteraPorSegmento.totalPorSector.barquisimeto_este[totalGranularity].map((p) => [p.dia, p])
    );
    // La ACUMULADA arrastra el último valor conocido (un acumulado no baja a
    // hueco): así la línea es continua y visible en toda la escala aunque la
    // ciudad no tenga movimiento ese bucket. La DIARIA sí deja hueco (null).
    let cAcum: number | null = null;
    let bAcum: number | null = null;
    let cEscala: number | null = null;
    let bEscala: number | null = null;
    let cAterrizada: number | null = null;
    let bAterrizada: number | null = null;
    return base.map((p) => {
      const c = cIdx.get(p.dia);
      const b = bIdx.get(p.dia);
      if (c) cAcum = metricAcum(c);
      if (b) bAcum = metricAcum(b);
      if (c) cEscala = c.efectividadActivosAcumVendible;
      if (b) bEscala = b.efectividadActivosAcumVendible;
      if (c)
        cAterrizada = aterrizadaEscala
          ? c.efectividadActivosAcumAterrizadaVendible
          : c.efectividadActivosAcumAterrizada;
      if (b)
        bAterrizada = aterrizadaEscala
          ? b.efectividadActivosAcumAterrizadaVendible
          : b.efectividadActivosAcumAterrizada;
      return {
        ...mapTotalPoint(p),
        // Volumen Radar del bucket partido por ciudad (para las barras por ciudad).
        radarKgDiaCumana: c?.radarKgDia ?? 0,
        radarKgDiaCabudare: b?.radarKgDia ?? 0,
        efectCumanaAcum: cAcum,
        efectCabudareAcum: bAcum,
        efectCumanaDia: c ? metricDia(c) : null,
        efectCabudareDia: b ? metricDia(b) : null,
        // "A escala": activación acumulada contra la cartera VENDIBLE de esa
        // misma fecha, calculada en el servidor bucket a bucket. Se arrastra
        // el último valor conocido igual que la acumulada normal, porque un
        // acumulado no baja a hueco.
        efectCumanaEscala: cEscala,
        efectCabudareEscala: bEscala,
        // Total a escala: sale directo del punto del total (`p`), que el
        // servidor ya calcula contra la cartera vendible del piloto completo
        // en cada bucket. No hace falta arrastrar valor: la serie del total
        // tiene todos los buckets.
        efectTotalEscala: p.efectividadActivosAcumVendible,
        // Total aterrizado: la cartera de hoy como denominador fijo desde el día 1.
        efectTotalAterrizada: aterrizadaEscala
          ? p.efectividadActivosAcumAterrizadaVendible
          : p.efectividadActivosAcumAterrizada,
        // Aterrizada por ciudad: se arrastra el último valor, igual que la "a escala".
        efectCumanaAterrizada: cAterrizada,
        efectCabudareAterrizada: bAterrizada,
        // Aterrizada por modelo: sale directo del punto del total, con el mismo botón de escala.
        efectDirectoAterrizada: aterrizadaEscala
          ? p.efectividadDirectoAcumAterrizadaVendible
          : p.efectividadDirectoAcumAterrizada,
        efectIndirectoAterrizada: aterrizadaEscala
          ? p.efectividadIndirectoAcumAterrizadaVendible
          : p.efectividadIndirectoAcumAterrizada,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carteraPorSegmento, totalGranularity, carteraMetrica, efectividadAcum, modeloAcum, aterrizadaEscala, diasFiltro]);
  // Un solo .xlsx con las 3 hojas (Total + cada ciudad), cada una con su gráfico
  // editable. Usa los datos crudos de la granularidad activa (no el mapeo del
  // gráfico), para incluir todas las columnas (día y acumulado).
  const efectividadExcelSheets = useMemo<ExcelSheetSpec<CarteraTotalDiaPunto>[]>(
    () => [
      {
        sheetName: "Total (ambas ciudades)",
        columns: TOTAL_ACUM_COLUMNS,
        rows: filtrarPorDias(carteraPorSegmento.totalPorDia[totalGranularity], (p) => p.dia, diasFiltro),
        chart: TOTAL_ACUM_CHART,
      },
      ...pilotSectors.map((s) => ({
        sheetName: sectorLabels[s],
        columns: SECTOR_ACUM_COLUMNS,
        rows: filtrarPorDias(carteraPorSegmento.totalPorSector[s][totalGranularity], (p) => p.dia, diasFiltro),
        chart: sectorAcumChart(sectorLabels[s]),
      })),
    ],
    [carteraPorSegmento, totalGranularity, pilotSectors, sectorLabels, diasFiltro]
  );
  // Días de inventario en calle: misma medición entre visitas que la tarjeta de
  // rotación (Σ inventario ÷ Σ ritmo), con los filtros de ciudad, zona y asesor.
  const rotacion = useMemo(
    () =>
      resumirRotacion(
        cruceMercaderistaRadar.filas.filter(
          (r) =>
            (filter === "TOTAL" || r.sector === filter) &&
            (!zonaFilter || r.zona === zonaFilter) &&
            (!asesorFilter || r.asesor === asesorFilter)
        )
      ),
    [cruceMercaderistaRadar.filas, filter, zonaFilter, asesorFilter]
  );
  const mixProducto = bundle.mixProducto;

  // Segmento con más volumen de Panquecitas (Carga Radar) del corte activo, para
  // marcarlo en la tabla. Sale del bundle, así que sigue el filtro de ciudad.
  const segmentoTopVolumen = useMemo(() => {
    const top = bundle.detalleSegmentos.reduce<DetalleSegmentoRow | null>(
      (best, r) => (best === null || r.panquecitasTon > best.panquecitasTon ? r : best),
      null
    );
    return top && top.panquecitasTon > 0 ? top.segmento : null;
  }, [bundle.detalleSegmentos]);

  // Precio Correcto: ciudades disponibles + filas filtradas por la ciudad activa.
  const precioCiudades = useMemo(
    () => Array.from(new Set(precioCorrecto.map((r) => r.ciudad))).sort(),
    [precioCorrecto]
  );
  const precioFiltrado = useMemo(
    () => (precioCiudad === "TODAS" ? precioCorrecto : precioCorrecto.filter((r) => r.ciudad === precioCiudad)),
    [precioCorrecto, precioCiudad]
  );

  // Panquecitas vs Harina PAN + el ratio ACUMULADO de cada ciudad. El acumulado
  // se arrastra sumando kg bucket a bucket (Σ Panquecitas ÷ Σ HPM), no
  // promediando ratios: un promedio de ratios daría mal si los volúmenes por
  // período son muy distintos. Sale de los bundles por sector, que ya vienen
  // calculados desde el servidor.
  const panPoints = useMemo<PanVsHarinaPanChartPoint[]>(() => {
    const base = filtrarPorDias(bundle.panVsHarinaPan[panPoblacion][panGranularity], (p) => p.bucket, diasFiltro);
    const idxPorSector = (s: Sector) =>
      new Map(bundles[s].panVsHarinaPan[panPoblacion][panGranularity].map((p) => [p.bucket, p]));
    const cIdx = idxPorSector("cumana");
    const bIdx = idxPorSector("barquisimeto_este");

    let cPanq = 0;
    let cHpm = 0;
    let bPanq = 0;
    let bHpm = 0;
    return base.map((p) => {
      const c = cIdx.get(p.bucket);
      if (c) {
        cPanq += c.panquecitasKg;
        cHpm += c.harinaPanKg;
      }
      const b = bIdx.get(p.bucket);
      if (b) {
        bPanq += b.panquecitasKg;
        bHpm += b.harinaPanKg;
      }
      return {
        ...p,
        ratioCumanaAcum: cHpm > 0 ? Math.round((cPanq / cHpm) * 1000) / 10 : null,
        ratioCabudareAcum: bHpm > 0 ? Math.round((bPanq / bHpm) * 1000) / 10 : null,
      };
    });
  }, [bundle, bundles, panPoblacion, panGranularity, diasFiltro]);

  // Gráfico adicional de 3M (solo segmentos foco y solo recompra). Mismas
  // definiciones que el de arriba —ratio acumulado = promedio de los ratios
  // diarios, por ciudad contra su propio promedio de PAN—, sobre sus datos.
  const focoRecData = useMemo(
    () =>
      conDias(
        fuenteRatios(ciudadFocoRec === "TOTAL" ? bundle : bundles[ciudadFocoRec], sinAmpliacion).focoRec[
          focoRecCartera
        ][focoRecSegmento][focoRecBasePan][focoRecSerie],
        diasFiltro
      ),
    [bundle, bundles, ciudadFocoRec, sinAmpliacion, focoRecCartera, focoRecSegmento, focoRecBasePan, focoRecSerie, diasFiltro]
  );

  // Cómo se nombran, en el pie, el tooltip y el Excel, los clientes de la serie
  // de Panquecitas y los del promedio de PAN.
  const etiquetaFocoRec = focoRecSegmento === "foco" ? "de la cartera de segmentos foco" : "de toda la cartera";
  const etiquetaPanFocoRec =
    focoRecBasePan === "cartera"
      ? etiquetaFocoRec
      : `con recompra de ${focoRecBasePan === "recompraPan" ? "Harina PAN" : "Panquecitas"}${
          focoRecSegmento === "foco" ? " de segmentos foco" : ""
        }`;

  const ratioAcumuladoFocoRec = useMemo(() => {
    const puntos = focoRecData.puntos;
    if (puntos.length === 0) return null;
    const suma = puntos.reduce((s, p) => s + p.ratioPct, 0);
    return { pct: Math.round((suma / puntos.length) * 10) / 10, dias: puntos.length };
  }, [focoRecData]);

  const ratiosFocoRecPorCiudad = useMemo<Rendimiento3MRatioCiudad[]>(() => {
    const base = focoRecData.puntos;
    if (base.length === 0) return [];
    const porDia = (s: Sector) =>
      new Map(
        fuenteRatios(bundles[s], sinAmpliacion).focoRec[focoRecCartera][focoRecSegmento][focoRecBasePan][
          focoRecSerie
        ].puntos.map((p) => [p.dia, p])
      );
    const c = porDia("cumana");
    const b = porDia("barquisimeto_este");

    let cSuma = 0;
    let cDias = 0;
    let bSuma = 0;
    let bDias = 0;
    return base.map((p) => {
      const cp = c.get(p.dia);
      if (cp) {
        cSuma += cp.ratioPct;
        cDias += 1;
      }
      const bp = b.get(p.dia);
      if (bp) {
        bSuma += bp.ratioPct;
        bDias += 1;
      }
      return {
        dia: p.dia,
        ratioCumanaAcum: cDias > 0 ? Math.round((cSuma / cDias) * 10) / 10 : null,
        ratioCabudareAcum: bDias > 0 ? Math.round((bSuma / bDias) * 10) / 10 : null,
      };
    });
  }, [focoRecData, bundles, sinAmpliacion, focoRecCartera, focoRecSegmento, focoRecBasePan, focoRecSerie]);

  // Mismo patrón que el gráfico de 3M de PAN, pero para Margarina/Mayonesa
  // (sección "Rendimiento vs. Margarina/Mayonesa"): no hay distinción
  // clientes/universo, solo categoría seleccionada.
  const rendimientoVsMavesaData = useMemo<RendimientoVsMavesaResult>(
    () =>
      conDias(
        fuenteRatios(ciudadMavesa === "TOTAL" ? bundle : bundles[ciudadMavesa], sinAmpliacion).mavesa[categoriaMavesa],
        diasFiltro
      ),
    [bundle, bundles, ciudadMavesa, sinAmpliacion, categoriaMavesa, diasFiltro]
  );

  const ratioAcumuladoMavesa = useMemo(() => {
    const puntos = rendimientoVsMavesaData.puntos;
    if (puntos.length === 0) return null;
    const suma = puntos.reduce((s, p) => s + p.ratioPct, 0);
    return { pct: Math.round((suma / puntos.length) * 10) / 10, dias: puntos.length };
  }, [rendimientoVsMavesaData]);

  const ratiosMavesaPorCiudad = useMemo<RendimientoVsMavesaRatioCiudad[]>(() => {
    const base = rendimientoVsMavesaData.puntos;
    if (base.length === 0) return [];
    const porDia = (s: Sector) =>
      new Map(fuenteRatios(bundles[s], sinAmpliacion).mavesa[categoriaMavesa].puntos.map((p) => [p.dia, p]));
    const c = porDia("cumana");
    const b = porDia("barquisimeto_este");

    let cSuma = 0;
    let cDias = 0;
    let bSuma = 0;
    let bDias = 0;
    return base.map((p) => {
      const cp = c.get(p.dia);
      if (cp) {
        cSuma += cp.ratioPct;
        cDias += 1;
      }
      const bp = b.get(p.dia);
      if (bp) {
        bSuma += bp.ratioPct;
        bDias += 1;
      }
      return {
        dia: p.dia,
        ratioCumanaAcum: cDias > 0 ? Math.round((cSuma / cDias) * 10) / 10 : null,
        ratioCabudareAcum: bDias > 0 ? Math.round((bSuma / bDias) * 10) / 10 : null,
      };
    });
  }, [rendimientoVsMavesaData, bundles, sinAmpliacion, categoriaMavesa]);

  // Ratio ACUMULADO de Panquecitas contra cada categoría, por ciudad. No es un
  // cálculo nuevo: es exactamente el mismo número que ya muestran los gráficos
  // de rendimiento diario (promedio de los ratios diarios del período), solo
  // que resumido en un valor por categoría × ciudad para colgarlo debajo de
  // cada barra de "Ventas Últimos 3 Meses".
  //
  // La clave es `${categoría}|${sector}` y usa los mismos nombres de categoría
  // que el gráfico (Margarina / Mayonesa / Harina PAN). Sale de los bundles por
  // sector, así que no depende de las pestañas de arriba — igual que las barras.
  const ratiosPanquecitas3Meses = useMemo<Record<string, number | null>>(() => {
    // Con el filtro de fechas, el promedio sale solo de los días elegidos.
    const promedio = (todos: { dia: string; ratioPct: number }[]) => {
      const puntos = filtrarPorDias(todos, (p) => p.dia, diasFiltro);
      return puntos.length === 0
        ? null
        : Math.round((puntos.reduce((s, p) => s + p.ratioPct, 0) / puntos.length) * 10) / 10;
    };

    const salida: Record<string, number | null> = {};
    for (const s of pilotSectors) {
      const fuente = fuenteRatios(bundles[s], sinAmpliacion);
      salida[`Margarina|${s}`] = promedio(fuente.mavesa.margarina.puntos);
      salida[`Mayonesa|${s}`] = promedio(fuente.mavesa.mayonesa.puntos);
      // Harina PAN: con "cartera", el cálculo original (toda la cartera, sin
      // recompra); si no, el ratio acumulado del gráfico con PAN de recompra de
      // Panquecitas (cartera completa), con el corte foco / todos de esta tarjeta.
      salida[`Harina PAN|${s}`] = promedio(
        ventas3MesesSegmento === "cartera"
          ? fuente.universo3M.puntos
          : fuente.focoRec.completa[ventas3MesesSegmento].recompraPanquecitas.recompra.puntos
      );
    }
    return salida;
  }, [bundles, pilotSectors, ventas3MesesSegmento, sinAmpliacion, diasFiltro]);

  // ── Promedio de venta diaria por segmento ────────────────────────
  // El servidor manda totales crudos por segmento × ciudad; acá se hace todo
  // lo demás para que los botones no vuelvan a pedir datos.
  //
  // Cada categoría se divide entre SUS días hábiles: Margarina, Mayonesa y
  // Harina PAN entre los 63 de mayo-julio, Panquecitas entre los transcurridos
  // desde el arranque del piloto. Por eso se comparan ritmos y no totales.
  const ventaSegmentoData = useMemo<VentaSegmentoPunto[]>(() => {
    const { filas, diasReferencia, diasPanquecitas } = ventaDiariaPorSegmento;
    const delCorte = segCiudad === "TOTAL" ? filas : filas.filter((f) => f.sector === segCiudad);
    if (delCorte.length === 0) return [];

    // Con "TOTAL" hay una fila por ciudad y segmento: se suman.
    const porSegmento = new Map<string, { clientes: number; marg: number; mayo: number; pan: number; panq: number }>();
    for (const f of delCorte) {
      const acc = porSegmento.get(f.segmento) ?? { clientes: 0, marg: 0, mayo: 0, pan: 0, panq: 0 };
      acc.clientes += f.clientes;
      acc.marg += f.margarinaKg;
      acc.mayo += f.mayonesaKg;
      acc.pan += f.harinaPanKg;
      acc.panq += f.panquecitasKg;
      porSegmento.set(f.segmento, acc);
    }

    const r1 = (v: number) => Math.round(v * 10) / 10;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const ratio = (panqDia: number, catDia: number) => (catDia > 0 ? Math.round((panqDia / catDia) * 1000) / 10 : null);

    const puntos = [...porSegmento.entries()].map(([segmento, a]) => {
      // "Por PDV" divide además entre los clientes del segmento: es lo que
      // hace comparables segmentos de tamaños muy distintos.
      const div = segPorPdv && a.clientes > 0 ? a.clientes : 1;
      const dia = (kg: number, dias: number) => kg / dias / div;
      const marg = dia(a.marg, diasReferencia);
      const mayo = dia(a.mayo, diasReferencia);
      const pan = dia(a.pan, diasReferencia);
      const panq = dia(a.panq, diasPanquecitas);
      const red = segPorPdv ? r2 : r1;
      return {
        segmento,
        clientes: a.clientes,
        margarina: red(marg),
        mayonesa: red(mayo),
        harinaPan: red(pan),
        panquecitas: red(panq),
        // El ratio no depende de "por PDV": el divisor se cancela arriba y
        // abajo, así que es el mismo número en las dos vistas.
        ratioMargarina: ratio(panq, marg),
        ratioMayonesa: ratio(panq, mayo),
        ratioHarinaPan: ratio(panq, pan),
        // Solo para ordenar: el peso del segmento en las tres de referencia.
        _peso: a.marg + a.mayo + a.pan,
      };
    });

    puntos.sort((a, b) => b._peso - a._peso);
    if (segTodos || puntos.length <= 7) return puntos.map(({ _peso: _, ...p }) => p);

    // Los 6 grandes + "Otros": esos 6 son ~90% de la cartera, y sin agrupar el
    // resto quedan barras de un píxel que no se pueden leer ni comparar.
    const top = puntos.slice(0, 6);
    const resto = puntos.slice(6);
    const suma = (f: (p: (typeof puntos)[number]) => number) => resto.reduce((s, p) => s + f(p), 0);
    const otros: VentaSegmentoPunto = {
      segmento: `Otros (${resto.length})`,
      clientes: suma((p) => p.clientes),
      margarina: suma((p) => p.margarina),
      mayonesa: suma((p) => p.mayonesa),
      harinaPan: suma((p) => p.harinaPan),
      panquecitas: suma((p) => p.panquecitas),
      ratioMargarina: ratio(suma((p) => p.panquecitas), suma((p) => p.margarina)),
      ratioMayonesa: ratio(suma((p) => p.panquecitas), suma((p) => p.mayonesa)),
      ratioHarinaPan: ratio(suma((p) => p.panquecitas), suma((p) => p.harinaPan)),
    };
    return [...top.map(({ _peso: _, ...p }) => p), otros];
  }, [ventaDiariaPorSegmento, segCiudad, segPorPdv, segTodos]);

  // Potencial 3M: Harina PAN del reporte de 3 meses de la cartera de hoy
  // (resuelto por sap_code contra la cartera actual), promedio por mes, y el 4%
  // de eso como venta teórica de Panquecitas. Se parte en dos: los clientes
  // que ya compran Panquecitas (rendimiento3M.clientes) y los que no (cartera
  // completa menos esos) — "clientes" es un subconjunto de "universo".
  const potencial3M = useMemo(() => {
    const { universo, clientes } = bundle.rendimiento3M;
    if (universo.totalPanKg <= 0 || !universo.desde || !universo.hasta) return null;
    const [y1, m1] = universo.desde.split("-").map(Number);
    const [y2, m2] = universo.hasta.split("-").map(Number);
    const meses = Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
    const armar = (panKg: number, clientesPoblacion: number) => ({
      kgMes: (panKg / meses) * 0.04,
      kgPeriodo: panKg * 0.04,
      clientes: clientesPoblacion,
    });
    const con = armar(clientes.totalPanKg, clientes.clientesPoblacion);
    const sin = armar(
      Math.max(0, universo.totalPanKg - clientes.totalPanKg),
      Math.max(0, universo.clientesPoblacion - clientes.clientesPoblacion)
    );
    const total = armar(universo.totalPanKg, universo.clientesPoblacion);
    return { meses, desde: universo.desde, hasta: universo.hasta, con, sin, total };
  }, [bundle.rendimiento3M]);

  const comboPointsTodos = bundle.ventaRecompraActivacion[comboGranularity];
  // Filtro de fechas: solo recorta puntos diarios; los acumulados siguen siendo desde el arranque.
  const comboPoints = filtrarPorDias(comboPointsTodos, (p) => p.bucket, diasFiltro);
  const demandaPoints = filtrarPorDias(bundle.demandaInsatisfecha[granularity], (p) => p.bucket, diasFiltro);
  // Kg de PDV fuera de cartera incluidos en el volumen. Es acumulado, así que
  // el último punto trae el total del período.
  const ventaFueraKg =
    comboPointsTodos.length > 0 ? comboPointsTodos[comboPointsTodos.length - 1].ventaAcumuladaFueraKg : 0;

  // Proporción de volumen Panquecitas sobre Harina PAN (Radar) — solo se
  // muestra como acotación en la tarjeta de volumen de Panquecitas.
  const proporcionPanqVsHpm =
    bundle.volumenRadarAcumulado.harinaPanTon > 0
      ? Math.round(
          (bundle.volumenRadarAcumulado.panquecitasTon / bundle.volumenRadarAcumulado.harinaPanTon) * 1000
        ) / 10
      : 0;

  // Ratio ACUMULADO contra el promedio de PAN de los ÚLTIMOS 3 MESES (la carga
  // aparte "Radar últimos 3 Meses"), para la tarjeta de volumen. Es otra
  // referencia que la línea de arriba: esa compara contra el PAN del propio
  // período (Radar), esta contra el histórico de 3 meses.
  //
  // Misma definición que el gráfico de más abajo: promedio de los ratios
  // diarios. Se fija a solo foco, PAN de recompra de Panquecitas y cartera completa, para que la
  // tarjeta no cambie con los toggles internos del gráfico; sí sigue el corte
  // de las pestañas de arriba, como el resto de la tarjeta.
  const ratioAcum3MTarjeta = useMemo(() => {
    const puntos = bundle.rendimiento3MFocoRecompra.completa.foco.recompraPanquecitas.recompra.puntos;
    if (puntos.length === 0) return null;
    const suma = puntos.reduce((s, p) => s + p.ratioPct, 0);
    return Math.round((suma / puntos.length) * 10) / 10;
  }, [bundle]);

  const filtroTexto = filter === "TOTAL" ? "Total sectores piloto" : sectorLabels[filter];

  // Activación ajustada: siempre el Total y las dos ciudades, sin depender de
  // las pestañas — el punto de esa tarjeta es comparar los tres cortes de un
  // vistazo. La tabla de detalle sí sigue el corte activo.
  const activacionPorCiudad = useMemo(
    () => [
      { label: "Total", data: bundles.TOTAL.activacionAjustada },
      ...pilotSectors.map((s) => ({ label: sectorLabels[s], data: bundles[s].activacionAjustada })),
    ],
    [bundles, pilotSectors, sectorLabels]
  );

  return (
    <div className="print-root">
      <ReportPrintHeader
        title="Reporte Estratégico de Mercado"
        subtitle="Ventas, penetración, rotación y cobertura — perfil DIENN"
        filtros={[
          filtroTexto,
          zonaFilter || "Todas las zonas",
          asesorFilter || "Todos los asesores",
          fuenteFilter === "TODOS" ? "Tradicional y cadenas" : fuenteFilter === "Calculado" ? "Solo tradicional" : "Solo cadenas",
          diasSel === null ? "Todas las fechas" : `Fechas: ${diasSel.join(", ")}`,
          ...(sinAmpliacion ? ["Ratios sin ampliación franquiciados Cumaná"] : []),
        ]}
      />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Estratégico — DIENN</h1>
          <p className="text-slate-500 mt-1">Ventas, penetración, rotación y cobertura del mercado</p>
        </div>
        <ReportPrintButton />
      </div>

      {/* ── Filtro reactivo de segmento ────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-6 print:hidden">
        <button
          onClick={() => setFilter("TOTAL")}
          className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
            filter === "TOTAL"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
          }`}
        >
          TOTAL
        </button>
        {pilotSectors.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              filter === s
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {sectorLabels[s]}
          </button>
        ))}
        <span className="mx-1 hidden w-px self-stretch bg-slate-200 sm:block" />
        <FiltroFechas dias={diasDisponibles} seleccion={diasSel} onChange={setDiasSel} />
      </div>

      {/* ── BLOQUE 1 · Tarjetas principales (KPI) ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 print-avoid-break">
        <KpiCard
          title="Vol. acumulado en radar — Panquecitas"
          value={`${bundle.volumenRadarAcumulado.panquecitasTon.toLocaleString("es-VE", { maximumFractionDigits: 2 })} Ton`}
          annotation={[
            `Activación de cliente ${bundle.penetracionRadarVsHpm.radarPanquecitasPct}%`,
            `Proporción vs Harina PAN ${proporcionPanqVsHpm}%`,
            // Segunda referencia: el mismo ratio pero contra el promedio de PAN
            // de los últimos 3 meses (carga "Radar últimos 3 Meses").
            ...(ratioAcum3MTarjeta != null
              ? [`Ratio acum. vs promedio PAN 3M (foco con recompra) ${ratioAcum3MTarjeta.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`]
              : []),
            `Volumen facturado ${bundle.totalFacturadoToneladas.toLocaleString("es-VE", { maximumFractionDigits: 2 })} Ton`,
            // Este total es el único que suma PDV fuera de la cartera. Se
            // declara para que la diferencia contra los gráficos por segmento
            // —que sí se limitan a la cartera— tenga una explicación visible.
            ...(bundle.volumenRadarAcumulado.fueraDeCarteraTon > 0
              ? [
                  `Incluye ${bundle.volumenRadarAcumulado.fueraDeCarteraTon.toLocaleString("es-VE", {
                    maximumFractionDigits: 2,
                  })} Ton de ${bundle.volumenRadarAcumulado.fueraDeCarteraClientes} clientes fuera de cartera`,
                ]
              : []),
          ]}
          subtitle="Confirmado en anaquel — solo Carga Radar"
          product="panquecitas"
        />

        <KpiCard
          title="Vol. acumulado en radar — Harina PAN"
          value={`${bundle.volumenRadarAcumulado.harinaPanTon.toLocaleString("es-VE", { maximumFractionDigits: 2 })} Ton`}
          annotation={`Activación de cliente ${bundle.penetracionRadarVsHpm.hpmPct}%`}
          subtitle="Confirmado en anaquel — solo Carga Radar"
          product="pan"
        />

        <KpiCard
          title="Índice Tienda Ideal"
          value={`${tiendaIdeal.pct}%`}
          subtitle={`${tiendaIdeal.cumplen} de ${tiendaIdeal.total} PDVs visitados por mercaderista (sectores piloto)`}
        />
      </div>

      {/* ── Rendimiento diario vs. promedio 3M — recompra de Panquecitas ── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div>
            <CardTitle>Rendimiento Diario vs. Promedio Histórico (3 Meses)</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Venta diaria de Panquecitas (<span className="font-medium">Panquecitas totales</span>: toda la venta;{" "}
              <span className="font-medium">Panquecitas recompra</span>: solo clientes que compraron más de una vez, sin
              incluir su primera compra) contra un promedio de ventas diarias de Harina PAN del reporte{" "}
              <span className="font-medium">Radar últimos 3 Meses</span> (venta acumulada de los 3 meses, último corte de
              cada mes, ÷ días hábiles). El promedio de PAN se elige con el botón:{" "}
              <span className="font-medium">PAN toda la cartera</span>, todos los clientes, como siempre;{" "}
              <span className="font-medium">PAN recompra de PAN</span>, solo los clientes con Harina PAN en al menos 2
              fechas del reporte; <span className="font-medium">PAN recompra de Panquecitas</span>, solo los clientes que
              venden Harina PAN y recompraron Panquecitas. La línea continua es ese promedio y la punteada su 4%; el
              porcentaje sobre cada punto es el ratio del día. <span className="font-medium">Solo foco</span> quita los
              segmentos que no venden alimentos (licorerías, CS, farmacias de barrio, mascotas y animales).{" "}
              <span className="font-medium">Cartera piloto</span> deja solo a los clientes del piloto original (los 358).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {/* Serie de Panquecitas: ventas totales o solo de recompra. */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  ["totales", "Panquecitas totales"],
                  ["recompra", "Panquecitas recompra"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFocoRecSerie(key)}
                  title={
                    key === "totales"
                      ? "Toda la venta de Panquecitas de los clientes del corte"
                      : "Solo clientes que compraron más de una vez, sin incluir su primera compra"
                  }
                  className={`px-3 py-1.5 transition-colors ${
                    focoRecSerie === key ? "bg-indigo-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* De qué clientes sale el promedio de PAN: mueve la línea de PAN, la meta y los ratios. */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  ["cartera", "PAN toda la cartera"],
                  ["recompraPan", "PAN recompra de PAN"],
                  ["recompraPanquecitas", "PAN recompra de Panquecitas"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFocoRecBasePan(key)}
                  title={
                    key === "cartera"
                      ? "Promedio de PAN de todos los clientes, como siempre"
                      : key === "recompraPan"
                      ? "Promedio de PAN solo de los clientes con Harina PAN en al menos 2 fechas del reporte de 3 meses"
                      : "Promedio de PAN solo de los clientes que venden Harina PAN y recompraron Panquecitas"
                  }
                  className={`px-3 py-1.5 transition-colors ${
                    focoRecBasePan === key ? "bg-amber-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Solo segmentos foco, o cualquier segmento. */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  ["foco", "Solo foco"],
                  ["todos", "Todos los segmentos"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFocoRecSegmento(key)}
                  title={
                    key === "foco"
                      ? "Solo clientes de segmentos foco"
                      : "Clientes de cualquier segmento"
                  }
                  className={`px-3 py-1.5 transition-colors ${
                    focoRecSegmento === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Cartera vigente completa o solo la cartera piloto original (los 358). */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  ["completa", "Cartera completa"],
                  ["piloto", "Cartera piloto"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFocoRecCartera(key)}
                  title={
                    key === "piloto"
                      ? "Solo los clientes de la cartera piloto original (los 358 del arranque)"
                      : "Toda la cartera vigente"
                  }
                  className={`px-3 py-1.5 transition-colors ${
                    focoRecCartera === key ? "bg-emerald-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  ["TOTAL", "Total"],
                  ["cumana", "Cumaná"],
                  ["barquisimeto_este", "Cabudare"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCiudadFocoRec(key)}
                  className={`px-3 py-1.5 transition-colors ${
                    ciudadFocoRec === key ? "bg-sky-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowPanDiarioFocoRec((v) => !v)}
              title="Muestra u oculta la línea del promedio diario de Harina PAN"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                showPanDiarioFocoRec
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Línea PAN: {showPanDiarioFocoRec ? "Visible" : "Oculta"}
            </button>
            {botonSinAmpliacion}
            <button
              onClick={() => setRatioPorCiudadFocoRec((v) => !v)}
              title="Superpone el ratio acumulado de cada ciudad contra su propio promedio de PAN"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                ratioPorCiudadFocoRec
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Ratio acum. por ciudad
            </button>
            <ExportExcelButton
              filename={`Rendimiento diario vs promedio 3M ${
                etiquetaFocoRec
              } — ${filtroTexto}`}
              rows={focoRecData.puntos}
              columns={[
                { header: "Día", value: (r) => r.dia, width: 14 },
                { header: focoRecSerie === "recompra" ? "Panquecitas de recompra (kg)" : "Panquecitas totales (kg)", value: (r) => r.panquecitasKg, width: 34 },
                { header: "Ratio vs promedio PAN (%)", value: (r) => r.ratioPct, width: 26 },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {focoRecData.puntos.length > 0 ? (
            <>
              <div className="relative">
                {ratioAcumuladoFocoRec && (
                  <div
                    className="absolute right-0 top-0 z-10 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 pointer-events-none"
                    title={`Promedio de los ${ratioAcumuladoFocoRec.dias} ratios diarios del período (Panquecitas ${
                      focoRecSerie === "recompra" ? "de recompra (desde la segunda compra)" : "totales"
                    } de los clientes ${
                      etiquetaFocoRec
                    } ÷ promedio diario de Harina PAN de los clientes ${etiquetaPanFocoRec}).`}
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-500 leading-none">Ratio acumulado</p>
                    <p
                      className={`text-2xl font-bold leading-tight ${
                        ratioAcumuladoFocoRec.pct >= 4 ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {ratioAcumuladoFocoRec.pct.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%
                      <span className="text-sm font-medium text-slate-500"> · meta 4%</span>
                    </p>
                  </div>
                )}
                <Rendimiento3MChart
                  data={focoRecData}
                  showPanDiario={showPanDiarioFocoRec}
                  ratiosCiudad={ratiosFocoRecPorCiudad}
                  showRatioCiudades={ratioPorCiudadFocoRec}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Promedio PAN 3M de los clientes {etiquetaPanFocoRec}:{" "}
                <span className="font-medium text-slate-600">
                  {focoRecData.promedio3M.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg/día
                </span>{" "}
                ({focoRecData.totalPanKg.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg ÷{" "}
                {focoRecData.diasPeriodo} días hábiles, del {focoRecData.desde} al {focoRecData.hasta}) · aportado por{" "}
                <span className="font-medium text-slate-600">
                  {focoRecData.clientesPan} de {focoRecData.clientesPoblacion} PDV {etiquetaPanFocoRec}
                </span>{" "}
                · Meta 4%:{" "}
                <span className="font-medium text-emerald-700">
                  {focoRecData.meta4Pct.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg/día
                </span>
              </p>
            </>
          ) : (
            <div className="h-[370px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📉</p>
                {focoRecData.promedio3M > 0 ? (
                  <>
                    <p>Sin ventas de Panquecitas desde el 03-08-2026.</p>
                    <p className="text-xs mt-1">El promedio de referencia ya está cargado; falta la venta del piloto.</p>
                  </>
                ) : (
                  <>
                    <p>Sin promedio de PAN para este grupo de clientes.</p>
                    <p className="text-xs mt-1">
                      Revisa que el reporte &quot;Radar últimos 3 Meses&quot; esté cargado (menú &quot;Radar 3 Meses&quot;).
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="mb-4 print:hidden" />

      {/* ── Rendimiento vs. Margarina/Mayonesa (Mavesa) ────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div>
            <CardTitle>Rendimiento Diario vs. Margarina/Mayonesa</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Misma mecánica que el gráfico de PAN: venta diaria de Panquecitas (Carga Radar) contra el promedio de
              ventas diarias de la categoría elegida (Mavesa), calculado con el período real cargado en su reporte de
              referencia. La línea continua es ese promedio y la punteada su 4%. El porcentaje sobre cada punto es el
              ratio del día. Con <span className="font-medium">Cumaná</span> o <span className="font-medium">Cabudare</span>{" "}
              el gráfico se acota a esa ciudad.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  ["margarina", "vs. Margarina"],
                  ["mayonesa", "vs. Mayonesa"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCategoriaMavesa(key)}
                  className={`px-3 py-1.5 transition-colors ${
                    categoriaMavesa === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  ["TOTAL", "Total"],
                  ["cumana", "Cumaná"],
                  ["barquisimeto_este", "Cabudare"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCiudadMavesa(key)}
                  className={`px-3 py-1.5 transition-colors ${
                    ciudadMavesa === key ? "bg-sky-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowReferenciaMavesaDiario((v) => !v)}
              title="Muestra u oculta la línea del promedio diario de la categoría elegida"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                showReferenciaMavesaDiario
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Línea referencia: {showReferenciaMavesaDiario ? "Visible" : "Oculta"}
            </button>
            {botonSinAmpliacion}
            <button
              onClick={() => setRatioPorCiudadMavesa((v) => !v)}
              title="Superpone el ratio acumulado de cada ciudad contra su propio promedio"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                ratioPorCiudadMavesa
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Ratio acum. por ciudad
            </button>
            <ExportExcelButton
              filename={`Rendimiento vs ${categoriaMavesa} — ${filtroTexto}`}
              rows={rendimientoVsMavesaData.puntos}
              columns={[
                { header: "Día", value: (r) => r.dia, width: 14 },
                { header: "Panquecitas (kg)", value: (r) => r.panquecitasKg, width: 18 },
                { header: `Ratio vs promedio ${categoriaMavesa} (%)`, value: (r) => r.ratioPct, width: 26 },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {rendimientoVsMavesaData.puntos.length > 0 ? (
            <>
              <div className="relative">
                {ratioAcumuladoMavesa && (
                  <div
                    className="absolute right-0 top-0 z-10 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 pointer-events-none"
                    title={`Promedio de los ${ratioAcumuladoMavesa.dias} ratios diarios del período.`}
                  >
                    {/* Sin "meta 4%": Margarina/Mayonesa no tienen meta (DIENN,
                        28-08-2026), solo el ratio. Mismos tamaños que el cuadro
                        del gráfico de PAN, para que se lea en la captura. */}
                    <p className="text-xs uppercase tracking-wide text-slate-500 leading-none">
                      Ratio acumulado
                    </p>
                    <p
                      className={`text-2xl font-bold leading-tight ${
                        ratioAcumuladoMavesa.pct >= 4 ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {ratioAcumuladoMavesa.pct.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%
                    </p>
                  </div>
                )}
                <RendimientoVsMavesaChart
                  data={rendimientoVsMavesaData}
                  categoriaLabel={categoriaMavesa === "margarina" ? "Margarina" : "Mayonesa"}
                  showReferenciaDiario={showReferenciaMavesaDiario}
                  ratiosCiudad={ratiosMavesaPorCiudad}
                  showRatioCiudades={ratioPorCiudadMavesa}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Promedio {categoriaMavesa === "margarina" ? "Margarina" : "Mayonesa"}:{" "}
                <span className="font-medium text-slate-600">
                  {rendimientoVsMavesaData.promedioReferencia.toLocaleString("es-VE", { maximumFractionDigits: 1 })}{" "}
                  kg/día
                </span>{" "}
                ({rendimientoVsMavesaData.totalReferenciaKg.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg ÷{" "}
                {rendimientoVsMavesaData.diasPeriodo} días hábiles, del {rendimientoVsMavesaData.desde} al{" "}
                {rendimientoVsMavesaData.hasta}) · aportado por{" "}
                <span className="font-medium text-slate-600">
                  {rendimientoVsMavesaData.clientesConCompra} de {rendimientoVsMavesaData.clientesEnCartera} PDV
                </span>{" "}
                de la cartera del corte
              </p>
            </>
          ) : (
            <div className="h-[370px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📉</p>
                <p>Sin datos todavía.</p>
                <p className="text-xs mt-1">
                  Falta cargar el reporte de referencia de {categoriaMavesa === "margarina" ? "Margarina" : "Mayonesa"}.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      {/* ── Efectividad y volumen acumulado (total + comparativo por ciudad) ── */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Efectividad y volumen acumulado</h2>
          <p className="text-sm text-slate-400">
            Total (ambas ciudades) y el comparativo por ciudad. Cada gráfico usa la granularidad seleccionada.
          </p>
        </div>
        <ExportExcelMultiButton
          filename="Efectividad — 3 gráficos"
          label="Bajar los 3 (Excel)"
          sheets={efectividadExcelSheets}
        />
      </div>

      {/* ── Total acumulado (día/semana/mes, ambas ciudades y modelos) ───── */}
      {carteraTotalDiaData.length > 0 && (
        <Card className="mb-6 print-avoid-break">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Total acumulado (ambas ciudades y modelos)</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                Barras: Radar por período (kg). Línea de efectividad (
                {carteraMetrica === "activos" ? "activos" : carteraMetrica === "facturados" ? "facturados" : "pedidos"}),
                según la métrica seleccionada — <span style={{ color: efectividadColor }} className="font-medium">
                {carteraMetrica === "activos" ? "Radar (rojo)" : carteraMetrica === "facturados" ? "Facturado (azul marino)" : "Pedidos (naranja)"}
                </span>. Series opcionales: activación por Radar del modelo{" "}
                <span className="font-medium text-[#4f7a5c]">Directo</span> y{" "}
                <span className="font-medium text-[#8a6d3b]">Indirecto</span>. Con los botones{" "}
                <span className="font-medium">Efectividad</span> y <span className="font-medium">Modelos</span> alternas
                cada línea entre el valor del período (Día) y el{" "}
                <span className="font-medium">acumulado</span> (activos ÷ cartera total). Las barras se pueden desglosar
                por modelo (<span className="font-medium">Ventas Directo / Indirecto</span>) o por ciudad (
                <span className="font-medium">Ventas Cumaná / Cabudare</span>, en dos tonos de azul que se repiten en
                sus líneas de activación), y la línea de efectividad total se apaga con{" "}
                <span className="font-medium">Línea total</span>. <span className="font-medium">Total aterrizado</span>{" "}
                muestra la activación acumulada contra la cartera de hoy completa desde el día 1 (mismo denominador en todas
                las fechas, sin los saltos por ampliación de cartera); también por ciudad, y con{" "}
                <span className="font-medium">Aterrizado: A escala</span> sin los PDV inactivos de segmentos no vendibles.
                También hay aterrizada por modelo (<span className="font-medium">Directo / Indirecto aterrizado</span>).
                El resto aplica también a los gráficos comparativos
                (Cumaná / Cabudare).
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 print:hidden">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* Métrica de efectividad: mismo denominador (a visitar), distinto numerador. */}
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                  {(
                    [
                      ["activos", "Activos (Radar)"],
                      ["facturados", "Facturados"],
                      ["pedidos", "Pedidos"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setCarteraMetrica(key)}
                      className={`px-3 py-1.5 transition-colors ${
                        carteraMetrica === key ? "bg-red-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Granularidad propia de este gráfico (día / semana / mes). */}
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                  {GRANULARITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setTotalGranularity(opt.key)}
                      className={`px-3 py-1.5 transition-colors ${
                        totalGranularity === opt.key
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {/* Toggles de activación por modelo (independientes, prenden/apagan). */}
                <button
                  onClick={() => setShowDirectoTotal((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    showDirectoTotal
                      ? "border-[#4f7a5c] bg-[#4f7a5c] text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Activación Directo
                </button>
                <button
                  onClick={() => setShowIndirectoTotal((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    showIndirectoTotal
                      ? "border-[#8a6d3b] bg-[#8a6d3b] text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Activación Indirecto
                </button>
                {/* Vista día ↔ acumulado, separada: línea principal vs líneas por modelo. */}
                <button
                  onClick={() => setEfectividadAcum((v) => !v)}
                  title="Cambia la línea principal entre el valor del período y el acumulado (activos ÷ cartera total)"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    efectividadAcum
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Efectividad: {efectividadAcum ? "Acumulado" : "Día"}
                </button>
                <button
                  onClick={() => setModeloAcum((v) => !v)}
                  title="Cambia las líneas de modelo (Directo/Indirecto) entre el valor del período y el acumulado"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    modeloAcum
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Modelos: {modeloAcum ? "Acumulado" : "Día"}
                </button>
                {/* Barras de volumen Radar del período por modelo (independientes). */}
                <button
                  onClick={() => setVentasDirecto((v) => !v)}
                  title="Muestra las barras de volumen Radar del período del modelo Directo"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    ventasDirecto
                      ? "border-[#4f7a5c] bg-[#4f7a5c] text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Ventas Directo
                </button>
                <button
                  onClick={() => setVentasIndirecto((v) => !v)}
                  title="Muestra las barras de volumen Radar del período del modelo Indirecto"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    ventasIndirecto
                      ? "border-[#8a6d3b] bg-[#8a6d3b] text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Ventas Indirecto
                </button>
                {/* Mismas barras pero por ciudad — la etiqueta lleva kg + ciudad. */}
                <button
                  onClick={() => setVentasCumana((v) => !v)}
                  title="Muestra las barras de volumen Radar del período de Cumaná (solo kg; la ciudad se identifica por color)"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    ventasCumana
                      ? "border-sky-700 bg-sky-700 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Ventas Cumaná
                </button>
                <button
                  onClick={() => setVentasCabudare((v) => !v)}
                  title="Muestra las barras de volumen Radar del período de Cabudare (solo kg; la ciudad se identifica por color)"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    ventasCabudare
                      ? "border-blue-900 bg-blue-900 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Ventas Cabudare
                </button>
                {/* Prende/apaga la línea de efectividad total (la de la métrica activa). */}
                <button
                  onClick={() => setShowEfectividadTotal((v) => !v)}
                  title="Muestra u oculta la línea de efectividad total (Radar / Facturado / Pedidos)"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    showEfectividadTotal
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Línea total: {showEfectividadTotal ? "Visible" : "Oculta"}
                </button>
                {/* Capas de efectividad por ciudad, superpuestas a la total (independientes). */}
                <button
                  onClick={() => setCiudadAcum((v) => !v)}
                  title="Superpone la efectividad ACUMULADA de cada ciudad (Cumaná / Cabudare)"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    ciudadAcum
                      ? "border-sky-700 bg-sky-700 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Ciudad Acum.
                </button>
                <button
                  onClick={() => setCiudadDia((v) => !v)}
                  title="Superpone la efectividad DIARIA (no acumulada) de cada ciudad (Cumaná / Cabudare)"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    ciudadDia
                      ? "border-blue-900 bg-blue-900 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Ciudad Día
                </button>
                {/* Activación "a escala": misma acumulada de la ciudad pero
                    contra la cartera alcanzable — sin los inactivos de
                    licorerías, CS, farmacias, mascotas y animales. */}
                <button
                  onClick={() => setEscalaCumanaOn((v) => !v)}
                  title={`Activación acumulada de Cumaná sin los ${bundles.cumana.activacionAjustada.descartados} PDV inactivos de segmentos no vendibles`}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    escalaCumanaOn
                      ? "border-teal-600 bg-teal-600 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Cumaná a escala
                </button>
                <button
                  onClick={() => setEscalaCabudareOn((v) => !v)}
                  title={`Activación acumulada de Cabudare sin los ${bundles.barquisimeto_este.activacionAjustada.descartados} PDV inactivos de segmentos no vendibles`}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    escalaCabudareOn
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Cabudare a escala
                </button>
                {/* Activación TOTAL a escala: el piloto completo contra la cartera
                    de segmentos foco. Siempre es activación por Radar, igual que
                    las de ciudad, sin importar la métrica elegida arriba. */}
                <button
                  onClick={() => setEscalaTotalOn((v) => !v)}
                  title={`Activación acumulada del total sin los ${bundles.TOTAL.activacionAjustada.descartados} PDV inactivos de segmentos no vendibles (solo segmentos foco)`}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    escalaTotalOn
                      ? "border-emerald-800 bg-emerald-800 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Total a escala
                </button>
                {/* Aterrizada por ciudad: la acumulada de cada ciudad contra su cartera de hoy. */}
                <button
                  onClick={() => setAterrizadaCumanaOn((v) => !v)}
                  title="Activación acumulada de Cumaná contra su cartera de hoy completa desde el día 1"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    aterrizadaCumanaOn
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Cumaná aterrizado
                </button>
                <button
                  onClick={() => setAterrizadaCabudareOn((v) => !v)}
                  title="Activación acumulada de Cabudare contra su cartera de hoy completa desde el día 1"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    aterrizadaCabudareOn
                      ? "border-violet-900 bg-violet-900 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Cabudare aterrizado
                </button>
                {/* Aterrizada por modelo: la acumulada de Directo / Indirecto contra la
                    cartera de hoy de cada modelo (con el botón de escala de abajo). */}
                <button
                  onClick={() => setAterrizadaDirectoOn((v) => !v)}
                  title="Activación acumulada del modelo Directo contra su cartera de hoy completa desde el día 1"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    aterrizadaDirectoOn
                      ? "border-[#4f7a5c] bg-[#4f7a5c] text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Directo aterrizado
                </button>
                <button
                  onClick={() => setAterrizadaIndirectoOn((v) => !v)}
                  title="Activación acumulada del modelo Indirecto contra su cartera de hoy completa desde el día 1"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    aterrizadaIndirectoOn
                      ? "border-[#8a6d3b] bg-[#8a6d3b] text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Indirecto aterrizado
                </button>
                {/* Total aterrizado: la acumulada de siempre contra la cartera de hoy completa
                    desde el día 1 (denominador fijo, sin saltos por ampliación). */}
                <button
                  onClick={() => setAterrizadaTotalOn((v) => !v)}
                  title="La activación acumulada de siempre, pero contra la cartera de hoy completa desde el día 1: mismo denominador en todas las fechas, sin saltos por ampliación de cartera"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    aterrizadaTotalOn
                      ? "border-violet-700 bg-violet-700 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Total aterrizado
                </button>
                {/* Las tres aterrizadas con todos los segmentos o "a escala" (sin los
                    PDV inactivos de segmentos no vendibles). */}
                <button
                  onClick={() => setAterrizadaEscala((v) => !v)}
                  title="Cambia las líneas aterrizadas entre la cartera de hoy completa y la cartera de hoy sin los PDV inactivos de segmentos no vendibles (a escala)"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    aterrizadaEscala
                      ? "border-violet-700 bg-violet-100 text-violet-900"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Aterrizado: {aterrizadaEscala ? "A escala" : "Todos los segmentos"}
                </button>
                {/* Cuál ciudad se superpone (aplica a ambas capas de ciudad). */}
                <select
                  value={ciudadSel}
                  onChange={(e) => setCiudadSel(e.target.value as "ambas" | "cumana" | "barquisimeto_este")}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
                >
                  <option value="ambas">Ambas ciudades</option>
                  <option value="cumana">Solo Cumaná</option>
                  <option value="barquisimeto_este">Solo Cabudare</option>
                </select>
              </div>
              <ExportExcelButton
                filename="Cartera total acumulado"
                rows={filtrarPorDias(carteraPorSegmento.totalPorDia[totalGranularity], (p) => p.dia, diasFiltro)}
                chart={TOTAL_ACUM_CHART}
                columns={TOTAL_ACUM_COLUMNS}
              />
            </div>
          </CardHeader>
          <CardContent>
            <CarteraTotalDiaChart
              data={carteraTotalDiaData}
              showEfectividad={showEfectividadTotal}
              showDirecto={showDirectoTotal}
              showIndirecto={showIndirectoTotal}
              efectividadColor={efectividadColor}
              showVentasDirecto={ventasDirecto}
              showVentasIndirecto={ventasIndirecto}
              showVentasCumana={ventasCumana}
              showVentasCabudare={ventasCabudare}
              showCiudadAcum={ciudadAcum}
              showCiudadDia={ciudadDia}
              showCumana={ciudadSel !== "barquisimeto_este"}
              showCabudare={ciudadSel !== "cumana"}
              showEscalaCumana={escalaCumanaOn}
              showEscalaCabudare={escalaCabudareOn}
              showEscalaTotal={escalaTotalOn}
              showAterrizadaTotal={aterrizadaTotalOn}
              showAterrizadaCumana={aterrizadaCumanaOn}
              showAterrizadaCabudare={aterrizadaCabudareOn}
              showAterrizadaDirecto={aterrizadaDirectoOn}
              showAterrizadaIndirecto={aterrizadaIndirectoOn}
            />
          </CardContent>
        </Card>
      )}

      <Separator className="mb-6 print:hidden" />

      {/* ── Filtro de granularidad temporal (Demanda Insatisfecha y Cobertura) ── */}
      <div className="flex items-center gap-2 mb-6 print:hidden">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ver por</span>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setGranularity(opt.key)}
              className={`px-3 py-1.5 transition-colors ${
                granularity === opt.key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Demanda Insatisfecha (Pedido / Facturado / Radar acumulados) ─── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Demanda Insatisfecha (venta acumulada)</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Pedido, Facturado y Radar de Panquecitas, acumulados en el tiempo. La brecha entre Pedido y las otras
              dos líneas es la demanda que todavía no se resuelve — si se mantiene o si se estabiliza.
            </p>
          </div>
          <ExportExcelButton
            filename="datos_demanda_insatisfecha"
            rows={demandaPoints}
            columns={[
              { header: "Período", value: (r) => r.label },
              { header: "Pedido (kg)", value: (r) => r.pedidoKg },
              { header: "Facturado (kg)", value: (r) => r.facturadoKg },
              { header: "Radar (kg)", value: (r) => r.radarKg },
            ]}
          />
        </CardHeader>
        <CardContent>
          {demandaPoints.length > 0 ? (
            <DemandaInsatisfechaChart data={demandaPoints} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📈</p>
                <p>Sin datos de Pedidos y Facturado o Radar de Panquecitas todavía.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Gráfico 1: Venta acumulada, Recompra y Activación (combo) ────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div>
            <CardTitle>Venta acumulada, Recompra y Activación de Clientes</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Barras: venta acumulada (Radar). Líneas (eje derecho, %): tasa de recompra —{" "}
              <span className="font-medium">clientes con 2 o más fechas de compra ÷ clientes que compraron</span>, un
              conteo de clientes únicos — y % de activación de clientes sobre la cartera vigente en cada período (la
              cartera se amplió el 14 y el 24 de agosto; cada punto usa la cartera que existía en esa fecha).
              {/* El volumen suma todo el Radar, igual que la tarjeta; las tasas
                  solo cuentan cartera. Se declara la diferencia para que nadie
                  tenga que deducirla. */}
              {ventaFueraKg > 0 && (
                <>
                  {" "}
                  El volumen incluye{" "}
                  <span className="font-medium">
                    {ventaFueraKg.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg
                  </span>{" "}
                  de clientes fuera de cartera; las tasas no los cuentan.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {GRANULARITY_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setComboGranularity(opt.key)}
                  className={`px-3 py-1.5 transition-colors ${
                    comboGranularity === opt.key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Recompra foco: la misma tasa contando solo clientes de segmentos
                foco (sin licorerías, CS, farmacias de barrio, mascotas ni animales). */}
            <button
              onClick={() => setRecompraFocoOn((v) => !v)}
              title="Tasa de recompra contando solo clientes de segmentos foco"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                recompraFocoOn
                  ? "border-green-900 bg-green-900 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Recompra foco
            </button>
            <ExportExcelButton
              filename="datos_venta_recompra_activacion"
              rows={comboPoints}
              columns={[
                { header: "Período", value: (r) => r.label },
                { header: "Venta acumulada (kg)", value: (r) => r.ventaAcumuladaKg },
                { header: "Tasa de recompra (%)", value: (r) => r.recompraPct },
                { header: "Tasa de recompra foco (%)", value: (r) => r.recompraFocoPct },
                { header: "Activación (%)", value: (r) => r.activacionPct },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {comboPoints.length > 0 ? (
            <VentaRecompraActivacionChart data={comboPoints} showRecompraFoco={recompraFocoOn} />
          ) : (
            <div className="h-[320px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📈</p>
                <p>Sin datos de Radar de Panquecitas. Carga el reporte SAP.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Posición del producto en el PDV (posición ↔ Sell-Out) ─────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Posición del producto en el PDV</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              {posicionVista === "posicion"
                ? "Dónde ubican el producto los mercaderistas, entre clientes con presencia del producto. Un cliente puede contar en más de una ubicación."
                : "Relación entre la ubicación del producto y el Sell-Out (SAP − inventario) que generó. Un cliente con el producto en varias ubicaciones suma en cada una."}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 print:hidden">
            {/* Filtro: ver por conteo de clientes (posición) o por Sell-Out generado. */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  ["posicion", "Por posición"],
                  ["sellout", "Por Sell-Out"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPosicionVista(key)}
                  className={`px-3 py-1.5 transition-colors ${
                    posicionVista === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {posicionVista === "posicion" ? (
              <ExportExcelButton
                filename={`Posición en PDV — ${filtroTexto}`}
                rows={bundle.posicionPdv}
                columns={[
                  { header: "Ubicación", value: (r) => r.categoria, width: 34 },
                  { header: "Clientes", value: (r) => r.clientes, width: 14 },
                ]}
              />
            ) : (
              <ExportExcelButton
                filename={`Sell-Out por posición en PDV — ${filtroTexto}`}
                rows={sellOutPorPosicion}
                columns={[
                  { header: "Ubicación", value: (r) => r.categoria, width: 34 },
                  { header: "Sell-Out (kg)", value: (r) => r.sellOutKg, width: 16 },
                  { header: "Clientes", value: (r) => r.clientes, width: 14 },
                ]}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {posicionVista === "posicion" ? (
            bundle.posicionPdv.some((p) => p.clientes > 0) ? (
              <PosicionPdvChart data={bundle.posicionPdv} />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <p className="text-4xl mb-2">📍</p>
                  <p>Sin datos de ubicación del producto todavía.</p>
                </div>
              </div>
            )
          ) : sellOutPorPosicion.length > 0 ? (
            <SellOutPorPosicionChart data={sellOutPorPosicion} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📊</p>
                <p>Sin datos de Sell-Out por posición todavía.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Precio Correcto: PVP en campo vs objetivo por ciudad (Vista A/B) ── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Precio Correcto (PVP en campo vs objetivo)</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              {precioVista === "A"
                ? "Dirección de la desviación por ciudad: cuántos PDV están por debajo (subprecio), en el objetivo, o por encima (sobreprecio) del PVP de su ciudad."
                : "Detalle: cada punto es el precio exacto reportado en un PDV (última visita), por presentación, coloreado según su desviación vs el objetivo."}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 print:hidden">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Toggle de vista: A = dirección de desviación · B = detalle de precios. */}
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                {(
                  [
                    ["A", "Dirección"],
                    ["B", "Detalle"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPrecioVista(key)}
                    className={`px-3 py-1.5 transition-colors ${
                      precioVista === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Filtro por ciudad. */}
              <select
                value={precioCiudad}
                onChange={(e) => setPrecioCiudad(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700"
              >
                <option value="TODAS">Todas las ciudades</option>
                {precioCiudades.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <ExportExcelButton
              filename={`Precio Correcto${precioCiudad !== "TODAS" ? ` — ${precioCiudad}` : ""}`}
              rows={precioFiltrado}
              columns={[
                { header: "Ciudad", value: (r) => r.ciudad, width: 14 },
                { header: "Cliente", value: (r) => r.cliente, width: 34 },
                { header: "Presentación", value: (r) => r.presentacion, width: 14 },
                { header: "Precio (USD)", value: (r) => r.precio, width: 14 },
                { header: "Objetivo (USD)", value: (r) => r.target, width: 14 },
                { header: "Desviación (USD)", value: (r) => Math.round((r.precio - r.target) * 100) / 100, width: 16 },
                { header: "Estado", value: (r) => r.estado, width: 14 },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {precioFiltrado.length > 0 ? (
            <PrecioCorrectoChart rows={precioFiltrado} vista={precioVista} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">🏷️</p>
                <p>Sin precios capturados en campo todavía.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="mb-6 print:hidden" />

      {/* ── Lista desplegable: Sell-Out por cliente (descargable) ──────── */}
      <Card className="mb-6 print:hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <button
            type="button"
            onClick={() => setSellOutClienteOpen((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-slate-400">{sellOutClienteOpen ? "▾" : "▸"}</span>
            <div>
              <CardTitle>Sell-Out por cliente ({sellOutPorCliente.length})</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                Sell-Out = <span className="font-semibold">reporte SAP (Radar) − inventario en PDV</span> (lo que contó
                el mercaderista en su última visita: anaquel + depósito). No requiere dos visitas. &quot;Ajuste&quot; =
                había más inventario que lo registrado por SAP (diferencia negativa llevada a 0).
              </p>
            </div>
          </button>
          <ExportExcelButton
            filename={`Sell-Out por cliente — ${filtroTexto}`}
            rows={sellOutPorCliente}
            columns={[
              { header: "Código SAP", value: (r) => r.sapCode ?? "", width: 16 },
              { header: "Cliente", value: (r) => r.name, width: 34 },
              { header: "Fuente", value: (r) => r.fuente, width: 16 },
              { header: "Sell-In SAP (kg)", value: (r) => r.sellInSapKg, width: 16 },
              { header: "Inventario PDV (kg)", value: (r) => r.inventarioPdvKg, width: 18 },
              { header: "Sell-Out (kg)", value: (r) => r.sellOutKg, width: 14 },
              { header: "Ajuste inventario", value: (r) => (r.ajusteInventario ? "Sí" : "No"), width: 16 },
            ]}
          />
        </CardHeader>
        {sellOutClienteOpen && (
          <CardContent className="p-0">
            {sellOutPorCliente.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                Sin visitas de mercaderista para el corte de filtros vigente.
              </p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Fuente</TableHead>
                      <TableHead className="text-right">Sell-In SAP (kg)</TableHead>
                      <TableHead className="text-right">Inventario PDV (kg)</TableHead>
                      <TableHead className="text-right">Sell-Out (kg)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sellOutPorCliente.map((r) => (
                      <TableRow key={r.locationId}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-slate-500">{r.fuente}</TableCell>
                        <TableCell className="text-right">
                          {r.sellInSapKg.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.inventarioPdvKg.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.sellOutKg.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
                          {r.ajusteInventario && <span className="text-xs text-amber-600"> (ajuste)</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Cruce mercaderistas vs Radar: dónde hay producto sin vender ─── */}
      <CruceMercaderistaRadar
        data={cruceMercaderistaRadar}
        sector={filter}
        filtroTexto={filtroTexto}
        sectorLabels={sectorLabels}
      />

      <Separator className="mb-4 print:hidden" />

      {/* ── BLOQUE 3 · Métricas complementarias (tarjetas restantes) ────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 print-avoid-break">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2 text-muted-foreground">
              Running de Ventas
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Kg / sem</span>
                <span className="font-bold text-slate-900">
                  {bundle.runningVentas.kgPerWeek.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Días hábiles de inv.</span>
                <span className="font-bold text-slate-900">{bundle.runningVentas.diasInventario}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ton → {bundle.runningVentas.proyeccionMeses} meses</span>
                <span className="font-bold text-slate-900">
                  {bundle.runningVentas.proyeccionToneladas.toLocaleString("es-VE", { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <KpiCard
          title="Recompra de Franquiciados"
          value={bundle.recompraFranquiciados.compradoras > 0 ? `${bundle.recompraFranquiciados.recompraPct}%` : "s/d"}
          annotation={[
            `${bundle.recompraFranquiciados.conRecompra} con ≥2 fechas de facturación`,
            `${bundle.recompraFranquiciados.compradoras} de ${bundle.recompraFranquiciados.total} franquiciados han facturado`,
          ]}
          subtitle={`Pedidos y Facturado (Cantidad Facturada > 0) — ${filtroTexto}`}
          product="panquecitas"
        />

        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2 text-muted-foreground">
              Potencial 3M con la cartera actual
            </p>
            {potencial3M ? (
              <>
                <div className="space-y-1 text-sm">
                  {(
                    [
                      ["Clientes con Panquecitas", potencial3M.con],
                      ["Clientes sin Panquecitas", potencial3M.sin],
                      ["Cartera completa", potencial3M.total],
                    ] as const
                  ).map(([label, p]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-slate-500">
                        {label} <span className="text-xs text-slate-400">({p.clientes.toLocaleString("es-VE")})</span>
                      </span>
                      <span className="font-bold text-slate-900 whitespace-nowrap">
                        {Math.round(p.kgPeriodo).toLocaleString("es-VE")} kg
                        <span className="text-xs font-normal text-slate-400">
                          {" "}
                          · {Math.round(p.kgMes).toLocaleString("es-VE")}/mes
                        </span>
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-2 border-t pt-1 mt-1">
                    <span className="text-slate-500">Vendido (Radar)</span>
                    <span className="font-bold text-slate-900 whitespace-nowrap">
                      {Math.round(bundle.volumenRadarAcumulado.panquecitasTon * 1000).toLocaleString("es-VE")} kg
                      <span className="text-xs font-normal text-slate-400">
                        {" "}
                        ·{" "}
                        {Math.round(
                          ((bundle.volumenRadarAcumulado.panquecitasTon * 1000) / potencial3M.total.kgPeriodo) * 100
                        )}
                        % del potencial
                      </span>
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  4% de la Harina PAN de {potencial3M.meses} meses ({potencial3M.desde} a {potencial3M.hasta}) de los
                  clientes de la cartera de hoy, como si hubiesen estado desde el inicio. Lo vendido es el Radar de
                  Panquecitas acumulado desde el arranque (incluye PDV fuera de cartera) — {filtroTexto}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">Sin reporte PAN 3M cargado.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2 text-muted-foreground">
              Mix de Producto
            </p>
            {mixProducto.every((m) => m.toneladas === 0) ? (
              <p className="text-sm text-slate-400">
                Sin Radar por presentación — carga el reporte de Carga Radar
                (Panquecitas 400g y 800g).
              </p>
            ) : (
              <div className="flex items-baseline gap-4">
                {mixProducto.map((m) => (
                  <div key={m.variant}>
                    <p className="text-2xl font-bold text-slate-900">{m.toneladas} Ton</p>
                    <p className="text-xs text-slate-500">{m.variant}</p>
                    <p className="text-xs text-slate-400">{m.pctSobreTotal}% del total Radar</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <KpiCard
          title="Tasa de Conversión — Degustaciones"
          value={`${bundle.conversionDegustaciones.rate}%`}
          annotation={[
            `${bundle.conversionDegustaciones.samples.toLocaleString("es-VE")} degustaciones entregadas`,
            `${bundle.conversionDegustaciones.conversions.toLocaleString("es-VE")} se convirtieron en compra`,
          ]}
          subtitle={`Tickets entregados vs. recibidos — ${filtroTexto}`}
          product="panquecitas"
        />
        <KpiCard
          title="Días de Inventario en Calle"
          value={
            rotacion.coberturaDias == null
              ? "s/d"
              : rotacion.coberturaDias.toLocaleString("es-VE", { maximumFractionDigits: 1 })
          }
          subtitle={`Días hábiles · ponderado: Σ inventario ÷ Σ ritmo entre visitas · ${rotacion.pdvValidos} PDV medidos`}
        />
        <KpiCard
          title="Clientes en Stock Out"
          value={String(bundle.stockOut.enStockOut)}
          subtitle={`≤ ${STOCK_OUT_UMBRAL_DIENN} unid. (directo) / ≤ ${STOCK_OUT_UMBRAL_INDIRECTO} (indirecto) en anaquel + depósito · de ${bundle.stockOut.universo} clientes del piloto con venta y acceso al depósito`}
          critical={bundle.stockOut.enStockOut > 0}
        />
        <KpiCard
          title="Material POP con Preciador"
          value={bundle.materialPopPreciador.poblacion > 0 ? `${bundle.materialPopPreciador.ratio}%` : "s/d"}
          subtitle={`${bundle.materialPopPreciador.conPreciador} de ${bundle.materialPopPreciador.poblacion} visitados con ventas SAP`}
          product="panquecitas"
        />
      </div>

      {/* ── Impacto del bloqueo del 400g (15-09) ── */}
      <Impacto400g data={impacto400g} sector={filter} filtroTexto={filtroTexto} sectorLabels={sectorLabels} />

      {/* ── Lista desplegable: Stock Out (con ubicación) ───────────────── */}
      <Card className="mb-6 print:hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <button
            type="button"
            onClick={() => setStockOutOpen((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-slate-400">{stockOutOpen ? "▾" : "▸"}</span>
            <div>
              <CardTitle>Clientes en Stock Out ({bundle.stockOut.enStockOut})</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                Clientes con venta con pocas unidades en tienda (anaquel + depósito): ≤ {STOCK_OUT_UMBRAL_DIENN} en
                modelo directo, ≤ {STOCK_OUT_UMBRAL_INDIRECTO} en modelo indirecto. Solo entra la cartera del plan
                piloto (la tanda &quot;Piloto original&quot;), que es la única que visitan los mercaderistas, y dentro
                de ella solo los PDV cuya última visita tuvo acceso al depósito: sin ese acceso no se puede afirmar que
                falte producto, así que quedan fuera del conteo y del universo. Incluye la ubicación del producto.
              </p>
            </div>
          </button>
          <ExportExcelButton
            filename={`Stock Out — ${filtroTexto}`}
            rows={bundle.stockOut.clientes}
            columns={[
              { header: "Código SAP", value: (r) => r.sapCode ?? "", width: 16 },
              { header: "Cliente", value: (r) => r.name, width: 34 },
              { header: "Unidades en tienda", value: (r) => r.unidadesTienda, width: 18 },
              { header: "Ubicación", value: (r) => r.ubicacion, width: 40 },
            ]}
          />
        </CardHeader>
        {stockOutOpen && (
          <CardContent className="p-0">
            {bundle.stockOut.clientes.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                Ningún cliente con venta está en stock out (≤ {STOCK_OUT_UMBRAL_DIENN} unid. directo / ≤ {STOCK_OUT_UMBRAL_INDIRECTO} indirecto).
              </p>
            ) : (
              <div className="max-h-[360px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Unidades en tienda</TableHead>
                      <TableHead>Ubicación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bundle.stockOut.clientes.map((c: StockOutClientePoint) => (
                      <TableRow key={c.locationId}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{c.unidadesTienda}</TableCell>
                        <TableCell className="text-slate-500">{c.ubicacion}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Separator className="mb-6 print:hidden" />

      {/* ── Ranking de Volumen por Segmento de cartera ─────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Ranking de Volumen por Segmento</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Volumen de Panquecitas (Carga Radar) por <span className="font-medium">Segmento de Clientes 2</span> de la
              Cartera Consolidada, de mayor a menor. El promedio diario por cliente es el volumen del segmento ÷ sus
              clientes con venta ÷ los días hábiles desde el 03-08-2026. Con el botón de la derecha el panel de volumen
              alterna entre kg y el porcentaje que representa ese segmento sobre el total.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 print:hidden">
            {/* Volumen en kg o como participación sobre el total de segmentos. */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  [false, "Kg"],
                  [true, "% del total"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={label}
                  onClick={() => setRankingComoPct(key)}
                  className={`px-3 py-1.5 transition-colors ${
                    rankingComoPct === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          <ExportExcelButton
            filename={`Ranking de volumen por segmento — ${filtroTexto}`}
            rows={bundle.rankingSegmentos}
            columns={[
              { header: "Segmento", value: (r) => r.segmento, width: 30 },
              { header: "Volumen (kg)", value: (r) => r.volumenKg, width: 16 },
              { header: "Volumen (Ton)", value: (r) => r.volumenTon, width: 16 },
              { header: "Clientes con venta", value: (r) => r.clientesConVenta, width: 20 },
              { header: "Clientes en cartera", value: (r) => r.clientesCartera, width: 20 },
              { header: "Prom. diario x cliente (kg)", value: (r) => r.promedioDiarioPorCliente, width: 26 },
            ]}
          />
          </div>
        </CardHeader>
        <CardContent>
          {bundle.rankingSegmentos.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">🏷️</p>
                <p>Sin segmentación de cartera todavía.</p>
                <p className="text-xs mt-1">
                  Carga la Cartera Consolidada con la columna &quot;Segmento de Clientes 2&quot;.
                </p>
              </div>
            </div>
          ) : (
            <RankingSegmentoChart data={bundle.rankingSegmentos} comoPct={rankingComoPct} />
          )}
        </CardContent>
      </Card>

      {/* ── Tabla: Detalle de Clientes ─────────────────────────────────── */}
      <Card className="mb-6 print:hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Detalle de Clientes (# clts y ton vendidas)</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Ordenado por volumen de Panquecitas (Carga Radar): el segmento que más vende queda arriba y va marcado
              como <span className="font-medium text-emerald-700">mayor volumen</span>.
            </p>
          </div>
          <ExportExcelButton
            filename={`Detalle de clientes por segmento — ${filtroTexto}`}
            rows={bundle.detalleSegmentos}
            columns={[
              { header: "Segmento", value: (r) => r.segmento, width: 30 },
              { header: "Vol. Panquecitas (Ton)", value: (r) => r.panquecitasTon, width: 22 },
              { header: "Activación x seg (%)", value: (r) => r.penetracionPct, width: 22 },
              { header: "Recompra x seg (%)", value: (r) => r.recompraPct, width: 22 },
              { header: "% HPM vs Base", value: (r) => r.hpmVsBasePct, width: 18 },
              { header: "% HPM TOTAL", value: (r) => r.hpmTotalPct, width: 18 },
            ]}
          />
        </CardHeader>
        <CardContent className="p-0">
          {bundle.detalleSegmentos.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Sin PDV en el universo de sectores piloto.</p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Segmento</TableHead>
                    <TableHead className="text-right">Vol. Panquecitas (Ton)</TableHead>
                    <TableHead className="text-right">Activación x seg (%)</TableHead>
                    <TableHead className="text-right">Recompra x seg (%)</TableHead>
                    <TableHead className="text-right">% HPM vs Base</TableHead>
                    <TableHead className="text-right">% HPM TOTAL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundle.detalleSegmentos.map((row) => (
                    <TableRow key={row.segmento}>
                      <TableCell className="font-medium">
                        {row.segmento}
                        {row.segmento === segmentoTopVolumen && (
                          <span className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                            mayor volumen
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {row.panquecitasTon.toLocaleString("es-VE", { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">{row.penetracionPct}%</TableCell>
                      <TableCell className="text-right">{row.recompraPct}%</TableCell>
                      <TableCell className="text-right">{row.hpmVsBasePct}%</TableCell>
                      <TableCell className="text-right">{row.hpmTotalPct}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Ventas de los últimos 3 meses (Mavesa + Harina PAN) por ciudad ── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div>
            <CardTitle>Ventas Últimos 3 Meses — Margarina, Mayonesa y Harina PAN</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Mayo-julio (reporte de referencia), por ciudad — toda la cartera del piloto. Con{" "}
              <span className="font-medium">Cumaná = 100%</span> se superpone una línea que toma el volumen de Cumaná
              como base y muestra cuánto representa Cabudare frente a él, categoría por categoría (siempre en kg,
              aunque las barras estén en % del total). Los porcentajes debajo de las barras están explicados al pie
              del gráfico. El ratio vs. <span className="font-medium">Harina PAN</span> sigue el botón{" "}
              <span className="font-medium">Foco con recompra / Con recompra / Cartera completa</span>: clientes con recompra de
              segmentos foco o de cualquier segmento (igual que el gráfico de rendimiento diario), o toda la cartera sin
              filtro de recompra, como se veía originalmente.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  ["foco", "Foco con recompra"],
                  ["todos", "Con recompra"],
                  ["cartera", "Cartera completa"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setVentas3MesesSegmento(key)}
                  title={
                    key === "foco"
                      ? "Ratio Harina PAN con el promedio de los clientes con recompra de segmentos foco"
                      : key === "todos"
                      ? "Ratio Harina PAN con el promedio de los clientes con recompra de cualquier segmento"
                      : "Ratio Harina PAN como originalmente: toda la cartera, sin filtro de recompra"
                  }
                  className={`px-3 py-1.5 transition-colors ${
                    ventas3MesesSegmento === key
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  [false, "Kg"],
                  [true, "% del total"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={label}
                  onClick={() => setVentas3MesesComoPct(key)}
                  className={`px-3 py-1.5 transition-colors ${
                    ventas3MesesComoPct === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Línea de índice con Cumaná como base 100. */}
            <button
              onClick={() => setVentas3MesesIndiceCumana((v) => !v)}
              title="Superpone una línea que toma el volumen de Cumaná como 100% y muestra cuánto es Cabudare frente a él"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                ventas3MesesIndiceCumana
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Cumaná = 100%
            </button>
            {botonSinAmpliacion}
          </div>
        </CardHeader>
        <CardContent>
          {ventas3MesesPorCiudad.length > 0 ? (
            <>
            <Ventas3MesesPorCiudadChart
              data={ventas3MesesPorCiudad}
              comoPct={ventas3MesesComoPct}
              showIndiceCumana={ventas3MesesIndiceCumana}
              ratiosPanquecitas={ratiosPanquecitas3Meses}
            />
            {/* Los % de abajo no se explican solos: hay que decir contra qué se
                miden y en qué unidad se leen. */}
            <p className="text-xs text-slate-400 mt-2">
              La fila rotulada <span className="font-medium text-slate-600">Ratio acumulado · Panquecitas vs
              categoría</span>, debajo de las barras, se lee así: por cada 100 kg de Margarina, Mayonesa o Harina PAN
              que vende la ciudad, cuántos kg de Panquecitas vende. No son parte de la barra —la barra son los kg de
              la categoría en mayo-julio— y cada número va en el color de su ciudad. Es el mismo número del cuadro{" "}
              <span className="font-medium">Ratio acumulado</span> de los gráficos de rendimiento diario (en Harina PAN, el del gráfico de clientes con recompra o, con Cartera completa, el cálculo original; promedio de
              los ratios diarios del período). En <span className="font-medium">Harina PAN</span> el denominador sigue
              el botón de arriba (
              {ventas3MesesSegmento === "foco"
                ? "Foco con recompra"
                : ventas3MesesSegmento === "todos"
                ? "Con recompra"
                : "Cartera completa"}
              ); Margarina y Mayonesa no distinguen esos cortes.
            </p>
            </>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📊</p>
                <p>Sin datos todavía.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Combinaciones del piloto (precio × comunicación) ───────────── */}
      <CombinacionesPilotoTabla data={combinacionesPiloto} />
      <CombinacionesParticipacionCharts
        data={combinacionesPiloto}
        titulo="Cartera actual — ventas por precio y comunicación"
        alcance="la cartera actual"
      />

      {/* ── Las mismas combinaciones, solo cartera del piloto inicial ──── */}
      <CombinacionesPilotoTabla
        data={combinacionesPilotoOriginal}
        titulo="Combinaciones del Piloto — solo cartera del piloto inicial"
        excelFilename="Combinaciones del piloto inicial"
        descripcion={
          <>
            Misma tabla de arriba, pero solo con los{" "}
            <span className="font-medium">
              {combinacionesPilotoOriginal.filas.reduce((s, f) => s + f.clientes, 0) +
                combinacionesPilotoOriginal.sinCombinacion}{" "}
              PDV de la cartera con la que arrancó el piloto
            </span>{" "}
            el 03-08-2026 (tanda &quot;Piloto original&quot;). Deja fuera las ampliaciones posteriores, que entraron más
            tarde y con menos días de venta. Ratios y ventas salen solo de esos PDV.
          </>
        }
      />
      <CombinacionesParticipacionCharts
        data={combinacionesPilotoOriginal}
        titulo="Piloto inicial — ventas por precio y comunicación"
        alcance="los PDV del piloto inicial"
      />

      {/* ── Activación, recompra, ratio y kilos por TANDA de incorporación ── */}
      <TandasClientesTabla tandas={tandasClientes} />

      {/* ── Promedio de venta diaria por SEGMENTO y categoría ──────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between space-y-0">
          <div>
            <CardTitle>Venta Diaria por Segmento de Cliente</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Promedio de <span className="font-medium">kg por día hábil</span> de cada categoría en cada segmento,
              sobre el <span className="font-medium">universo</span> de la cartera (todos los PDV, hayan comprado o
              no). Debajo de cada barra, el ratio de Panquecitas contra esa categoría en ese segmento.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {/* La ciudad sale del gráfico y pasa a ser un corte: es lo que evita
                duplicar todas las barras. */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  ["TOTAL", "Total"],
                  ["cumana", "Cumaná"],
                  ["barquisimeto_este", "Cabudare"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSegCiudad(key)}
                  className={`px-3 py-1.5 transition-colors ${
                    segCiudad === key ? "bg-sky-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(
                [
                  [false, "kg/día"],
                  [true, "kg/día por PDV"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={label}
                  onClick={() => setSegPorPdv(key)}
                  className={`px-3 py-1.5 transition-colors ${
                    segPorPdv === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSegPanquecitas((v) => !v)}
              title="Agrega Panquecitas como cuarta barra. Su ritmo es mucho menor y achica la escala de las otras tres."
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                segPanquecitas
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              + Panquecitas
            </button>
            <button
              onClick={() => setSegTodos((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                segTodos
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {segTodos ? "Ver principales" : "Ver todos los segmentos"}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {ventaSegmentoData.length > 0 ? (
            <>
              <VentaDiariaPorSegmentoChart
                data={ventaSegmentoData}
                porPdv={segPorPdv}
                showPanquecitas={segPanquecitas}
              />
              <p className="text-xs text-slate-400 mt-2">
                {segPorPdv ? (
                  <>
                    <span className="font-medium text-slate-600">kg/día por PDV</span>: el promedio diario del segmento
                    dividido entre sus PDV de cartera. Es la vista que hace comparables segmentos de tamaños muy
                    distintos — sin ella, la barra más alta es simplemente la del segmento con más clientes.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-slate-600">kg/día</span>: el volumen del segmento entre sus días
                    hábiles. Ojo al comparar segmentos entre sí: las diferencias vienen sobre todo del número de PDV
                    de cada uno — para eso está <span className="font-medium">kg/día por PDV</span>.
                  </>
                )}{" "}
                Margarina, Mayonesa y Harina PAN salen del reporte de referencia (mayo–julio) y se dividen entre{" "}
                {ventaDiariaPorSegmento.diasReferencia} días hábiles. Panquecitas todavía no existía en esa ventana:
                su promedio va sobre los {ventaDiariaPorSegmento.diasPanquecitas} días hábiles transcurridos desde el{" "}
                {ventaDiariaPorSegmento.desdePanquecitas}. Por eso se comparan{" "}
                <span className="font-medium">ritmos diarios</span> y no totales — un acumulado de tres meses contra
                uno de un mes no diría nada.
                {!segTodos && " Los segmentos chicos van agrupados en «Otros»; con el botón de arriba se abren todos."}
              </p>
            </>
          ) : (
            <div className="h-[430px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📊</p>
                <p>Sin datos todavía.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Gráfico 3: Sell-In (SAP) vs Inventario PDV vs Sell-Out ────────── */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Sell-In (SAP) vs Sell-Out (PDV)</h2>
          <p className="text-sm text-slate-400">
            Comparativo agregado: reporte SAP (Radar), inventario contado en PDV por el mercaderista, y el Sell-Out
            como su diferencia. Una sola visita — no depende de dos rondas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <select
            value={zonaFilter}
            onChange={(e) => setZonaFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700"
          >
            <option value="">Todas las zonas</option>
            {zonas.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <select
            value={asesorFilter}
            onChange={(e) => setAsesorFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700"
          >
            <option value="">Todos los asesores</option>
            {asesores.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {(
              [
                { key: "TODOS", label: "Ver Todo" },
                { key: "Calculado", label: "Solo Tradicional" },
                { key: "Reportado_B2B", label: "Solo Cadenas" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setFuenteFilter(opt.key)}
                className={`px-3 py-1.5 transition-colors ${
                  fuenteFilter === opt.key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <ExportExcelButton
            filename="datos_sell_in_sell_out"
            rows={sellOutResumen}
            columns={[
              { header: "Concepto", value: (r) => r.concepto, width: 20 },
              { header: "Total (kg)", value: (r) => r.kg, width: 16 },
            ]}
          />
        </div>
      </div>

      <Card className="mb-6 print-avoid-break">
        <CardContent className="pt-6">
          {sellOutPorCliente.length > 0 ? (
            <SellOutResumenChart data={sellOutResumen} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📦</p>
                <p>Sin visitas de mercaderista para el corte de filtros vigente.</p>
                <p className="text-xs mt-1">
                  El Sell-Out se calcula como reporte SAP (Radar) − inventario contado en PDV.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Panquecitas vs Harina PAN ──────────────────────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div>
            <CardTitle>Panquecitas vs Harina PAN</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Despachado confirmado por Carga Radar de ambos productos — misma fuente para los dos, desde la
              primera hasta la última fecha cargada.{" "}
              {panPoblacion === "clientes"
                ? "Solo clientes con Radar > 0 de Panquecitas."
                : "Todos los clientes del universo del piloto vigente en cada fecha, hayan comprado Panquecitas o no."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {PAN_POBLACION_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setPanPoblacion(opt.key)}
                  className={`px-3 py-1.5 transition-colors ${
                    panPoblacion === opt.key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {PAN_GRANULARITY_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setPanGranularity(opt.key)}
                  className={`px-3 py-1.5 transition-colors ${
                    panGranularity === opt.key
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Ratio acumulado por ciudad, superpuesto (eje propio en %). */}
            <button
              onClick={() => setRatioPorCiudadPan((v) => !v)}
              title="Superpone el ratio Panquecitas/Harina PAN acumulado de cada ciudad"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                ratioPorCiudadPan
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Ratio acum. por ciudad
            </button>
            <ExportExcelButton
              filename="datos_panquecitas_vs_harina_pan"
              rows={panPoints}
              columns={[
                { header: "Período", value: (r) => r.label },
                { header: "Panquecitas (kg)", value: (r) => r.panquecitasKg },
                { header: "Harina PAN (kg)", value: (r) => r.harinaPanKg },
                { header: "Ratio acum. Cumaná (%)", value: (r) => r.ratioCumanaAcum ?? "" },
                { header: "Ratio acum. Cabudare (%)", value: (r) => r.ratioCabudareAcum ?? "" },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {panPoints.length > 0 ? (
            <PanVsHarinaPanChart data={panPoints} showRatioCiudades={ratioPorCiudadPan} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📊</p>
                <p>Sin datos de Panquecitas o Harina PAN todavía.</p>
                <p className="text-xs mt-1">Carga Radar de ambos productos (Panquecitas y Harina PAN).</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      </Card>

      {/* ── Cierre: inactivos por segmento y activación ajustada ───────── */}
      <ClientesInactivosSegmentos
        data={bundle.activacionAjustada}
        porCiudad={activacionPorCiudad}
        filtroTexto={filtroTexto}
      />

      {/* ── Clientes con 1 sola compra o +2 semanas sin pedir ── */}
      <ClientesSinRecompra
        data={clientesSinRecompra}
        sector={filter}
        filtroTexto={filtroTexto}
        sectorLabels={sectorLabels}
      />

      <Separator className="mb-4 print:hidden" />

      {/* ── Reporte de Mercaderistas: ejecución en PDV, global y por PDV ── */}
      <ReporteMercaderistas
        data={reporteMercaderistas}
        sector={filter}
        filtroTexto={filtroTexto}
        sectorLabels={sectorLabels}
      />

    </div>
  );
}
