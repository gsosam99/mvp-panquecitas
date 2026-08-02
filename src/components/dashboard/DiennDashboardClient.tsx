"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PenetracionRecompraChart } from "@/components/dashboard/PenetracionRecompraChart";
import { CoberturaComunicacionChart } from "@/components/dashboard/CoberturaComunicacionChart";
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
  aggregateMixProducto,
  computeRotacion,
  filterRecords,
  type SellOutRecord,
} from "@/lib/sellout-utils";
import type {
  CoberturaComunicacionPoint,
  DetalleSegmentoRow,
  PenetracionRecompraPoint,
  RunningVentasResult,
} from "@/lib/dienn-queries";
import type { Sector } from "@/lib/sectors";
import type { SapPendingOrder } from "@/types";

export interface SectorBundle {
  totalToneladas: number;
  runningVentas: RunningVentasResult;
  penetracionRecompra: PenetracionRecompraPoint[];
  detalleSegmentos: DetalleSegmentoRow[];
  pedidosPendientes: SapPendingOrder[];
}

type FilterKey = "TOTAL" | Sector;
type FuenteFilter = "TODOS" | "Calculado" | "Reportado_B2B";

interface Props {
  bundles: Record<FilterKey, SectorBundle>;
  coberturaComunicacion: CoberturaComunicacionPoint[];
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

  const mixProducto = useMemo(() => aggregateMixProducto(filteredSellOut), [filteredSellOut]);
  const sellOutPorRonda = useMemo(() => aggregateByRound(filteredSellOut), [filteredSellOut]);
  const rotacion = useMemo(() => computeRotacion(filteredSellOut), [filteredSellOut]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Estratégico — DIENN</h1>
        <p className="text-slate-500 mt-1">Ventas, penetración, rotación y cobertura del mercado</p>
      </div>

      {/* ── Filtro reactivo de segmento ────────────────────────────────── */}
      <div className="flex gap-2 mb-6">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <KpiCard
          title="Total Ton"
          value={`${bundle.totalToneladas.toLocaleString("es-VE", { maximumFractionDigits: 2 })} Ton`}
          subtitle="Volumen acumulado de Panquecitas"
          product="panquecitas"
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
                Sin Sell-Out calculado aún — carga despachos SAP y al menos 2 visitas por cliente en rondas
                distintas.
              </p>
            ) : (
              <div className="flex items-baseline gap-4">
                {mixProducto.map((m) => (
                  <div key={m.variant}>
                    <p className="text-2xl font-bold text-slate-900">{m.toneladas} Ton</p>
                    <p className="text-xs text-slate-500">{m.variant}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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

      <Separator className="mb-6" />

      {/* ── Gráfico 1: Evolución de Penetración y Tasa de Recompra ───────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Evolución de Penetración y Tasa de Recompra</CardTitle>
        </CardHeader>
        <CardContent>
          {bundle.penetracionRecompra.length > 0 ? (
            <PenetracionRecompraChart data={bundle.penetracionRecompra} />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📈</p>
                <p>Sin datos de Sell-in de Panquecitas. Carga el reporte SAP.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Gráfico 2: Cobertura y Comunicación por Ciudad ────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Cobertura y Comunicación por Ciudad (% vs Universo)</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Proxy con datos disponibles: cobertura = % PDV visitados; comunicación = % PDV con material POP.
          </p>
        </CardHeader>
        <CardContent>
          {coberturaComunicacion.length > 0 ? (
            <CoberturaComunicacionChart data={coberturaComunicacion} sectors={scatterSectors} />
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

      <Separator className="mb-6" />

      {/* ── Gráfico 3: Sell-In vs Sell-Out por ronda ──────────────────────── */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Sell-In vs Sell-Out por ronda</h2>
          <p className="text-sm text-slate-400">
            Agrupado por ciclo de rondas (nunca diario). Corte D-1 estricto entre visitas consecutivas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>

      <Card className="mb-6">
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

      <Separator className="mb-6" />

      {/* ── Tabla: Detalle de Clientes ─────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Detalle de Clientes (# clts y ton vendidas)</CardTitle>
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

      {/* ── Pedidos pendientes por entregar ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Pedidos Pendientes por Entregar</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Se carga desde SAP a medida que se suben los reportes (Admin → Pedidos Pendientes).
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {bundle.pedidosPendientes.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Sin pedidos pendientes cargados.</p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PDV</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundle.pedidosPendientes.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <span className="font-medium text-slate-900">{p.location?.sap_code}</span>{" "}
                        <span className="text-slate-500">— {p.location?.name}</span>
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {p.location?.oficina_venta ?? p.location?.centro_poblado ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">{p.quantity}</TableCell>
                      <TableCell className="text-slate-500">{p.order_date ?? "—"}</TableCell>
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
