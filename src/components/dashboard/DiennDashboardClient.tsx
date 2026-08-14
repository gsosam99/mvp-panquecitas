"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ExportExcelButton, ExportExcelMultiButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelColumn, ExcelChartConfig, ExcelSheetSpec } from "@/lib/export-excel";
import { ReportPrintButton } from "@/components/dashboard/ReportPrintButton";
import { ReportPrintHeader } from "@/components/dashboard/ReportPrintHeader";
import { CoberturaComunicacionChart } from "@/components/dashboard/CoberturaComunicacionChart";
import { DemandaInsatisfechaChart } from "@/components/dashboard/DemandaInsatisfechaChart";
import { VentaRecompraActivacionChart } from "@/components/dashboard/VentaRecompraActivacionChart";
import { PosicionPdvChart } from "@/components/dashboard/PosicionPdvChart";
import { SellOutPorPosicionChart } from "@/components/dashboard/SellOutPorPosicionChart";
import { CarteraTotalDiaChart, type CarteraTotalDiaChartPoint } from "@/components/dashboard/CarteraTotalDiaChart";
import { PanVsHarinaPanChart } from "@/components/dashboard/PanVsHarinaPanChart";
import { RoundLegend } from "@/components/dashboard/RoundLegend";
import { SellOutResumenChart } from "@/components/dashboard/SellOutResumenChart";
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
  computeRotacion,
  filterRecords,
  filterSellOutClientes,
  type SellOutClienteDiffRow,
  type SellOutRecord,
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
  MaterialPopPreciadorResult,
  RunningVentasResult,
  StockOutClientePoint,
  StockOutResult,
  TimeGranularity,
  VentaRecompraActivacionPoint,
  VolumenRadarAcumulado,
} from "@/lib/dienn-queries";
import type { MotivoNoVentaRow } from "@/lib/efectividad-queries";
import type { Sector } from "@/lib/sectors";

export interface SectorBundle {
  /** Volumen FACTURADO — exclusivo de Pedidos y Facturado (Cantidad Facturada). */
  totalToneladas: number;
  /** Volumen PEDIDO — exclusivo de Pedidos y Facturado (Cantidad Pedido), mismo universo que totalToneladas. */
  totalToneladasPedidas: number;
  /** Toneladas reales despachadas/confirmadas según "Carga Radar", por producto. No se mezcla con las dos anteriores. */
  volumenRadarAcumulado: VolumenRadarAcumulado;
  /** Toneladas facturadas SAP por presentación (400g / 800g), desde Pedidos y Facturado. */
  mixProducto: MixProductoTonPoint[];
  /** Pedido / Facturado / Radar de Panquecitas acumulados en el tiempo, para ver la demanda insatisfecha. */
  demandaInsatisfecha: Record<TimeGranularity, DemandaInsatisfechaPoint[]>;
  /** Panquecitas vs Harina PAN, AMBOS desde Carga Radar (misma fuente para que sean comparables). */
  panVsHarinaPan: Record<PanComparisonPoblacion, Record<PanComparisonGranularity, PanVsHarinaPanPoint[]>>;
  runningVentas: RunningVentasResult;
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
  conversionDegustaciones: { samples: number; conversions: number; rate: number };
  tiendaIdeal: { pct: number; cumplen: number; total: number };
  sectorLabels: Record<Sector, string>;
  pilotSectors: readonly Sector[];
  sellOutRecords: SellOutRecord[];
  sellOutClientes: SellOutClienteDiffRow[];
  zonas: string[];
  asesores: string[];
  /** Motivos de no venta clasificados (reporte SAP de Efectividad de Visita). Globales, no por sector. */
  motivosNoVenta: MotivoNoVentaRow[];
  /** Posición en PDV por cliente (última visita), para cruzar con el Sell-Out. Global; se acota vía el Sell-Out filtrado. */
  posicionPorCliente: PosicionClienteRow[];
  /** Cartera por ciudad × modelo (volumen Radar + efectividad por plan de visita), por segmento y total por día. Global. */
  carteraPorSegmento: CarteraSegmentoResult;
}

export function DiennDashboardClient({
  bundles,
  coberturaComunicacion,
  conversionDegustaciones,
  tiendaIdeal,
  sectorLabels,
  pilotSectors,
  sellOutRecords,
  sellOutClientes,
  zonas,
  asesores,
  posicionPorCliente,
  carteraPorSegmento,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("TOTAL");
  const [zonaFilter, setZonaFilter] = useState("");
  const [asesorFilter, setAsesorFilter] = useState("");
  const [fuenteFilter, setFuenteFilter] = useState<FuenteFilter>("TODOS");
  const [granularity, setGranularity] = useState<TimeGranularity>("week");
  const [comboGranularity, setComboGranularity] = useState<TimeGranularity>("week");
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
  // Barras de volumen Radar del período: total (false) o separadas por modelo (true).
  const [ventasPorModelo, setVentasPorModelo] = useState(false);

  const [sellOutClienteOpen, setSellOutClienteOpen] = useState(false);
  // Posición del producto en PDV: una sola tarjeta, se ve por conteo de clientes
  // ("posicion") o por Sell-Out generado ("sellout").
  const [posicionVista, setPosicionVista] = useState<"posicion" | "sellout">("posicion");
  const [panPoblacion, setPanPoblacion] = useState<PanComparisonPoblacion>("clientes");
  const [panGranularity, setPanGranularity] = useState<PanComparisonGranularity>("month");
  const bundle = bundles[filter];

  const scatterSectors = useMemo<Sector[]>(
    () => (filter === "TOTAL" ? [...pilotSectors] : [filter]),
    [filter, pilotSectors]
  );

  const filteredSellOut = useMemo(
    () =>
      filterRecords(sellOutRecords, {
        sector: filter === "TOTAL" ? undefined : filter,
        zona: zonaFilter || undefined,
        asesor: asesorFilter || undefined,
        fuente: fuenteFilter,
      }),
    [sellOutRecords, filter, zonaFilter, asesorFilter, fuenteFilter]
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
  const mapTotal = (puntos: CarteraTotalDiaPunto[]): CarteraTotalDiaChartPoint[] =>
    puntos.map((p) => ({
      label: p.label,
      radarKgDia: p.radarKgDia,
      radarKgDiaDirecto: p.radarKgDiaDirecto,
      radarKgDiaIndirecto: p.radarKgDiaIndirecto,
      programados: p.programados,
      // Línea principal: por período (día) o acumulada (activos ÷ cartera total).
      efectividad: efectividadAcum
        ? carteraMetrica === "activos"
          ? p.efectividadActivosAcum
          : carteraMetrica === "facturados"
          ? p.efectividadFacturadosAcum
          : p.efectividadPedidosAcum
        : carteraMetrica === "activos"
        ? p.efectividadActivos
        : carteraMetrica === "facturados"
        ? p.efectividadFacturados
        : p.efectividadPedidos,
      // Líneas por modelo: mismo toggle, independiente del de la línea principal.
      efectividadDirecto: modeloAcum ? p.efectividadDirectoAcum : p.efectividadDirecto,
      efectividadIndirecto: modeloAcum ? p.efectividadIndirectoAcum : p.efectividadIndirecto,
    }));
  // Color de la línea de efectividad según la métrica: Radar rojo, Facturado
  // azul marino, Pedidos naranja.
  const efectividadColor =
    carteraMetrica === "activos" ? "#dc2626" : carteraMetrica === "facturados" ? "#1e3a8a" : "#ea580c";
  const carteraTotalDiaData = useMemo(
    () => mapTotal(carteraPorSegmento.totalPorDia[totalGranularity]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carteraPorSegmento.totalPorDia, totalGranularity, carteraMetrica, efectividadAcum, modeloAcum]
  );
  const carteraTotalPorSectorData = useMemo(
    () =>
      pilotSectors.map((s) => ({
        sector: s,
        label: sectorLabels[s],
        data: mapTotal(carteraPorSegmento.totalPorSector[s][totalGranularity]),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      carteraPorSegmento.totalPorSector,
      totalGranularity,
      carteraMetrica,
      efectividadAcum,
      modeloAcum,
      pilotSectors,
      sectorLabels,
    ]
  );
  // Un solo .xlsx con las 3 hojas (Total + cada ciudad), cada una con su gráfico
  // editable. Usa los datos crudos de la granularidad activa (no el mapeo del
  // gráfico), para incluir todas las columnas (día y acumulado).
  const efectividadExcelSheets = useMemo<ExcelSheetSpec<CarteraTotalDiaPunto>[]>(
    () => [
      {
        sheetName: "Total (ambas ciudades)",
        columns: TOTAL_ACUM_COLUMNS,
        rows: carteraPorSegmento.totalPorDia[totalGranularity],
        chart: TOTAL_ACUM_CHART,
      },
      ...pilotSectors.map((s) => ({
        sheetName: sectorLabels[s],
        columns: SECTOR_ACUM_COLUMNS,
        rows: carteraPorSegmento.totalPorSector[s][totalGranularity],
        chart: sectorAcumChart(sectorLabels[s]),
      })),
    ],
    [carteraPorSegmento, totalGranularity, pilotSectors, sectorLabels]
  );
  const rotacion = useMemo(() => computeRotacion(filteredSellOut), [filteredSellOut]);
  const mixProducto = bundle.mixProducto;

  const panPoints = bundle.panVsHarinaPan[panPoblacion][panGranularity];

  const comboPoints = bundle.ventaRecompraActivacion[comboGranularity];

  // Proporción de volumen Panquecitas sobre Harina PAN (Radar) — solo se
  // muestra como acotación en la tarjeta de volumen de Panquecitas.
  const proporcionPanqVsHpm =
    bundle.volumenRadarAcumulado.harinaPanTon > 0
      ? Math.round(
          (bundle.volumenRadarAcumulado.panquecitasTon / bundle.volumenRadarAcumulado.harinaPanTon) * 1000
        ) / 10
      : 0;

  const filtroTexto = filter === "TOTAL" ? "Total sectores piloto" : sectorLabels[filter];

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
      <div className="flex gap-2 mb-6 print:hidden">
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
      </div>

      {/* ── BLOQUE 1 · Tarjetas principales (KPI) ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 print-avoid-break">
        <KpiCard
          title="Vol. acumulado en radar — Panquecitas"
          value={`${bundle.volumenRadarAcumulado.panquecitasTon.toLocaleString("es-VE", { maximumFractionDigits: 2 })} Ton`}
          annotation={[
            `Activación de cliente ${bundle.penetracionRadarVsHpm.radarPanquecitasPct}%`,
            `Proporción vs Harina PAN ${proporcionPanqVsHpm}%`,
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
          subtitle={`${tiendaIdeal.cumplen} de ${tiendaIdeal.total} PDVs (sectores piloto)`}
        />
      </div>

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
                : "Los 358 clientes del universo del piloto, hayan comprado Panquecitas o no."}
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
            <ExportExcelButton
              filename="datos_panquecitas_vs_harina_pan"
              rows={panPoints}
              columns={[
                { header: "Período", value: (r) => r.label },
                { header: "Panquecitas (kg)", value: (r) => r.panquecitasKg },
                { header: "Harina PAN (kg)", value: (r) => r.harinaPanKg },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {panPoints.length > 0 ? (
            <PanVsHarinaPanChart data={panPoints} />
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

      <Separator className="mb-4 print:hidden" />

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
            rows={bundle.demandaInsatisfecha[granularity]}
            columns={[
              { header: "Período", value: (r) => r.label },
              { header: "Pedido (kg)", value: (r) => r.pedidoKg },
              { header: "Facturado (kg)", value: (r) => r.facturadoKg },
              { header: "Radar (kg)", value: (r) => r.radarKg },
            ]}
          />
        </CardHeader>
        <CardContent>
          {bundle.demandaInsatisfecha[granularity].length > 0 ? (
            <DemandaInsatisfechaChart data={bundle.demandaInsatisfecha[granularity]} />
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
              Barras: venta acumulada (Radar). Líneas (eje derecho, %): tasa de recompra y % de activación de
              clientes sobre la cartera fija de 358.
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
            <ExportExcelButton
              filename="datos_venta_recompra_activacion"
              rows={comboPoints}
              columns={[
                { header: "Período", value: (r) => r.label },
                { header: "Venta acumulada (kg)", value: (r) => r.ventaAcumuladaKg },
                { header: "Tasa de recompra (%)", value: (r) => r.recompraPct },
                { header: "Activación (%)", value: (r) => r.activacionPct },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {comboPoints.length > 0 ? (
            <VentaRecompraActivacionChart data={comboPoints} />
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

      {/* ── Gráfico 2: Cobertura y Comunicación por Ciudad ────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Cobertura y Comunicación por Ciudad</CardTitle>
            <p className="text-xs text-slate-400 mt-1 mb-2">
              Cobertura = % de la cartera (por zona) visitada. Comunicación = % con material POP entre los visitados con ventas en SAP (Radar &gt; 0).
              {granularity === "month" && " Las rondas de auditoría no se distinguen en vista mensual — cambia a Día o Semana."}
            </p>
            <RoundLegend />
          </div>
          <ExportExcelButton
            filename="datos_cobertura_comunicacion"
            rows={coberturaComunicacion[granularity]}
            columns={[
              { header: "Período", value: (r) => r.label },
              ...scatterSectors.flatMap((s) => [
                { header: `Cobertura ${sectorLabels[s]} (%)`, value: (r: CoberturaComunicacionPoint) => r[`${s}_cobertura`] },
                { header: `Comunicación ${sectorLabels[s]} (%)`, value: (r: CoberturaComunicacionPoint) => r[`${s}_comunicacion`] },
              ]),
            ]}
          />
        </CardHeader>
        <CardContent>
          {coberturaComunicacion[granularity].length > 0 ? (
            <CoberturaComunicacionChart
              data={coberturaComunicacion[granularity]}
              sectors={scatterSectors}
              granularity={granularity}
            />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">🗺️</p>
                <p>Sin visitas de mercaderista registradas aún.</p>
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

      <Separator className="mb-6 print:hidden" />

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
                <span className="font-medium text-green-600">Directo</span> y{" "}
                <span className="font-medium text-violet-600">Indirecto</span>. Con los botones{" "}
                <span className="font-medium">Efectividad</span> y <span className="font-medium">Modelos</span> alternas
                cada línea entre el valor del período (Día) y el{" "}
                <span className="font-medium">acumulado</span> (activos ÷ cartera total). Todo aplica también a los
                gráficos comparativos (Cumaná / Cabudare).
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
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Activación Directo
                </button>
                <button
                  onClick={() => setShowIndirectoTotal((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    showIndirectoTotal
                      ? "border-violet-600 bg-violet-600 text-white"
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
                {/* Barras: total del período o separadas por modelo (Directo/Indirecto). */}
                <button
                  onClick={() => setVentasPorModelo((v) => !v)}
                  title="Cambia las barras de volumen Radar del período entre el total y el desglose por modelo (Directo/Indirecto)"
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    ventasPorModelo
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Ventas: {ventasPorModelo ? "Por modelo" : "Total"}
                </button>
              </div>
              <ExportExcelButton
                filename="Cartera total acumulado"
                rows={carteraPorSegmento.totalPorDia[totalGranularity]}
                chart={TOTAL_ACUM_CHART}
                columns={TOTAL_ACUM_COLUMNS}
              />
            </div>
          </CardHeader>
          <CardContent>
            <CarteraTotalDiaChart
              data={carteraTotalDiaData}
              showDirecto={showDirectoTotal}
              showIndirecto={showIndirectoTotal}
              efectividadColor={efectividadColor}
              ventasPorModelo={ventasPorModelo}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Comparativo por sector: mismo total acumulado, Cumaná vs Cabudare ── */}
      {carteraTotalPorSectorData.some((s) => s.data.length > 0) && (
        <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">
          {carteraTotalPorSectorData.map((s) => (
            <Card key={s.sector} className="print-avoid-break">
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Total acumulado — {s.label}</CardTitle>
                  <p className="text-xs text-slate-400 mt-1">
                    Mismo gráfico, acotado a {s.label}. Usa los filtros de arriba (métrica, granularidad y series por
                    modelo).
                  </p>
                </div>
                <ExportExcelButton
                  filename={`Total acumulado — ${s.label}`}
                  rows={carteraPorSegmento.totalPorSector[s.sector][totalGranularity]}
                  chart={sectorAcumChart(s.label)}
                  columns={SECTOR_ACUM_COLUMNS}
                />
              </CardHeader>
              <CardContent>
                <CarteraTotalDiaChart
                  data={s.data}
                  showDirecto={showDirectoTotal}
                  showIndirecto={showIndirectoTotal}
                  efectividadColor={efectividadColor}
                  ventasPorModelo={ventasPorModelo}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Separator className="mb-6 print:hidden" />

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
          value={`${conversionDegustaciones.rate}%`}
          subtitle={`${conversionDegustaciones.conversions} de ${conversionDegustaciones.samples} tickets`}
          product="panquecitas"
        />
        <KpiCard
          title="Días de Inventario en Calle"
          value={`${rotacion.diasInventarioEnCalle}`}
          subtitle="Inventario promedio ÷ ritmo de Sell-Out (días hábiles)"
        />
        <KpiCard
          title="Clientes en Stock Out"
          value={String(bundle.stockOut.enStockOut)}
          subtitle={`≤ ${STOCK_OUT_UMBRAL_DIENN} unid. (directo) / ≤ ${STOCK_OUT_UMBRAL_INDIRECTO} (indirecto) en tienda · de ${bundle.stockOut.universo} clientes con venta`}
          critical={bundle.stockOut.enStockOut > 0}
        />
        <KpiCard
          title="Material POP con Preciador"
          value={bundle.materialPopPreciador.poblacion > 0 ? `${bundle.materialPopPreciador.ratio}%` : "s/d"}
          subtitle={`${bundle.materialPopPreciador.conPreciador} de ${bundle.materialPopPreciador.poblacion} visitados con ventas SAP`}
          product="panquecitas"
        />
      </div>

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
                Clientes con venta con pocas unidades en tienda (anaquel + depósito; solo anaquel si no hubo acceso al
                depósito): ≤ {STOCK_OUT_UMBRAL_DIENN} en modelo directo, ≤ {STOCK_OUT_UMBRAL_INDIRECTO} en modelo
                indirecto. Incluye la ubicación del producto.
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
              { header: "Incluye depósito", value: (r) => (r.depositoIncluido ? "Sí" : "No (sin acceso)"), width: 18 },
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
                        <TableCell className="text-right">
                          {c.unidadesTienda}
                          {!c.depositoIncluido && <span className="text-xs text-slate-400"> (solo anaquel)</span>}
                        </TableCell>
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

      {/* ── Tabla: Detalle de Clientes ─────────────────────────────────── */}
      <Card className="mb-6 print:hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle>Detalle de Clientes (# clts y ton vendidas)</CardTitle>
          <ExportExcelButton
            filename={`Detalle de clientes por segmento — ${filtroTexto}`}
            rows={bundle.detalleSegmentos}
            columns={[
              { header: "Segmento", value: (r) => r.segmento, width: 30 },
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
                    <TableHead className="text-right">Activación x seg (%)</TableHead>
                    <TableHead className="text-right">Recompra x seg (%)</TableHead>
                    <TableHead className="text-right">% HPM vs Base</TableHead>
                    <TableHead className="text-right">% HPM TOTAL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundle.detalleSegmentos.map((row) => (
                    <TableRow key={row.segmento}>
                      <TableCell className="font-medium">{row.segmento}</TableCell>
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

    </div>
  );
}
