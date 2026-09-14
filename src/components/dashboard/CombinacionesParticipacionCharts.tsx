"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelColumn } from "@/lib/export-excel";
import type { CombinacionRow, CombinacionesResult } from "@/lib/mavesa-queries";

// Ventas de Panquecitas por PRECIO, por COMUNICACIÓN y la unión de los dos
// (DIENN, 14-09-2026). Recibe el mismo CombinacionesResult de la tabla —ya
// recortado en el servidor a la cartera actual o al piloto inicial— y solo
// agrupa sus filas.
//
// Codificación fija en los tres gráficos, para que el tercero se lea solo:
//   - COMUNICACIÓN = barra (azul Practicidad, verde Nutrición),
//   - PRECIO       = punto, con el mismo color en todos los gráficos.
// En la unión, la barra es el total de la comunicación y cada punto es lo que
// aportó un precio dentro de ella.
//
// El eje Y son las ventas. Tres lecturas:
//   - kg: ventas de Panquecitas del grupo.
//   - %: kg del grupo ÷ ventas totales del alcance.
//   - kg por PDV: kg del grupo ÷ sus PDV. Quita el efecto del tamaño — la
//     combinación 1 tiene tres grupos vendedores y la 2 uno solo.

type Vista = "kg" | "pct" | "porPdv";

const VISTAS: { key: Vista; label: string; eje: string }[] = [
  { key: "kg", label: "Ventas (kg)", eje: "Ventas (kg)" },
  { key: "pct", label: "% de las ventas totales", eje: "% de las ventas totales" },
  { key: "porPdv", label: "kg por PDV", eje: "kg por PDV" },
];

const ejeDe = (vista: Vista) => VISTAS.find((x) => x.key === vista)?.eje ?? "";

const COLOR_COMUNICACION: Record<string, string> = { Practicidad: "#0284c7", Nutrición: "#059669" };
const COLORES_PRECIO = ["#ea580c", "#7c3aed", "#db2777", "#ca8a04"];
const COLOR_BARRA_LEYENDA = "#94a3b8";

const precioTxt = (v: number) => v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kgTxt = (v: number) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
const fmtVista = (v: number, vista: Vista) =>
  vista === "pct"
    ? `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`
    : vista === "porPdv"
    ? `${v.toLocaleString("es-VE", { maximumFractionDigits: 2 })} kg`
    : `${v.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`;
const fmtEje = (v: number, vista: Vista) =>
  vista === "pct"
    ? `${v.toLocaleString("es-VE", { maximumFractionDigits: 0 })}%`
    : v.toLocaleString("es-VE", { maximumFractionDigits: vista === "porPdv" ? 1 : 0 });

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Precio de la combinación: son dos presentaciones, el par completo. */
function precioDe(f: CombinacionRow) {
  return `800g ${precioTxt(f.precio800)} · 400g ${precioTxt(f.precio400)}`;
}

interface Precio {
  /** Clave de la serie en el gráfico de unión: "p0", "p1"… */
  key: string;
  label: string;
  ciudad: string;
  color: string;
}

/** Fila de los gráficos: lo fijo más las columnas por precio del de unión. */
interface Fila {
  categoria: string;
  detalle: string;
  /** Valor de la vista activa: altura de la barra o del punto. */
  valor: number;
  kg: number;
  clientes: number;
  color: string;
  [columna: string]: string | number;
}

/** Techo del eje Y con aire para las etiquetas. */
function techo(valores: number[]): number {
  const max = Math.max(0, ...valores);
  return max > 0 ? max * 1.18 : 1;
}

const Graficos = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell } =
      await import("recharts");

    /** Punto de un precio, con el color que trae su fila. */
    function puntoPrecio(props: unknown) {
      const { cx, cy, index, payload } = props as {
        cx?: number;
        cy?: number;
        index?: number;
        payload?: { color?: string };
      };
      return (
        <circle
          key={`punto-${index ?? 0}`}
          cx={cx}
          cy={cy}
          r={9}
          fill={payload?.color ?? COLORES_PRECIO[0]}
          stroke="#ffffff"
          strokeWidth={2}
        />
      );
    }

    function GraficoPrecio({ data, vista }: { data: Fila[]; vista: Vista }) {
      const max = techo(data.map((f) => f.valor));
      return (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 28, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="categoria" tick={{ fontSize: 11, fill: "#475569" }} interval={0} />
            {/* El eje va directo en el gráfico y no envuelto en un componente
                propio: Recharts ubica sus ejes por tipo de hijo. */}
            <YAxis
              domain={[0, max]}
              width={72}
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(v) => fmtEje(Number(v ?? 0), vista)}
              label={{
                value: ejeDe(vista),
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "#64748b", textAnchor: "middle" },
              }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, _name, item) => {
                const f = (item as unknown as { payload?: Fila } | undefined)?.payload;
                return [
                  f ? `${fmtVista(Number(value ?? 0), vista)} · ${kgTxt(f.kg)} · ${f.clientes} PDV` : String(value),
                  "Precio",
                ];
              }}
              labelFormatter={(label, payload) => {
                const f = payload?.[0]?.payload as Fila | undefined;
                return f ? `${label} — ${f.detalle}` : String(label);
              }}
            />
            {/* Sin línea: solo puntos. Unirlos dibujaría una tendencia entre
                precios que no son una serie. */}
            <Line
              type="linear"
              dataKey="valor"
              name="Precio"
              stroke={COLORES_PRECIO[0]}
              strokeWidth={0}
              legendType="circle"
              dot={puntoPrecio}
              activeDot={false}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="valor"
                position="top"
                offset={16}
                fontSize={12}
                fontWeight={700}
                fill="#334155"
                formatter={(v) => (v == null ? "" : fmtVista(Number(v), vista))}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    function GraficoComunicacion({ data, vista }: { data: Fila[]; vista: Vista }) {
      const max = techo(data.map((f) => f.valor));
      return (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 28, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="categoria" tick={{ fontSize: 11, fill: "#475569" }} interval={0} />
            {/* El eje va directo en el gráfico y no envuelto en un componente
                propio: Recharts ubica sus ejes por tipo de hijo. */}
            <YAxis
              domain={[0, max]}
              width={72}
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(v) => fmtEje(Number(v ?? 0), vista)}
              label={{
                value: ejeDe(vista),
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "#64748b", textAnchor: "middle" },
              }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, _name, item) => {
                const f = (item as unknown as { payload?: Fila } | undefined)?.payload;
                return [
                  f ? `${fmtVista(Number(value ?? 0), vista)} · ${kgTxt(f.kg)} · ${f.clientes} PDV` : String(value),
                  "Comunicación",
                ];
              }}
              labelFormatter={(label, payload) => {
                const f = payload?.[0]?.payload as Fila | undefined;
                return f ? `${label} — ${f.detalle}` : String(label);
              }}
            />
            <Bar dataKey="valor" name="Comunicación" radius={[4, 4, 0, 0]} maxBarSize={110} isAnimationActive={false}>
              {data.map((f, i) => (
                <Cell key={i} fill={f.color} />
              ))}
              <LabelList
                dataKey="valor"
                position="top"
                fontSize={12}
                fontWeight={700}
                fill="#334155"
                formatter={(v) => (v == null ? "" : fmtVista(Number(v), vista))}
              />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    function GraficoUnion({ data, precios, vista }: { data: Fila[]; precios: Precio[]; vista: Vista }) {
      const max = techo(data.flatMap((f) => [f.valor, ...precios.map((p) => Number(f[p.key] ?? 0))]));
      return (
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={data} margin={{ top: 32, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="categoria" tick={{ fontSize: 12, fill: "#475569" }} interval={0} />
            {/* El eje va directo en el gráfico y no envuelto en un componente
                propio: Recharts ubica sus ejes por tipo de hijo. */}
            <YAxis
              domain={[0, max]}
              width={72}
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(v) => fmtEje(Number(v ?? 0), vista)}
              label={{
                value: ejeDe(vista),
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "#64748b", textAnchor: "middle" },
              }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name, item) => {
                const f = (item as unknown as { payload?: Fila } | undefined)?.payload;
                const precio = precios.find((p) => p.label === name);
                const kg = f ? Number(precio ? f[`${precio.key}_kg`] ?? 0 : f.kg) : 0;
                const pdv = f ? Number(precio ? f[`${precio.key}_pdv`] ?? 0 : f.clientes) : 0;
                return [`${fmtVista(Number(value ?? 0), vista)} · ${kgTxt(kg)} · ${pdv} PDV`, String(name ?? "")];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="valor"
              name="Total de la comunicación"
              fill={COLOR_BARRA_LEYENDA}
              radius={[4, 4, 0, 0]}
              maxBarSize={140}
              isAnimationActive={false}
            >
              {data.map((f, i) => (
                <Cell key={i} fill={f.color} fillOpacity={0.35} stroke={f.color} strokeWidth={1.5} />
              ))}
              <LabelList
                dataKey="valor"
                position="top"
                offset={14}
                fontSize={12}
                fontWeight={700}
                fill="#334155"
                formatter={(v) => (v == null ? "" : `Total ${fmtVista(Number(v), vista)}`)}
              />
            </Bar>
            {precios.map((p, i) => (
              <Line
                key={p.key}
                type="linear"
                dataKey={p.key}
                name={p.label}
                stroke={p.color}
                strokeWidth={0}
                legendType="circle"
                dot={{ r: 9, fill: p.color, stroke: "#ffffff", strokeWidth: 2 }}
                activeDot={{ r: 11 }}
                isAnimationActive={false}
              >
                {/* Un precio a cada lado del punto: si dos precios aportan
                    parecido dentro de la misma comunicación, sus etiquetas no
                    se pisan. */}
                <LabelList
                  dataKey={p.key}
                  position={i % 2 === 0 ? "left" : "right"}
                  offset={14}
                  fontSize={12}
                  fontWeight={700}
                  fill={p.color}
                  formatter={(v) => (v == null ? "" : fmtVista(Number(v), vista))}
                />
              </Line>
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    function ParticipacionInner({
      porPrecio,
      porComunicacion,
      union,
      precios,
      vista,
    }: {
      porPrecio: Fila[];
      porComunicacion: Fila[];
      union: Fila[];
      precios: Precio[];
      vista: Vista;
    }) {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                1 · Por precio (puntos)
              </p>
              <GraficoPrecio data={porPrecio} vista={vista} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                2 · Por comunicación (barras)
              </p>
              <GraficoComunicacion data={porComunicacion} vista={vista} />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              3 · Comunicación × precio — la barra es el total de la comunicación, cada punto lo que aportó un precio
            </p>
            <GraficoUnion data={union} precios={precios} vista={vista} />
          </div>
        </div>
      );
    }

    return ParticipacionInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[700px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function CombinacionesParticipacionCharts({
  data,
  titulo,
  alcance,
}: {
  data: CombinacionesResult;
  titulo: string;
  /** Cómo se nombra la población en los textos, ej. "los PDV del piloto inicial". */
  alcance: string;
}) {
  const [vista, setVista] = useState<Vista>("kg");

  const calculo = useMemo(() => {
    const sumaFilas = data.filas.reduce((s, f) => s + f.panquecitasKg, 0);
    // Ventas totales del alcance: incluye PDV sin combinación. Si el servidor
    // no lo trae, la suma de las filas.
    const total = data.totalPanquecitasKg > 0 ? data.totalPanquecitasKg : sumaFilas;
    const pctDe = (kg: number) => (total > 0 ? r1((kg / total) * 100) : 0);
    const valorDe = (kg: number, clientes: number) =>
      vista === "pct" ? pctDe(kg) : vista === "porPdv" ? (clientes > 0 ? r2(kg / clientes) : 0) : r1(kg);

    // Precios distintos, del más barato al más caro. El color queda fijo por
    // precio y se repite en el gráfico de puntos y en el de unión.
    const precios: Precio[] = [];
    for (const f of [...data.filas].sort((a, b) => a.precio800 - b.precio800 || a.precio400 - b.precio400)) {
      const label = precioDe(f);
      if (precios.some((p) => p.label === label)) continue;
      precios.push({
        key: `p${precios.length}`,
        label,
        ciudad: f.ciudad,
        color: COLORES_PRECIO[precios.length % COLORES_PRECIO.length],
      });
    }
    const precioDeFila = (f: CombinacionRow) => precios.find((p) => p.label === precioDe(f))!;

    const porPrecio: Fila[] = precios.map((p) => {
      const filas = data.filas.filter((f) => precioDe(f) === p.label);
      const kg = filas.reduce((s, f) => s + f.panquecitasKg, 0);
      const clientes = filas.reduce((s, f) => s + f.clientes, 0);
      return {
        categoria: `${p.label} (${p.ciudad})`,
        detalle: p.ciudad,
        valor: valorDe(kg, clientes),
        kg: r1(kg),
        clientes,
        color: p.color,
      };
    });

    const comunicaciones = [...new Set(data.filas.map((f) => f.comunicacion))];

    const porComunicacion: Fila[] = [];
    const union: Fila[] = [];
    for (const c of comunicaciones) {
      const filas = data.filas.filter((f) => f.comunicacion === c);
      const kg = filas.reduce((s, f) => s + f.panquecitasKg, 0);
      const clientes = filas.reduce((s, f) => s + f.clientes, 0);
      const base: Fila = {
        categoria: c,
        detalle: [...new Set(filas.map((f) => f.ciudad))].join(" / "),
        valor: valorDe(kg, clientes),
        kg: r1(kg),
        clientes,
        color: COLOR_COMUNICACION[c] ?? "#64748b",
      };
      porComunicacion.push(base);

      const fila: Fila = { ...base };
      for (const p of precios) {
        const delPrecio = filas.filter((f) => precioDeFila(f).key === p.key);
        const kgP = delPrecio.reduce((s, f) => s + f.panquecitasKg, 0);
        const pdvP = delPrecio.reduce((s, f) => s + f.clientes, 0);
        fila[p.key] = valorDe(kgP, pdvP);
        fila[`${p.key}_kg`] = r1(kgP);
        fila[`${p.key}_pdv`] = pdvP;
      }
      union.push(fila);
    }

    return {
      total,
      totalPdv: data.filas.reduce((s, f) => s + f.clientes, 0) + data.sinCombinacion,
      fueraDeCombinacionKg: r1(Math.max(0, total - sumaFilas)),
      precios,
      porPrecio,
      porComunicacion,
      union,
      pctDe,
    };
  }, [data, vista]);

  if (data.filas.length === 0) return null;

  const columnas: ExcelColumn<CombinacionRow>[] = [
    { header: "Combinación", value: (r) => r.nombre, width: 16 },
    { header: "Ciudad", value: (r) => r.ciudad, width: 16 },
    { header: "Precio 800g", value: (r) => r.precio800, width: 12 },
    { header: "Precio 400g", value: (r) => r.precio400, width: 12 },
    { header: "Comunicación", value: (r) => r.comunicacion, width: 14 },
    { header: "PDV", value: (r) => r.clientes, width: 8 },
    { header: "Ventas Panquecitas (kg)", value: (r) => r.panquecitasKg, width: 22 },
    { header: "% de las ventas totales", value: (r) => calculo.pctDe(r.panquecitasKg), width: 22 },
    { header: "kg por PDV", value: (r) => (r.clientes > 0 ? r2(r.panquecitasKg / r.clientes) : 0), width: 12 },
    { header: "Ventas totales del alcance (kg)", value: () => calculo.total, width: 28 },
  ];

  return (
    <Card className="mb-6 print-avoid-break">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between space-y-0">
        <div>
          <CardTitle>{titulo}</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Ventas de Panquecitas de {alcance}: <span className="font-medium">{kgTxt(calculo.total)}</span> en{" "}
            {calculo.totalPdv} PDV. Cuánto salió de cada precio (puntos), de cada eje de comunicación (barras) y de
            la unión de los dos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {VISTAS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setVista(key)}
                className={`px-3 py-1.5 transition-colors ${
                  vista === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <ExportExcelButton filename={titulo} rows={data.filas} columns={columnas} />
        </div>
      </CardHeader>
      <CardContent>
        {calculo.total > 0 ? (
          <Graficos
            porPrecio={calculo.porPrecio}
            porComunicacion={calculo.porComunicacion}
            union={calculo.union}
            precios={calculo.precios}
            vista={vista}
          />
        ) : (
          <div className="h-[240px] flex items-center justify-center text-slate-400">
            <div className="text-center">
              <p className="text-4xl mb-2">📊</p>
              <p>Sin ventas de Panquecitas todavía para {alcance}.</p>
            </div>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          El eje vertical son las ventas desde el {data.desdePanquecitas}.{" "}
          {vista === "kg" && (
            <>
              <span className="font-medium text-slate-600">Ventas (kg)</span>: kg de Panquecitas del grupo. En la
              unión, los puntos de una misma barra suman el total de esa comunicación.
            </>
          )}
          {vista === "pct" && (
            <>
              <span className="font-medium text-slate-600">% de las ventas totales</span>: kg del grupo ÷ las ventas
              totales de {alcance}. En la unión, los puntos de una misma barra suman el % de esa comunicación.
            </>
          )}
          {vista === "porPdv" && (
            <>
              <span className="font-medium text-slate-600">kg por PDV</span>: kg del grupo ÷ sus PDV (hayan comprado o
              no). Quita el efecto del tamaño de cada grupo; acá los puntos no suman la barra, porque cada uno se
              divide entre sus propios PDV.
            </>
          )}{" "}
          Kg y % dependen también de cuántos PDV tiene cada grupo. Cada precio corrió en una sola ciudad (Cumaná o
          Cabudare), así que comparar precios también es comparar ciudades.
          {calculo.fueraDeCombinacionKg > 0 && (
            <>
              {" "}
              {kgTxt(calculo.fueraDeCombinacionKg)} vienen de PDV cuyo grupo vendedor no está en ninguna combinación:
              cuentan en el total pero en ningún gráfico.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
