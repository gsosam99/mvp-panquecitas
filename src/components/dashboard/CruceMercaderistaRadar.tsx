"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelColumn } from "@/lib/export-excel";
import type { Sector } from "@/lib/sectors";
import type {
  CruceInventarioRadarResult,
  CruceInventarioRadarRow,
  NivelApoyo,
} from "@/lib/cruce-mercaderista-radar";

// ¿Dónde necesita más apoyo el producto? Cruza lo que contó el mercaderista
// en su última visita con lo que el Radar dice que se le vendió a ese PDV.
// La query y el criterio viven en src/lib/cruce-mercaderista-radar.ts.

const NIVELES: Record<NivelApoyo, { label: string; color: string; badge: string }> = {
  ALTO: { label: "Estancado", color: "#dc2626", badge: "border-red-300 text-red-700 bg-red-50" },
  MEDIO: { label: "Rotación lenta", color: "#f59e0b", badge: "border-amber-300 text-amber-700 bg-amber-50" },
  ROTANDO: { label: "Rotando", color: "#16a34a", badge: "border-emerald-300 text-emerald-700 bg-emerald-50" },
  SIN_PRODUCTO: { label: "Sin producto", color: "#64748b", badge: "border-slate-300 text-slate-600 bg-slate-50" },
};

const ORDEN_NIVEL: NivelApoyo[] = ["ALTO", "MEDIO", "ROTANDO", "SIN_PRODUCTO"];

type Orden = "proporcion" | "inventario";
type FiltroNivel = "TODOS" | NivelApoyo;

const TOP_GRAFICO = 15;

const kg = (v: number) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
const pct = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;

interface PuntoGrafico {
  nombre: string;
  inventarioKg: number;
  radarKg: number;
  etiqueta: string;
  color: string;
}

const Grafico = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell } =
      await import("recharts");

    function CruceGraficoInner({ data }: { data: PuntoGrafico[] }) {
      const height = Math.max(260, data.length * 46 + 60);
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 110, left: 8, bottom: 8 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} unit=" kg" />
            <YAxis
              type="category"
              dataKey="nombre"
              width={200}
              tick={{ fontSize: 11, fill: "#475569" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [kg(Number(value ?? 0)), String(name ?? "")]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="inventarioKg" name="Inventario reportado por el mercaderista" radius={[0, 3, 3, 0]}>
              {data.map((p, i) => (
                <Cell key={i} fill={p.color} />
              ))}
              <LabelList dataKey="etiqueta" position="right" fontSize={11} fontWeight={700} fill="#334155" />
            </Bar>
            <Bar dataKey="radarKg" name="Vendido según Radar" fill="#cbd5e1" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return CruceGraficoInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[260px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

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
  const [orden, setOrden] = useState<Orden>("proporcion");
  const [filtroNivel, setFiltroNivel] = useState<FiltroNivel>("TODOS");

  const delSector = useMemo(
    () => (sector === "TOTAL" ? data.filas : data.filas.filter((r) => r.sector === sector)),
    [data.filas, sector]
  );

  const resumen = useMemo(() => {
    const inventario = delSector.reduce((s, r) => s + r.inventarioKg, 0);
    const radar = delSector.reduce((s, r) => s + r.radarKg, 0);
    const porNivel = new Map<NivelApoyo, number>();
    for (const r of delSector) porNivel.set(r.nivel, (porNivel.get(r.nivel) ?? 0) + 1);
    return {
      inventario,
      radar,
      proporcion: radar > 0 ? Math.round((inventario / radar) * 1000) / 10 : null,
      porNivel,
    };
  }, [delSector]);

  const filas = useMemo(() => {
    const base = filtroNivel === "TODOS" ? delSector : delSector.filter((r) => r.nivel === filtroNivel);
    return [...base].sort((a, b) =>
      orden === "inventario"
        ? b.inventarioKg - a.inventarioKg
        : b.proporcionPct - a.proporcionPct || b.inventarioKg - a.inventarioKg
    );
  }, [delSector, filtroNivel, orden]);

  const puntos = useMemo<PuntoGrafico[]>(
    () =>
      filas.slice(0, TOP_GRAFICO).map((r) => ({
        nombre: r.name.length > 30 ? `${r.name.slice(0, 29)}…` : r.name,
        inventarioKg: r.inventarioKg,
        radarKg: r.radarKg,
        etiqueta: r.nivel === "SIN_PRODUCTO" ? "sin producto" : `${pct(r.proporcionPct)} del Radar`,
        color: NIVELES[r.nivel].color,
      })),
    [filas]
  );

  const columnas: ExcelColumn<CruceInventarioRadarRow>[] = [
    { header: "Código SAP", value: (r) => r.sapCode, width: 14 },
    { header: "Cliente", value: (r) => r.name, width: 34 },
    { header: "Ciudad", value: (r) => (r.sector ? sectorLabels[r.sector] : ""), width: 14 },
    { header: "Zona", value: (r) => r.zona ?? "", width: 16 },
    { header: "Asesor", value: (r) => r.asesor ?? "", width: 22 },
    { header: "Segmento", value: (r) => r.segmento ?? "", width: 20 },
    { header: "Modelo", value: (r) => r.esquema ?? "", width: 12 },
    { header: "Última visita", value: (r) => r.fechaVisita, width: 14 },
    { header: "Mercaderista", value: (r) => r.mercaderista, width: 22 },
    { header: "Unid. 400g anaquel", value: (r) => r.unidades400, width: 16 },
    { header: "Unid. 800g anaquel", value: (r) => r.unidades800, width: 16 },
    { header: "Anaquel (kg)", value: (r) => r.anaquelKg, width: 14 },
    { header: "Depósito (kg)", value: (r) => (r.depositoIncluido ? r.depositoKg : "sin acceso"), width: 14 },
    { header: "Inventario reportado (kg)", value: (r) => r.inventarioKg, width: 22 },
    { header: "Vendido según Radar (kg)", value: (r) => r.radarKg, width: 22 },
    { header: "Inventario / Radar (%)", value: (r) => r.proporcionPct, width: 20 },
    { header: "Nivel", value: (r) => NIVELES[r.nivel].label, width: 16 },
  ];

  const enAlerta = resumen.porNivel.get("ALTO") ?? 0;

  return (
    <Card className="mb-6 print-avoid-break">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between space-y-0">
        <div>
          <CardTitle>¿Dónde hace falta apoyo? — Mercaderistas vs Radar</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Solo PDV <span className="font-medium">visitados por un mercaderista y con venta Radar</span>. Por cada
            uno, lo que <span className="font-medium">contó el mercaderista</span> en su última
            visita (anaquel + depósito) contra lo que <span className="font-medium">el Radar dice que se vendió</span>{" "}
            a ese PDV. La proporción es qué parte de lo vendido sigue en la tienda: mientras más alta, más producto
            estancado y más apoyo necesita ese punto. {filtroTexto}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {(
              [
                ["proporcion", "Mayor proporción"],
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
            filename={`Mercaderistas vs Radar — ${filtroTexto}`}
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
              <p>Sin PDV visitados con venta Radar para este corte.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Inventario reportado</p>
                <p className="text-xl font-bold text-slate-900">{kg(resumen.inventario)}</p>
                <p className="text-xs text-slate-400">{delSector.length} PDV visitados con venta Radar</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Vendido según Radar</p>
                <p className="text-xl font-bold text-slate-900">{kg(resumen.radar)}</p>
                <p className="text-xs text-slate-400">de esos mismos PDV</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Proporción global</p>
                <p className="text-xl font-bold text-slate-900">{pct(resumen.proporcion)}</p>
                <p className="text-xs text-slate-400">inventario ÷ Radar</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-red-500">PDV que necesitan apoyo</p>
                <p className="text-xl font-bold text-red-700">{enAlerta}</p>
                <p className="text-xs text-slate-500">producto estancado (≥ {data.umbralAltoPct}% de lo vendido)</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-3 print:hidden">
              {(["TODOS", ...ORDEN_NIVEL] as FiltroNivel[]).map((n) => {
                const activo = filtroNivel === n;
                const cuenta = n === "TODOS" ? delSector.length : resumen.porNivel.get(n) ?? 0;
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
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: NIVELES[n].color }} />
                    )}
                    {n === "TODOS" ? "Todos" : NIVELES[n].label} ({cuenta})
                  </button>
                );
              })}
            </div>

            {puntos.length > 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  {filas.length > TOP_GRAFICO ? `Top ${TOP_GRAFICO} de ${filas.length} PDV` : `${filas.length} PDV`} —{" "}
                  {orden === "proporcion" ? "ordenados por proporción" : "ordenados por inventario"}
                </p>
                <Grafico data={puntos} />
              </>
            ) : (
              <p className="text-sm text-slate-400 py-6 text-center">Ningún PDV en ese nivel.</p>
            )}

            {filas.length > 0 && (
              <div className="max-h-[420px] overflow-y-auto mt-4 border-t border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Última visita</TableHead>
                      <TableHead className="text-right">Inventario (kg)</TableHead>
                      <TableHead className="text-right">Radar (kg)</TableHead>
                      <TableHead className="text-right">Inventario / Radar</TableHead>
                      <TableHead>Nivel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((r) => (
                      <TableRow key={r.locationId}>
                        <TableCell>
                          <p className="font-medium">{r.name}</p>
                          <p className="text-xs text-slate-400">
                            {[r.sector ? sectorLabels[r.sector] : null, r.segmento, r.zona].filter(Boolean).join(" · ")}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {r.fechaVisita}
                          {r.mercaderista && <p className="text-slate-400">{r.mercaderista}</p>}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.inventarioKg.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
                          <p className="text-xs text-slate-400">
                            {r.unidades400} u. 400g · {r.unidades800} u. 800g
                            {r.depositoIncluido
                              ? r.depositoKg > 0
                                ? ` · dep. ${r.depositoKg.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`
                                : ""
                              : " · sin acceso a depósito"}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          {r.radarKg.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{pct(r.proporcionPct)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] font-normal ${NIVELES[r.nivel].badge}`}>
                            {NIVELES[r.nivel].label}
                          </Badge>
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
          <span className="font-medium text-slate-600">Inventario reportado</span>: última visita del mercaderista a
          cada PDV — unidades de 400 g y 800 g en anaquel más el depósito (si no tuvo acceso, solo anaquel).{" "}
          <span className="font-medium text-slate-600">Radar</span>: acumulado de Panquecitas despachado a ese PDV
          (Carga Radar). Mismos dos números que la lista de Sell-Out por cliente.{" "}
          <span className="font-medium text-red-700">Estancado</span>: el inventario es ≥ {data.umbralAltoPct}% de lo
          vendido; <span className="font-medium text-amber-700">rotación lenta</span>: entre {data.umbralMedioPct}% y{" "}
          {data.umbralAltoPct}%; <span className="font-medium text-emerald-700">rotando</span>: menos de{" "}
          {data.umbralMedioPct}%. <span className="font-medium text-slate-600">Sin producto</span>: tiene venta Radar
          pero el mercaderista no encontró producto — se vendió todo y toca reponer. Una proporción mayor a 100%
          significa más producto en tienda que todo lo que el Radar le vendió. De {data.visitados} PDV visitados en
          total, {data.visitadosSinRadar} no tienen venta Radar y no entran en este cruce.
        </p>
      </CardContent>
    </Card>
  );
}
