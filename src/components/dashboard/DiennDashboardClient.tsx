"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";
import { ReportPrintButton } from "@/components/dashboard/ReportPrintButton";
import { ReportPrintHeader } from "@/components/dashboard/ReportPrintHeader";
import { CoberturaComunicacionChart } from "@/components/dashboard/CoberturaComunicacionChart";
import { DemandaInsatisfechaChart } from "@/components/dashboard/DemandaInsatisfechaChart";
import { VentaRecompraActivacionChart } from "@/components/dashboard/VentaRecompraActivacionChart";
import { VolumenHpmChart } from "@/components/dashboard/VolumenHpmChart";
import { PanVsHarinaPanChart } from "@/components/dashboard/PanVsHarinaPanChart";
import { RoundLegend } from "@/components/dashboard/RoundLegend";
import { SellOutChart } from "@/components/dashboard/SellOutChart";
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
  aggregateByRound,
  computeRotacion,
  filterRecords,
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
  RunningVentasResult,
  TimeGranularity,
  VentaRecompraActivacionPoint,
  VolumenRadarAcumulado,
  VolumenVendidoPoint,
} from "@/lib/dienn-queries";
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
  /** Volumen vendido por período (Panquecitas / HPM) + % activación, por día/semana/mes. */
  volumenVendido: Record<TimeGranularity, VolumenVendidoPoint[]>;
  /** Comparativa de penetración Radar Panquecitas vs. HPM sobre la lista objetivo. */
  penetracionRadarVsHpm: PenetracionRadarVsHpm;
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

interface Props {
  bundles: Record<FilterKey, SectorBundle>;
  coberturaComunicacion: Record<TimeGranularity, CoberturaComunicacionPoint[]>;
  conversionDegustaciones: { samples: number; conversions: number; rate: number };
  tiendaIdeal: { pct: number; cumplen: number; total: number };
  sectorLabels: Record<Sector, string>;
  pilotSectors: readonly Sector[];
  sellOutRecords: SellOutRecord[];
  zonas: string[];
  asesores: string[];
}

export function DiennDashboardClient({
  bundles,
  coberturaComunicacion,
  conversionDegustaciones,
  tiendaIdeal,
  sectorLabels,
  pilotSectors,
  sellOutRecords,
  zonas,
  asesores,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("TOTAL");
  const [zonaFilter, setZonaFilter] = useState("");
  const [asesorFilter, setAsesorFilter] = useState("");
  const [fuenteFilter, setFuenteFilter] = useState<FuenteFilter>("TODOS");
  const [granularity, setGranularity] = useState<TimeGranularity>("week");
  const [comboGranularity, setComboGranularity] = useState<TimeGranularity>("week");
  const [hpmGranularity, setHpmGranularity] = useState<TimeGranularity>("week");
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

  const sellOutPorRonda = useMemo(() => aggregateByRound(filteredSellOut), [filteredSellOut]);
  const rotacion = useMemo(() => computeRotacion(filteredSellOut), [filteredSellOut]);
  const mixProducto = bundle.mixProducto;

  const panPoints = bundle.panVsHarinaPan[panPoblacion][panGranularity];

  const comboPoints = bundle.ventaRecompraActivacion[comboGranularity];
  const hpmPoints = bundle.volumenVendido[hpmGranularity];

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

      {/* ── Tarjetas de KPIs dinámicos ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 print-avoid-break">
        <KpiCard
          title="Vol. acumulado en radar — Panquecitas"
          value={`${bundle.volumenRadarAcumulado.panquecitasTon.toLocaleString("es-VE", { maximumFractionDigits: 2 })} Ton`}
          annotation={`Penetración ${bundle.penetracionRadarVsHpm.radarPanquecitasPct}%`}
          subtitle="Confirmado en anaquel — solo Carga Radar"
          product="panquecitas"
        />

        <KpiCard
          title="Vol. acumulado en radar — Harina PAN"
          value={`${bundle.volumenRadarAcumulado.harinaPanTon.toLocaleString("es-VE", { maximumFractionDigits: 2 })} Ton`}
          annotation={`Penetración ${bundle.penetracionRadarVsHpm.hpmPct}%`}
          subtitle="Confirmado en anaquel — solo Carga Radar"
          product="pan"
        />

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
                <span className="text-slate-500">Días de inv.</span>
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 print-avoid-break">
        <KpiCard
          title="Índice Tienda Ideal"
          value={`${tiendaIdeal.pct}%`}
          subtitle={`${tiendaIdeal.cumplen} de ${tiendaIdeal.total} PDVs (sectores piloto)`}
        />
        <KpiCard
          title="Tasa de Conversión — Degustaciones"
          value={`${conversionDegustaciones.rate}%`}
          subtitle={`${conversionDegustaciones.conversions} de ${conversionDegustaciones.samples} tickets`}
          product="panquecitas"
        />
        <KpiCard
          title="Rotación Total"
          value={`${(rotacion.rotacionTotalKg / 1000).toLocaleString("es-VE", { maximumFractionDigits: 2 })} Ton`}
          subtitle="Sell-Out acumulado (calculado + reportado)"
          product="panquecitas"
        />
        <KpiCard
          title="Días de Inventario en Calle"
          value={`${rotacion.diasInventarioEnCalle}`}
          subtitle="Inventario promedio ÷ ritmo de Sell-Out"
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

      {/* ── Volumen vendido HPM (barras, por período) ─────────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div>
            <CardTitle>Volumen vendido HPM</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Volumen de Harina PAN vendido por período, a partir del Radar de HPM.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {GRANULARITY_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setHpmGranularity(opt.key)}
                  className={`px-3 py-1.5 transition-colors ${
                    hpmGranularity === opt.key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <ExportExcelButton
              filename="datos_volumen_hpm"
              rows={hpmPoints}
              columns={[
                { header: "Período", value: (r) => r.label },
                { header: "Volumen HPM (kg)", value: (r) => r.hpmKg },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          {hpmPoints.some((p) => p.hpmKg > 0) ? (
            <VolumenHpmChart data={hpmPoints} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📊</p>
                <p>Sin datos de Radar de Harina PAN todavía.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Gráfico 2: Cobertura y Comunicación por Ciudad ────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Cobertura y Comunicación por Ciudad (% vs Universo)</CardTitle>
            <p className="text-xs text-slate-400 mt-1 mb-2">
              Proxy con datos disponibles: cobertura = % PDV visitados; comunicación = % PDV con material POP.
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

      <Separator className="mb-6 print:hidden" />

      {/* ── Gráfico 3: Sell-In vs Sell-Out por ronda ──────────────────────── */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Sell-In vs Sell-Out por ronda</h2>
          <p className="text-sm text-slate-400">
            Agrupado por ciclo de rondas (nunca diario). Corte D-1 estricto entre visitas consecutivas.
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
            rows={sellOutPorRonda}
            columns={[
              { header: "Ronda", value: (r) => r.roundLabel },
              { header: "Sell-In (kg)", value: (r) => r.sellInKg },
              { header: "Sell-Out (kg)", value: (r) => r.sellOutKg },
              { header: "Inventario promedio (kg)", value: (r) => r.inventarioPromedioKg },
            ]}
          />
        </div>
      </div>

      <Card className="mb-6 print-avoid-break">
        <CardContent className="pt-6">
          {sellOutPorRonda.length > 0 ? (
            <SellOutChart data={sellOutPorRonda} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📦</p>
                <p>Sin datos de Sell-Out todavía.</p>
                <p className="text-xs mt-1">
                  Necesita despachos SAP (Admin → Despachos SAP) y al menos 2 visitas de mercaderista del mismo
                  cliente en rondas consecutivas.
                </p>
              </div>
            </div>
          )}
        </CardContent>
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
              { header: "Penetración x seg (%)", value: (r) => r.penetracionPct, width: 22 },
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
                    <TableHead className="text-right">Penetración x seg (%)</TableHead>
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
