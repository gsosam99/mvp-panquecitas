"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelColumn } from "@/lib/export-excel";
import type { Sector } from "@/lib/sectors";
import { SEGMENTO_SIN_DATO } from "@/lib/segmentos";
import type { CruceInventarioRadarResult, CruceInventarioRadarRow } from "@/lib/cruce-mercaderista-radar";
import {
  COBERTURA_ALTA_DIAS,
  COBERTURA_BAJA_DIAS,
  COBERTURA_MEDIA_DIAS,
  MUESTRA_MINIMA_SEGMENTO,
  NIVELES_FUERA_DE_ESCALA,
  PERIODO_MINIMO_DIAS,
  ORDEN_NIVELES,
  rangoNivel,
  resumirRotacion,
  type NivelRotacion,
  type ResumenRotacion,
} from "@/lib/rotacion-utils";

// Rotación de Panquecitas en el PDV: lo que contó el mercaderista contra lo que
// le llegó por Radar, medido entre visitas (o desde el primer pedido si tiene
// una sola). La query y el criterio viven en src/lib/cruce-mercaderista-radar.ts
// y la escala en src/lib/rotacion-utils.ts.

const NIVELES_ROTACION: Record<NivelRotacion, { label: string; color: string; badge: string }> = {
  AGOTADO: { label: "Agotado", color: "#0f766e", badge: "border-teal-300 text-teal-700 bg-teal-50" },
  ALTA: { label: "Rotación alta", color: "#16a34a", badge: "border-emerald-300 text-emerald-700 bg-emerald-50" },
  MEDIA: { label: "Rotación media", color: "#84cc16", badge: "border-lime-300 text-lime-700 bg-lime-50" },
  BAJA: { label: "Rotación baja", color: "#f59e0b", badge: "border-amber-300 text-amber-700 bg-amber-50" },
  MUY_BAJA: { label: "Rotación muy baja", color: "#dc2626", badge: "border-red-300 text-red-700 bg-red-50" },
  INCONSISTENTE: { label: "Dato inconsistente", color: "#64748b", badge: "border-slate-300 text-slate-600 bg-slate-50" },
  PERIODO_CORTO: { label: "Período corto", color: "#94a3b8", badge: "border-slate-200 text-slate-500 bg-white" },
  INDIRECTO: { label: "Modelo indirecto", color: "#6366f1", badge: "border-indigo-300 text-indigo-700 bg-indigo-50" },
};

type Orden = "rotacion" | "inventario";
type FiltroNivel = "TODOS" | NivelRotacion;

const TOP_GRAFICO = 15;
/** Tope visual de la barra de cobertura; la etiqueta muestra el valor real. */
const TOPE_GRAFICO_DIAS = 60;

const kg = (v: number) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
const pct = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;
const dias = (v: number | null) =>
  v == null ? "sin movimiento" : `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })} días háb.`;
const fecha = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
const segmentoDe = (r: CruceInventarioRadarRow) => r.segmento ?? SEGMENTO_SIN_DATO;

/** Mayor valor = menor rotación. Agotados y los fuera de la escala van al final. */
function claveRotacion(r: CruceInventarioRadarRow): number {
  if (r.nivel === "INDIRECTO") return -4;
  if (r.nivel === "PERIODO_CORTO") return -3;
  if (r.nivel === "INCONSISTENTE") return -2;
  if (r.nivel === "AGOTADO") return -1;
  return r.coberturaDias ?? Number.POSITIVE_INFINITY;
}

interface PuntoGrafico {
  nombre: string;
  coberturaVisual: number;
  etiqueta: string;
  color: string;
}

const Grafico = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, LabelList, Cell } =
      await import("recharts");

    function CruceGraficoInner({ data }: { data: PuntoGrafico[] }) {
      const height = Math.max(240, data.length * 32 + 60);
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 16, right: 90, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" domain={[0, TOPE_GRAFICO_DIAS]} tick={{ fontSize: 11, fill: "#94a3b8" }} unit=" háb." />
            <YAxis
              type="category"
              dataKey="nombre"
              width={200}
              tick={{ fontSize: 11, fill: "#475569" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            {[COBERTURA_ALTA_DIAS, COBERTURA_MEDIA_DIAS, COBERTURA_BAJA_DIAS].map((x) => (
              <ReferenceLine
                key={x}
                x={x}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{ value: `${x} háb.`, position: "top", fontSize: 10, fill: "#64748b" }}
              />
            ))}
            <Bar dataKey="coberturaVisual" name="Días hábiles de cobertura" radius={[0, 3, 3, 0]} minPointSize={2}>
              {data.map((p, i) => (
                <Cell key={i} fill={p.color} />
              ))}
              <LabelList dataKey="etiqueta" position="right" fontSize={11} fontWeight={700} fill="#334155" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return CruceGraficoInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[240px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

function DistribucionNiveles({ porNivel }: { porNivel: ResumenRotacion["porNivel"] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ORDEN_NIVELES.filter((n) => porNivel[n] > 0).map((n) => (
        <span
          key={n}
          title={NIVELES_ROTACION[n].label}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-1.5 text-[11px] text-slate-600"
        >
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: NIVELES_ROTACION[n].color }} />
          {porNivel[n]}
        </span>
      ))}
    </div>
  );
}

export function CruceMercaderistaRadar({
  data,
  sector,
  filtroTexto,
  sectorLabels,
}: {
  data: CruceInventarioRadarResult;
  /** Corte de ciudad activo del dashboard. */
  sector: "TOTAL" | Sector;
  filtroTexto: string;
  sectorLabels: Record<Sector, string>;
}) {
  const [orden, setOrden] = useState<Orden>("rotacion");
  const [filtroNivel, setFiltroNivel] = useState<FiltroNivel>("TODOS");
  const [segmento, setSegmento] = useState<string | null>(null);

  const delSector = useMemo(
    () => (sector === "TOTAL" ? data.filas : data.filas.filter((r) => r.sector === sector)),
    [data.filas, sector]
  );

  // Rotación por segmento, con la misma escala que el PDV.
  const porSegmento = useMemo(() => {
    const grupos = new Map<string, CruceInventarioRadarRow[]>();
    for (const r of delSector) {
      const s = segmentoDe(r);
      grupos.set(s, [...(grupos.get(s) ?? []), r]);
    }
    return Array.from(grupos.entries())
      .map(([nombre, filas]) => ({ nombre, resumen: resumirRotacion(filas) }))
      .sort(
        (a, b) =>
          (b.resumen.coberturaDias ?? Number.POSITIVE_INFINITY) - (a.resumen.coberturaDias ?? Number.POSITIVE_INFINITY) ||
          b.resumen.pdv - a.resumen.pdv
      );
  }, [delSector]);

  // Si cambia la ciudad y el segmento elegido ya no tiene PDV, se ignora.
  const segmentoActivo = segmento && porSegmento.some((s) => s.nombre === segmento) ? segmento : null;

  const delSegmento = useMemo(
    () => (segmentoActivo ? delSector.filter((r) => segmentoDe(r) === segmentoActivo) : delSector),
    [delSector, segmentoActivo]
  );
  const resumen = useMemo(() => resumirRotacion(delSegmento), [delSegmento]);

  const filas = useMemo(() => {
    const base = filtroNivel === "TODOS" ? delSegmento : delSegmento.filter((r) => r.nivel === filtroNivel);
    return [...base].sort((a, b) =>
      orden === "inventario"
        ? b.inventarioKg - a.inventarioKg
        : claveRotacion(b) - claveRotacion(a) || b.inventarioKg - a.inventarioKg
    );
  }, [delSegmento, filtroNivel, orden]);

  // Promedio simple por PDV de la lista que se está viendo (ciudad, segmento y nivel).
  const promedioLista = useMemo(() => resumirRotacion(filas), [filas]);

  const puntos = useMemo<PuntoGrafico[]>(
    () =>
      filas
        .filter((r) => !NIVELES_FUERA_DE_ESCALA.has(r.nivel))
        .slice(0, TOP_GRAFICO)
        .map((r) => ({
          nombre: r.name.length > 30 ? `${r.name.slice(0, 29)}…` : r.name,
          coberturaVisual: Math.min(r.coberturaDias ?? TOPE_GRAFICO_DIAS, TOPE_GRAFICO_DIAS),
          etiqueta: r.nivel === "AGOTADO" ? "agotado" : dias(r.coberturaDias),
          color: NIVELES_ROTACION[r.nivel].color,
        })),
    [filas]
  );

  const columnas: ExcelColumn<CruceInventarioRadarRow>[] = [
    { header: "Código SAP", value: (r) => r.sapCode, width: 14 },
    { header: "Cliente", value: (r) => r.name, width: 34 },
    { header: "Ciudad", value: (r) => (r.sector ? sectorLabels[r.sector] : ""), width: 14 },
    { header: "Zona", value: (r) => r.zona ?? "", width: 16 },
    { header: "Asesor", value: (r) => r.asesor ?? "", width: 22 },
    { header: "Segmento", value: (r) => segmentoDe(r), width: 20 },
    { header: "Modelo", value: (r) => r.esquema ?? "", width: 12 },
    { header: "Mercaderista", value: (r) => r.mercaderista, width: 22 },
    {
      header: "Medición",
      value: (r) => (r.tipoMedicion === "ENTRE_VISITAS" ? "Entre visitas" : "Desde primer pedido"),
      width: 18,
    },
    { header: "Inicio del período", value: (r) => r.fechaInicio, width: 14 },
    { header: "Última visita", value: (r) => r.fechaVisita, width: 14 },
    { header: "Días hábiles", value: (r) => r.dias, width: 12 },
    { header: "Inventario inicial (kg)", value: (r) => r.inventarioInicialKg, width: 18 },
    { header: "Radar del período (kg)", value: (r) => r.radarPeriodoKg, width: 18 },
    { header: "Disponible (kg)", value: (r) => r.disponibleKg, width: 14 },
    { header: "Unid. 400g anaquel", value: (r) => r.unidades400, width: 16 },
    { header: "Unid. 800g anaquel", value: (r) => r.unidades800, width: 16 },
    { header: "Anaquel (kg)", value: (r) => r.anaquelKg, width: 14 },
    { header: "Depósito (kg)", value: (r) => r.depositoKg, width: 14 },
    { header: "Depósito completo", value: (r) => (r.depositoIncluido ? "sí" : "no"), width: 14 },
    { header: "Inventario contado (kg)", value: (r) => r.inventarioKg, width: 18 },
    { header: "Vendido (kg)", value: (r) => r.vendidoKg, width: 14 },
    { header: "% vendido", value: (r) => r.pctVendido, width: 12 },
    { header: "Ritmo (kg/día hábil)", value: (r) => r.ritmoKgDia, width: 14 },
    { header: "Cobertura (días hábiles)", value: (r) => r.coberturaDias ?? "sin movimiento", width: 14 },
    { header: "Nivel de rotación", value: (r) => NIVELES_ROTACION[r.nivel].label, width: 18 },
    { header: "Nivel según la fórmula", value: (r) => NIVELES_ROTACION[r.nivelFormula].label, width: 18 },
    { header: "Conteo igual a la visita anterior", value: (r) => (r.conteoRepetido ? "sí" : "no"), width: 16 },
    { header: "Justificación", value: (r) => r.justificacion, width: 90 },
    { header: "Pedido desde la visita (kg)", value: (r) => r.pedidoPosteriorKg, width: 20 },
    { header: "Radar total (kg, referencia)", value: (r) => r.radarTotalKg, width: 20 },
    { header: "Inventario / Radar total (%, referencia)", value: (r) => r.proporcionAcumuladaPct, width: 24 },
  ];

  const baja = resumen.porNivel.BAJA + resumen.porNivel.MUY_BAJA;

  return (
    <Card className="mb-6 print-avoid-break">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between space-y-0">
        <div>
          <CardTitle>Rotación de Panquecitas por PDV y segmento — Mercaderistas vs Radar</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Por cada PDV visitado: lo que <span className="font-medium">tenía disponible</span> (inventario de la
            visita anterior + lo que le llegó por Radar) menos lo que{" "}
            <span className="font-medium">contó el mercaderista</span> en su última visita es lo vendido en ese
            período. Con una sola visita, el período empieza en su primer pedido por Radar con inventario 0. Los{" "}
            <span className="font-medium">días hábiles de cobertura</span> (inventario ÷ ritmo de venta) ubican al PDV en la
            escala. {filtroTexto}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {(
              [
                ["rotacion", "Menor rotación"],
                ["inventario", "Más inventario"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setOrden(key)}
                className={`px-3 py-1.5 transition-colors ${
                  orden === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <ExportExcelButton
            filename={`Rotación mercaderistas vs Radar — ${filtroTexto}${segmentoActivo ? ` — ${segmentoActivo}` : ""}`}
            rows={filas}
            columns={columnas}
          />
        </div>
      </CardHeader>
      <CardContent>
        {delSector.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-slate-400">
            <div className="text-center">
              <p className="text-4xl mb-2">📦</p>
              <p>Sin PDV visitados con compra por Radar para este corte.</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Escala ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-[11px] text-slate-500">
              {ORDEN_NIVELES.map((n) => (
                <span key={n} className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: NIVELES_ROTACION[n].color }} />
                  <span className="font-medium text-slate-700">{NIVELES_ROTACION[n].label}</span>: {rangoNivel(n)}
                </span>
              ))}
            </div>

            {/* ── Rotación por segmento ───────────────────────────────── */}
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Rotación por segmento
            </p>
            <div className="max-h-[320px] overflow-y-auto mb-5 border border-slate-100 rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Segmento</TableHead>
                    <TableHead className="text-right">PDV</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-right">Vendido</TableHead>
                    <TableHead className="text-right">Inventario</TableHead>
                    <TableHead className="text-right">Ritmo</TableHead>
                    <TableHead className="text-right">Cobertura</TableHead>
                    <TableHead>Nivel</TableHead>
                    <TableHead className="text-right">Promedio por PDV</TableHead>
                    <TableHead>PDV por nivel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porSegmento.map(({ nombre, resumen: s }) => {
                    const activo = segmentoActivo === nombre;
                    return (
                      <TableRow
                        key={nombre}
                        onClick={() => setSegmento(activo ? null : nombre)}
                        className={`cursor-pointer ${activo ? "bg-slate-100" : ""}`}
                      >
                        <TableCell className="font-medium">
                          {nombre}
                          {s.pdvValidos < MUESTRA_MINIMA_SEGMENTO && (
                            <p className="text-[11px] font-normal text-amber-600">
                              muestra chica (&lt; {MUESTRA_MINIMA_SEGMENTO} PDV)
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{s.pdv}</TableCell>
                        <TableCell className="text-right">{kg(s.disponibleKg)}</TableCell>
                        <TableCell className="text-right">
                          {kg(s.vendidoKg)}
                          <p className="text-xs text-slate-400">{pct(s.pctVendido)}</p>
                        </TableCell>
                        <TableCell className="text-right">{kg(s.inventarioKg)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {s.ritmoKgDia.toLocaleString("es-VE", { maximumFractionDigits: 2 })} kg/día háb.
                        </TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap">
                          {s.nivel === "AGOTADO" ? "—" : dias(s.coberturaDias)}
                        </TableCell>
                        <TableCell>
                          {s.nivel && (
                            <Badge variant="outline" className={`text-[11px] font-normal ${NIVELES_ROTACION[s.nivel].badge}`}>
                              {NIVELES_ROTACION[s.nivel].label}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {dias(s.promedioCoberturaDias)}
                          {s.nivelPromedio && (
                            <p className="text-xs text-slate-400">{NIVELES_ROTACION[s.nivelPromedio].label}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <DistribucionNiveles porNivel={s.porNivel} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {segmentoActivo && (
              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className="text-slate-500">Segmento:</span>
                <span className="font-medium text-slate-800">{segmentoActivo}</span>
                <button onClick={() => setSegmento(null)} className="text-slate-400 underline hover:text-slate-600 print:hidden">
                  ver todos
                </button>
              </div>
            )}

            {/* ── Totales del corte ───────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Vendido en el período</p>
                <p className="text-xl font-bold text-slate-900">{kg(resumen.vendidoKg)}</p>
                <p className="text-xs text-slate-400">
                  {pct(resumen.pctVendido)} de {kg(resumen.disponibleKg)} disponibles
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Inventario contado</p>
                <p className="text-xl font-bold text-slate-900">{kg(resumen.inventarioKg)}</p>
                <p className="text-xs text-slate-400">
                  {resumen.pdvValidos} PDV · ritmo {resumen.ritmoKgDia.toLocaleString("es-VE", { maximumFractionDigits: 2 })}{" "}
                  kg/día háb.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Cobertura total</p>
                <p className="text-xl font-bold text-slate-900">{dias(resumen.coberturaDias)}</p>
                <p className="text-xs text-slate-400">
                  {resumen.nivel ? NIVELES_ROTACION[resumen.nivel].label : "—"} · Σ inventario ÷ Σ ritmo
                </p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-red-500">Rotación baja o muy baja</p>
                <p className="text-xl font-bold text-red-700">{baja}</p>
                <p className="text-xs text-slate-500">
                  PDV con {COBERTURA_MEDIA_DIAS} días hábiles o más de cobertura
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-3 print:hidden">
              {(["TODOS", ...ORDEN_NIVELES] as FiltroNivel[]).map((n) => {
                const activo = filtroNivel === n;
                const cuenta = n === "TODOS" ? delSegmento.length : resumen.porNivel[n];
                return (
                  <button
                    key={n}
                    onClick={() => setFiltroNivel(n)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                      activo
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {n !== "TODOS" && (
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: NIVELES_ROTACION[n].color }} />
                    )}
                    {n === "TODOS" ? "Todos" : NIVELES_ROTACION[n].label} ({cuenta})
                  </button>
                );
              })}
            </div>

            {/* ── Promedio de rotación de los PDV de la lista ──────────── */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Promedio de rotación por PDV
              </p>
              <p className="text-[11px] text-slate-400 mb-2">
                {promedioLista.pdvValidos} PDV de la lista actual
                {filtroNivel !== "TODOS" ? ` (${NIVELES_ROTACION[filtroNivel].label})` : ""} · cada PDV pesa igual
                {promedioLista.pdv > promedioLista.pdvValidos
                  ? ` · ${promedioLista.pdv - promedioLista.pdvValidos} fuera de la escala no entran`
                  : ""}
              </p>
              {promedioLista.pdvValidos === 0 ? (
                <p className="text-sm text-slate-400">Sin PDV dentro de la escala en esta lista.</p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Cobertura promedio</p>
                    <p className="text-xl font-bold text-slate-900">{dias(promedioLista.promedioCoberturaDias)}</p>
                    <p className="text-xs text-slate-500">
                      {promedioLista.nivelPromedio ? NIVELES_ROTACION[promedioLista.nivelPromedio].label : "—"}
                      {promedioLista.pdvSinMovimiento > 0
                        ? ` · sin contar ${promedioLista.pdvSinMovimiento} PDV sin movimiento`
                        : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">% vendido promedio</p>
                    <p className="text-xl font-bold text-slate-900">{pct(promedioLista.promedioPctVendido)}</p>
                    <p className="text-xs text-slate-500">de lo disponible en el período</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Ritmo promedio</p>
                    <p className="text-xl font-bold text-slate-900">
                      {(promedioLista.promedioRitmoKgDia ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 2 })} kg
                    </p>
                    <p className="text-xs text-slate-500">por día hábil</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Período promedio</p>
                    <p className="text-xl font-bold text-slate-900">
                      {(promedioLista.promedioDias ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} días háb.
                    </p>
                    <p className="text-xs text-slate-500">medidos por PDV</p>
                  </div>
                </div>
              )}
            </div>

            {puntos.length > 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  {filas.length > TOP_GRAFICO ? `Top ${TOP_GRAFICO} de ${filas.length} PDV` : `${filas.length} PDV`} —{" "}
                  {orden === "rotacion" ? "de menor a mayor rotación" : "ordenados por inventario"} · días hábiles de cobertura
                  (barra topada en {TOPE_GRAFICO_DIAS})
                </p>
                <Grafico data={puntos} />
              </>
            ) : (
              <p className="text-sm text-slate-400 py-6 text-center">
                {filas.length === 0
                  ? "Ningún PDV en ese nivel."
                  : "Estos PDV quedan fuera de la escala: sus números están en la tabla."}
              </p>
            )}

            {filas.length > 0 && (
              <div className="max-h-[520px] overflow-y-auto mt-4 border-t border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">Disponible</TableHead>
                      <TableHead className="text-right">Inventario</TableHead>
                      <TableHead className="text-right">Vendido</TableHead>
                      <TableHead className="text-right">Cobertura</TableHead>
                      <TableHead className="min-w-[280px]">Nivel y justificación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((r) => (
                      <TableRow key={r.locationId} className="align-top">
                        <TableCell>
                          <p className="font-medium">{r.name}</p>
                          <p className="text-xs text-slate-400">
                            {[r.sector ? sectorLabels[r.sector] : null, segmentoDe(r), r.zona].filter(Boolean).join(" · ")}
                          </p>
                          {r.mercaderista && <p className="text-xs text-slate-400">{r.mercaderista}</p>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {fecha(r.fechaInicio)} → {fecha(r.fechaVisita)} ({r.dias} días háb.)
                          <p className="text-slate-400">
                            {r.tipoMedicion === "ENTRE_VISITAS" ? "entre visitas" : "desde primer pedido"}
                          </p>
                          {r.pedidoPosteriorKg > 0 && (
                            <p className="text-slate-400">pidió {kg(r.pedidoPosteriorKg)} desde la visita</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {kg(r.disponibleKg)}
                          {r.tipoMedicion === "ENTRE_VISITAS" && (
                            <p className="text-xs text-slate-400">
                              {kg(r.inventarioInicialKg)} + {kg(r.radarPeriodoKg)} Radar
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {kg(r.inventarioKg)}
                          <p className="text-xs text-slate-400">
                            {r.unidades400} u. 400g · {r.unidades800} u. 800g
                            {r.depositoKg > 0 ? ` · dep. ${kg(r.depositoKg)}` : ""}
                            {!r.depositoIncluido && " · depósito incompleto"}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          {kg(r.vendidoKg)}
                          <p className="text-xs text-slate-400">
                            {pct(r.pctVendido)} · {r.ritmoKgDia.toLocaleString("es-VE", { maximumFractionDigits: 2 })} kg/día háb.
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap">
                          {r.nivel === "AGOTADO" || r.nivel === "PERIODO_CORTO" || r.nivelFormula === "INCONSISTENTE"
                            ? "—"
                            : dias(r.coberturaDias)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] font-normal ${NIVELES_ROTACION[r.nivel].badge}`}>
                            {NIVELES_ROTACION[r.nivel].label}
                          </Badge>
                          {r.conteoRepetido && (
                            <Badge variant="outline" className="ml-1 text-[11px] font-normal border-amber-300 text-amber-700 bg-white">
                              conteo repetido
                            </Badge>
                          )}
                          <p className="text-xs text-slate-500 mt-1 whitespace-normal">{r.justificacion}</p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-slate-400 mt-3">
          <span className="font-medium text-slate-600">Vendido</span> = inventario al inicio + Radar de Panquecitas del
          período − inventario contado en la última visita (anaquel 400 g y 800 g + depósito).{" "}
          <span className="font-medium text-slate-600">Inicio</span>: la visita anterior más reciente con al menos{" "}
          {PERIODO_MINIMO_DIAS} días hábiles de distancia; si no hay, el primer pedido por Radar con inventario 0 (antes de su
          primer pedido el PDV no tenía Panquecitas). Con menos de {PERIODO_MINIMO_DIAS} días hábiles el período es corto y no se
          clasifica.
          Un pedido con la misma fecha de la visita se toma como posterior al conteo.{" "}
          <span className="font-medium text-slate-600">Días hábiles</span>: lunes a viernes entre el inicio y el día
          de la visita (sin contarlo). <span className="font-medium text-slate-600">Cobertura</span> = inventario ÷ ritmo
          de venta por día hábil. <span className="font-medium text-slate-600">Cobertura total</span>: Σ inventario ÷ Σ
          ritmo, donde pesan más los PDV con más volumen.{" "}
          <span className="font-medium text-slate-600">Promedio por PDV</span>: promedio simple de la cobertura de cada
          PDV (cada uno pesa igual; los agotados cuentan con 0 y los sin movimiento no se pueden promediar y se informan
          aparte).{" "}
          <span className="font-medium text-slate-600">Sin movimiento</span>: el mercaderista contó exactamente lo
          disponible; si además repite el conteo de la visita anterior se marca como conteo repetido.{" "}
          <span className="font-medium text-slate-600">Fuera de la escala</span> (no suman en los totales): datos
          inconsistentes, períodos cortos y PDV de modelo indirecto, cuya reposición llega por franquiciada o
          distribuidora y el Radar puede no reflejarla completa; de estos últimos se muestra igual lo que da la fórmula. De {data.visitados} PDV visitados,{" "}
          {data.visitadosSinCompraPrevia} no tenían producto disponible en el período (sin compra por Radar antes de la
          visita) y no se pueden medir.
        </p>
      </CardContent>
    </Card>
  );
}
