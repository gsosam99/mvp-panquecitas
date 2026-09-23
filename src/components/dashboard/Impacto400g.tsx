"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportExcelMultiButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelSheetSpec } from "@/lib/export-excel";
import type { Sector } from "@/lib/sectors";
import { DIAS_HABILES_POR_SEMANA } from "@/lib/business-days";
import {
  BASE_DESDE_400G,
  BASE_HASTA_400G,
  DIAS_HABILES_MES,
  FECHA_BLOQUEO_400G,
  lunesDe,
  resumirImpacto400g,
  type GrupoPresentacion,
  type Impacto400gCliente,
  type Impacto400gResult,
} from "@/lib/impacto-400g-utils";

// Cuánto volumen se deja de vender desde que el 400g se bloqueó (15-09) y
// cuánto absorbe el 800g, contra el ritmo de las 4 semanas previas. Query en
// src/lib/impacto-400g.ts; criterio en impacto-400g-utils.ts.

const GRUPOS: GrupoPresentacion[] = ["SOLO_400", "AMBAS", "SOLO_800", "NUEVO"];

const GRUPO_LABELS: Record<GrupoPresentacion, string> = {
  SOLO_400: "Solo compraba 400g",
  AMBAS: "Compraba ambas",
  SOLO_800: "Solo compraba 800g",
  NUEVO: "Nuevo después del bloqueo",
};

const GRUPO_BADGES: Record<GrupoPresentacion, string> = {
  SOLO_400: "border-rose-300 text-rose-700 bg-rose-50",
  AMBAS: "border-amber-300 text-amber-700 bg-amber-50",
  SOLO_800: "border-sky-300 text-sky-700 bg-sky-50",
  NUEVO: "border-emerald-300 text-emerald-700 bg-emerald-50",
};

type FiltroLista = "SOLO_400_SIN_800" | "SOLO_400" | "CON_400";

const FILTRO_LABELS: Record<FiltroLista, string> = {
  SOLO_400_SIN_800: "Solo 400g sin pasar a 800g",
  SOLO_400: "Solo 400g (todos)",
  CON_400: "Todos los que compraban 400g",
};

const COLOR_400 = "#f5a623";
const COLOR_800 = "#1a65bd";

const num = (v: number, dec = 1) => v.toLocaleString("es-VE", { maximumFractionDigits: dec });
const ton = (kg: number) => (kg / 1000).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctTxt = (v: number | null) => (v == null ? "—" : `${num(v)}%`);
const pct = (parte: number, total: number) => (total > 0 ? `${num((parte / total) * 100)}%` : "—");
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
const fechaLarga = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

interface SemanaPunto {
  lunes: string;
  label: string;
  kg400: number;
  kg800: number;
  total: number;
}

const SemanalChart = dynamic(
  async () => {
    const {
      ResponsiveContainer,
      BarChart,
      Bar,
      XAxis,
      YAxis,
      CartesianGrid,
      Tooltip,
      Legend,
      ReferenceLine,
      LabelList,
    } = await import("recharts");

    const kgTxt = (v: number) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`;

    // Alto mínimo (px) de un tramo para que su número quepa adentro.
    const ALTO_MIN_ETIQUETA = 16;

    /**
     * kg de un tramo de la pila, centrado adentro. Si el tramo es muy bajo para
     * que el número quepa sin pisar al de al lado, va a la derecha de la barra,
     * a la altura del tramo — el hueco entre barras está libre.
     */
    function etiquetaTramo(colorTexto: string) {
      return function EtiquetaTramo(props: unknown) {
        const { x, y, width, height, value } = props as {
          x: number;
          y: number;
          width: number;
          height: number;
          value: number;
        };
        if (!value || value <= 0) return null;
        const cabe = height >= ALTO_MIN_ETIQUETA;
        return (
          <text
            x={cabe ? x + width / 2 : x + width + 4}
            y={y + height / 2}
            textAnchor={cabe ? "middle" : "start"}
            dominantBaseline="central"
            fontSize={10}
            fontWeight={600}
            fill={cabe ? "#ffffff" : colorTexto}
          >
            {kgTxt(value)}
          </text>
        );
      };
    }

    function SemanalInner({ data, semanaBloqueo }: { data: SemanaPunto[]; semanaBloqueo: string }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 24, right: 16, left: 16, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
            {/* Sin escala: cada barra lleva sus números. Holgura arriba para el total. */}
            <YAxis hide domain={[0, (dataMax: number) => dataMax * 1.12]} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              labelFormatter={(label) => `Semana del ${String(label)}`}
              formatter={(value, name) => [
                `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`,
                name === "kg400" ? "400g" : "800g",
              ]}
            />
            <Legend
              formatter={(value: string) => (value === "kg400" ? "400g" : "800g")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <ReferenceLine
              x={semanaBloqueo}
              stroke="#e11d48"
              strokeDasharray="4 4"
              label={{ value: "Bloqueo 400g", position: "top", fontSize: 11, fill: "#e11d48" }}
            />
            <Bar dataKey="kg400" stackId="presentacion" fill={COLOR_400} maxBarSize={48}>
              <LabelList dataKey="kg400" content={etiquetaTramo("#b45309")} />
            </Bar>
            <Bar dataKey="kg800" stackId="presentacion" fill={COLOR_800} radius={[3, 3, 0, 0]} maxBarSize={48}>
              <LabelList dataKey="kg800" content={etiquetaTramo(COLOR_800)} />
              {/* Total de la semana, encima de la pila. */}
              <LabelList
                dataKey="total"
                position="top"
                fill="#334155"
                fontSize={11}
                fontWeight={700}
                formatter={(v) => (Number(v ?? 0) > 0 ? kgTxt(Number(v ?? 0)) : "")}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return SemanalInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[300px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

interface FilaGrupo {
  grupo: GrupoPresentacion;
  clientes: number;
  kg400Base: number;
  kg800Base: number;
  pasaron800: number;
  kg800Post: number;
}

interface FilaSegmento {
  segmento: string;
  kg400Base: number;
  kgBase: number;
  solo400: number;
  solo400SinMigrar: number;
}

export function Impacto400g({
  data,
  sector,
  filtroTexto,
  sectorLabels,
}: {
  data: Impacto400gResult;
  /** Pestaña activa del dashboard: acota todo el bloque. */
  sector: "TOTAL" | Sector;
  filtroTexto: string;
  sectorLabels: Record<Sector, string>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtroLista, setFiltroLista] = useState<FiltroLista>("SOLO_400_SIN_800");

  const dias = useMemo(
    () => (sector === "TOTAL" ? data.dias : data.dias.filter((d) => d.sector === sector)),
    [data.dias, sector]
  );
  const clientes = useMemo(
    () => (sector === "TOTAL" ? data.clientes : data.clientes.filter((c) => c.sector === sector)),
    [data.clientes, sector]
  );

  const resumen = useMemo(() => resumirImpacto400g(dias, data.fechaCorte), [dias, data.fechaCorte]);

  const semanas = useMemo<SemanaPunto[]>(() => {
    const porSemana = new Map<string, SemanaPunto>();
    for (const d of dias) {
      const lunes = lunesDe(d.fecha);
      let s = porSemana.get(lunes);
      if (!s) porSemana.set(lunes, (s = { lunes, label: fechaCorta(lunes), kg400: 0, kg800: 0, total: 0 }));
      s.kg400 += d.kg400;
      s.kg800 += d.kg800;
    }
    return [...porSemana.values()]
      .sort((a, b) => a.lunes.localeCompare(b.lunes))
      .map((s) => ({
        ...s,
        kg400: Math.round(s.kg400 * 10) / 10,
        kg800: Math.round(s.kg800 * 10) / 10,
        total: Math.round((s.kg400 + s.kg800) * 10) / 10,
      }));
  }, [dias]);

  const porGrupo = useMemo<FilaGrupo[]>(
    () =>
      GRUPOS.map((grupo) => {
        const rows = clientes.filter((c) => c.grupo === grupo);
        return {
          grupo,
          clientes: rows.length,
          kg400Base: rows.reduce((acc, c) => acc + c.kg400Base, 0),
          kg800Base: rows.reduce((acc, c) => acc + c.kg800Base, 0),
          pasaron800: rows.filter((c) => c.kg800Post > 0).length,
          kg800Post: rows.reduce((acc, c) => acc + c.kg800Post, 0),
        };
      }),
    [clientes]
  );

  const porSegmento = useMemo<FilaSegmento[]>(() => {
    const grupos = new Map<string, FilaSegmento>();
    for (const c of clientes) {
      if (c.grupo === "NUEVO") continue;
      let f = grupos.get(c.segmento);
      if (!f) grupos.set(c.segmento, (f = { segmento: c.segmento, kg400Base: 0, kgBase: 0, solo400: 0, solo400SinMigrar: 0 }));
      f.kg400Base += c.kg400Base;
      f.kgBase += c.kg400Base + c.kg800Base;
      if (c.grupo === "SOLO_400") {
        f.solo400 += 1;
        if (c.kg800Post <= 0) f.solo400SinMigrar += 1;
      }
    }
    return [...grupos.values()].sort((a, b) => b.kg400Base - a.kg400Base || a.segmento.localeCompare(b.segmento));
  }, [clientes]);

  const lista = useMemo(
    () =>
      clientes.filter((c) => {
        if (filtroLista === "CON_400") return c.kg400Base > 0;
        if (filtroLista === "SOLO_400") return c.grupo === "SOLO_400";
        return c.grupo === "SOLO_400" && c.kg800Post <= 0;
      }),
    [clientes, filtroLista]
  );

  if (!data.fechaCorte || resumen.kg400Base + resumen.kg800Base <= 0) return null;

  const semanaBloqueo = fechaCorta(lunesDe(FECHA_BLOQUEO_400G));
  const ritmo400Semana = resumen.ritmo400Base * DIAS_HABILES_POR_SEMANA;
  const ritmo400Mes = resumen.ritmo400Base * DIAS_HABILES_MES;
  const solo400 = porGrupo.find((g) => g.grupo === "SOLO_400")!;
  const kg400BaseGrupos = porGrupo.reduce((acc, g) => acc + g.kg400Base, 0);
  const hayPost = resumen.diasPost > 0;

  const hojas: ExcelSheetSpec<unknown>[] = [
    {
      sheetName: "Resumen",
      rows: [
        ["Período base", `${fechaLarga(BASE_DESDE_400G)} a ${fechaLarga(BASE_HASTA_400G)} (${resumen.diasBase} días hábiles)`],
        ["Fecha de bloqueo", fechaLarga(FECHA_BLOQUEO_400G)],
        ["Fecha de corte", fechaLarga(data.fechaCorte)],
        ["Días hábiles desde el bloqueo", resumen.diasPost],
        ["400g en la base (kg)", Math.round(resumen.kg400Base)],
        ["800g en la base (kg)", Math.round(resumen.kg800Base)],
        ["% del volumen que era 400g", resumen.pct400Base == null ? "" : Math.round(resumen.pct400Base * 10) / 10],
        ["Ritmo 400g (kg/semana)", Math.round(ritmo400Semana)],
        ["Ritmo 400g (kg/mes)", Math.round(ritmo400Mes)],
        ["400g esperado desde el bloqueo (kg)", Math.round(resumen.esperado400Post)],
        ["400g vendido desde el bloqueo (kg)", Math.round(resumen.kg400Post)],
        ["400g no vendido (kg)", Math.round(resumen.kg400NoVendido)],
        ["800g esperado desde el bloqueo (kg)", Math.round(resumen.esperado800Post)],
        ["800g vendido desde el bloqueo (kg)", Math.round(resumen.kg800Post)],
        ["Ganancia del 800g (kg)", Math.round(resumen.ganancia800)],
        ["% sustitución hacia 800g", resumen.sustitucionPct == null ? "" : Math.round(resumen.sustitucionPct * 10) / 10],
        ["Pérdida neta (kg)", Math.round(resumen.perdidaNeta)],
      ],
      columns: [
        { header: "Indicador", value: (r) => (r as [string, string | number])[0], width: 38 },
        { header: "Valor", value: (r) => (r as [string, string | number])[1], width: 36 },
      ],
    },
    {
      sheetName: "Semanal",
      rows: semanas,
      columns: [
        { header: "Semana (lunes)", value: (r) => (r as SemanaPunto).lunes, width: 16 },
        { header: "400g (kg)", value: (r) => (r as SemanaPunto).kg400, width: 12 },
        { header: "800g (kg)", value: (r) => (r as SemanaPunto).kg800, width: 12 },
        { header: "Total (kg)", value: (r) => Math.round(((r as SemanaPunto).kg400 + (r as SemanaPunto).kg800) * 10) / 10, width: 12 },
      ],
    },
    {
      sheetName: "Por grupo",
      rows: porGrupo,
      columns: [
        { header: "Grupo", value: (r) => GRUPO_LABELS[(r as FilaGrupo).grupo], width: 26 },
        { header: "Clientes", value: (r) => (r as FilaGrupo).clientes, width: 10 },
        { header: "400g base (kg)", value: (r) => Math.round((r as FilaGrupo).kg400Base * 10) / 10, width: 14 },
        { header: "% del 400g", value: (r) => pct((r as FilaGrupo).kg400Base, kg400BaseGrupos), width: 12 },
        { header: "800g base (kg)", value: (r) => Math.round((r as FilaGrupo).kg800Base * 10) / 10, width: 14 },
        { header: "Compraron 800g después", value: (r) => (r as FilaGrupo).pasaron800, width: 20 },
        { header: "800g después (kg)", value: (r) => Math.round((r as FilaGrupo).kg800Post * 10) / 10, width: 16 },
      ],
    },
    {
      sheetName: "Por segmento",
      rows: porSegmento,
      columns: [
        { header: "Segmento", value: (r) => (r as FilaSegmento).segmento, width: 26 },
        { header: "400g base (kg)", value: (r) => Math.round((r as FilaSegmento).kg400Base * 10) / 10, width: 14 },
        { header: "Total base (kg)", value: (r) => Math.round((r as FilaSegmento).kgBase * 10) / 10, width: 14 },
        { header: "% 400g", value: (r) => pct((r as FilaSegmento).kg400Base, (r as FilaSegmento).kgBase), width: 10 },
        { header: "Clientes solo 400g", value: (r) => (r as FilaSegmento).solo400, width: 16 },
        { header: "Solo 400g sin pasar a 800g", value: (r) => (r as FilaSegmento).solo400SinMigrar, width: 22 },
      ],
    },
    {
      sheetName: "Clientes",
      rows: clientes,
      columns: [
        { header: "Código SAP", value: (r) => (r as Impacto400gCliente).sapCode, width: 14 },
        { header: "Cliente", value: (r) => (r as Impacto400gCliente).nombre, width: 34 },
        { header: "Ciudad", value: (r) => sectorLabels[(r as Impacto400gCliente).sector], width: 20 },
        { header: "Municipio", value: (r) => (r as Impacto400gCliente).municipio ?? "", width: 18 },
        { header: "Segmento", value: (r) => (r as Impacto400gCliente).segmento, width: 24 },
        { header: "Grupo", value: (r) => GRUPO_LABELS[(r as Impacto400gCliente).grupo], width: 24 },
        { header: "400g base (kg)", value: (r) => (r as Impacto400gCliente).kg400Base, width: 14 },
        { header: "800g base (kg)", value: (r) => (r as Impacto400gCliente).kg800Base, width: 14 },
        { header: "400g después (kg)", value: (r) => (r as Impacto400gCliente).kg400Post, width: 16 },
        { header: "800g después (kg)", value: (r) => (r as Impacto400gCliente).kg800Post, width: 16 },
      ],
    },
  ];

  return (
    <Card className="mb-6 print-avoid-break">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle>Impacto bloqueo 400g</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Radar de Panquecitas por presentación. El 400g se bloqueó el{" "}
            <span className="font-medium">{fechaLarga(FECHA_BLOQUEO_400G)}</span>. Base: las 4 semanas previas (
            {fechaLarga(BASE_DESDE_400G)} a {fechaLarga(BASE_HASTA_400G)}, {resumen.diasBase} días hábiles). Lo
            esperado es ese ritmo por día hábil × los días hábiles desde el bloqueo hasta el corte (
            <span className="font-medium">{fechaLarga(data.fechaCorte)}</span>, {resumen.diasPost} días hábiles).
            Incluye PDV fuera de cartera — {filtroTexto}
          </p>
        </div>
        <ExportExcelMultiButton filename={`Impacto bloqueo 400g — ${filtroTexto}`} sheets={hojas} />
      </CardHeader>
      <CardContent>
        {/* ── Indicadores ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <Resumen
            titulo="400g que se deja de vender"
            valor={`${ton(ritmo400Semana)} t/sem`}
            nota={`≈ ${ton(ritmo400Mes)} t/mes · era el ${pctTxt(resumen.pct400Base)} del volumen en la base`}
            clase="border-amber-300 bg-amber-50 text-amber-900"
          />
          <Resumen
            titulo="400g no vendido desde el bloqueo"
            valor={hayPost ? `${ton(resumen.kg400NoVendido)} t` : "—"}
            nota={
              hayPost
                ? `Esperado ${ton(resumen.esperado400Post)} t · aún salió ${ton(resumen.kg400Post)} t (remanente)`
                : "Todavía no hay Radar posterior al bloqueo"
            }
          />
          <Resumen
            titulo="Sustitución hacia 800g"
            valor={
              hayPost && resumen.sustitucionPct != null ? pctTxt(Math.max(0, resumen.sustitucionPct)) : "—"
            }
            nota={
              hayPost
                ? `${resumen.ganancia800 < 0 ? "El 800g no subió: " : "800g: "}${ton(resumen.kg800Post)} t vendidas vs ${ton(
                    resumen.esperado800Post
                  )} t a su ritmo base (${resumen.ganancia800 >= 0 ? "+" : ""}${ton(resumen.ganancia800)} t)`
                : "Qué parte del 400g perdido recupera el 800g"
            }
            clase="border-sky-300 bg-sky-50 text-sky-900"
          />
          <Resumen
            titulo="Pérdida neta"
            valor={hayPost ? `${ton(resumen.perdidaNeta)} t` : "—"}
            nota="Venta total esperada − real desde el bloqueo (400g no vendido − variación del 800g)"
            clase="border-rose-300 bg-rose-50 text-rose-900"
          />
        </div>

        {/* ── Semanal 400g / 800g ────────────────────────────────────── */}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          kg Radar por semana — 400g vs 800g
        </p>
        <div className="mb-5">
          <SemanalChart data={semanas} semanaBloqueo={semanaBloqueo} />
        </div>

        {/* ── Por grupo de cliente ───────────────────────────────────── */}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Clientes según qué compraban en la base
        </p>
        <div className="overflow-x-auto mb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
                <TableHead className="text-right">400g base (kg)</TableHead>
                <TableHead className="text-right">% del 400g</TableHead>
                <TableHead className="text-right">800g base (kg)</TableHead>
                <TableHead className="text-right">Compraron 800g después</TableHead>
                <TableHead className="text-right">% que compró 800g</TableHead>
                <TableHead className="text-right">800g después (kg)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porGrupo.map((g) => (
                <TableRow key={g.grupo}>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] font-normal ${GRUPO_BADGES[g.grupo]}`}>
                      {GRUPO_LABELS[g.grupo]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{num(g.clientes, 0)}</TableCell>
                  <TableCell className="text-right">{num(g.kg400Base)}</TableCell>
                  <TableCell className="text-right text-slate-500">{pct(g.kg400Base, kg400BaseGrupos)}</TableCell>
                  <TableCell className="text-right">{num(g.kg800Base)}</TableCell>
                  <TableCell className="text-right">{num(g.pasaron800, 0)}</TableCell>
                  <TableCell className="text-right text-slate-500">{pct(g.pasaron800, g.clientes)}</TableCell>
                  <TableCell className="text-right">{num(g.kg800Post)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* ── Por segmento ───────────────────────────────────────────── */}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Peso del 400g por segmento (base)
        </p>
        <div className="overflow-x-auto mb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segmento</TableHead>
                <TableHead className="text-right">400g base (kg)</TableHead>
                <TableHead className="text-right">Total base (kg)</TableHead>
                <TableHead className="text-right">% 400g</TableHead>
                <TableHead className="text-right">Clientes solo 400g</TableHead>
                <TableHead className="text-right">Sin pasar a 800g</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porSegmento.map((f) => (
                <TableRow key={f.segmento}>
                  <TableCell className="font-medium">{f.segmento}</TableCell>
                  <TableCell className="text-right font-semibold">{num(f.kg400Base)}</TableCell>
                  <TableCell className="text-right text-slate-500">{num(f.kgBase)}</TableCell>
                  <TableCell className="text-right">{pct(f.kg400Base, f.kgBase)}</TableCell>
                  <TableCell className="text-right">{num(f.solo400, 0)}</TableCell>
                  <TableCell className="text-right text-rose-700">{num(f.solo400SinMigrar, 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* ── Lista desplegable ──────────────────────────────────────── */}
        <button
          onClick={() => setAbierto((v) => !v)}
          className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 print:hidden"
        >
          <span>
            {abierto ? "Ocultar" : "Ver"} clientes que dependían del 400g ({num(solo400.clientes - solo400.pasaron800, 0)}{" "}
            de {num(solo400.clientes, 0)} sin comprar 800g)
          </span>
          <span className="text-slate-400">{abierto ? "▲" : "▼"}</span>
        </button>

        {abierto && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {(Object.keys(FILTRO_LABELS) as FiltroLista[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltroLista(f)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    filtroLista === f
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {FILTRO_LABELS[f]}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto max-h-[560px] overflow-y-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Segmento</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead className="text-right">400g base (kg)</TableHead>
                    <TableHead className="text-right">800g base (kg)</TableHead>
                    <TableHead className="text-right">800g después (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((c) => (
                    <TableRow key={c.locationId}>
                      <TableCell>
                        <p className="font-medium">{c.nombre}</p>
                        <p className="text-[11px] text-slate-400">{c.sapCode}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {sectorLabels[c.sector]}
                        {c.municipio && <p className="text-[11px] text-slate-400">{c.municipio}</p>}
                      </TableCell>
                      <TableCell className="text-xs">{c.segmento}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] font-normal ${GRUPO_BADGES[c.grupo]}`}>
                          {GRUPO_LABELS[c.grupo]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{num(c.kg400Base)}</TableCell>
                      <TableCell className="text-right text-slate-500">{num(c.kg800Base)}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${c.kg800Post > 0 ? "text-emerald-700" : "text-rose-700"}`}
                      >
                        {c.kg800Post > 0 ? num(c.kg800Post) : "Sin compra"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {lista.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-slate-400 py-6">
                        Ningún cliente con este filtro.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Resumen({ titulo, valor, nota, clase }: { titulo: string; valor: string; nota: string; clase?: string }) {
  return (
    <div className={`rounded-lg border p-3 ${clase ?? "border-slate-200"}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-70 leading-tight">{titulo}</p>
      <p className="text-2xl font-bold mt-1">{valor}</p>
      <p className="text-xs opacity-70 mt-0.5">{nota}</p>
    </div>
  );
}
