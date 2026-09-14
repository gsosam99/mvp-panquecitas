"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelColumn } from "@/lib/export-excel";
import type { CombinacionRow, CombinacionesResult } from "@/lib/mavesa-queries";

// Participación de cada PRECIO, cada COMUNICACIÓN y su cruce sobre las ventas
// totales de Panquecitas (DIENN, 14-09-2026). Pensado para la cartera del
// piloto inicial: recibe el mismo CombinacionesResult de la tabla, ya recortado
// a esa tanda en el servidor, y solo agrupa sus filas.
//
// Dos vistas:
//   - % de las ventas: kg del grupo ÷ ventas totales del alcance.
//   - kg por PDV: kg del grupo ÷ sus PDV. Hace falta porque el % depende del
//     tamaño del grupo — la combinación 1 tiene tres grupos vendedores y la 2
//     uno solo.

type Vista = "pct" | "porPdv";

interface Grupo {
  categoria: string;
  detalle: string;
  kg: number;
  clientes: number;
  pct: number;
  porPdv: number;
  color: string;
}

interface CrucePunto {
  precio: string;
  detalle: string;
  practicidadPct: number;
  practicidadPorPdv: number;
  practicidadKg: number;
  practicidadPdv: number;
  nutricionPct: number;
  nutricionPorPdv: number;
  nutricionKg: number;
  nutricionPdv: number;
}

const COLOR_COMUNICACION: Record<string, string> = { Practicidad: "#0284c7", Nutrición: "#059669" };
const COLORES_PRECIO = ["#6366f1", "#c026d3", "#0d9488", "#ea580c"];

const precioTxt = (v: number) => v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kgTxt = (v: number) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
const fmtVista = (v: number, vista: Vista) =>
  vista === "pct"
    ? `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`
    : `${v.toLocaleString("es-VE", { maximumFractionDigits: 2 })} kg`;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function precioDe(f: CombinacionRow) {
  return `800g ${precioTxt(f.precio800)} · 400g ${precioTxt(f.precio400)}`;
}

const Graficos = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell } =
      await import("recharts");

    function PanelSimple({ data, vista }: { data: Grupo[]; vista: Vista }) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 28, right: 16, left: 16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="categoria" tick={{ fontSize: 11, fill: "#475569" }} interval={0} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, _name, item) => {
                const g = item?.payload as Grupo | undefined;
                return [
                  g ? `${fmtVista(Number(value ?? 0), vista)} · ${kgTxt(g.kg)} · ${g.clientes} PDV` : String(value),
                  vista === "pct" ? "% de las ventas" : "kg por PDV",
                ];
              }}
              labelFormatter={(label, payload) => {
                const g = payload?.[0]?.payload as Grupo | undefined;
                return g ? `${label} — ${g.detalle}` : String(label);
              }}
            />
            <Bar dataKey={vista} radius={[4, 4, 0, 0]} maxBarSize={90}>
              {data.map((g) => (
                <Cell key={g.categoria} fill={g.color} />
              ))}
              <LabelList
                dataKey={vista}
                position="top"
                fontSize={12}
                fontWeight={700}
                formatter={(v) => fmtVista(Number(v ?? 0), vista)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    function PanelCruce({ data, vista }: { data: CrucePunto[]; vista: Vista }) {
      const sufijo = vista === "pct" ? "Pct" : "PorPdv";
      return (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 28, right: 16, left: 16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="precio" tick={{ fontSize: 11, fill: "#475569" }} interval={0} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name, item) => {
                const p = item?.payload as CrucePunto | undefined;
                const esPract = name === "Practicidad";
                const kg = p ? (esPract ? p.practicidadKg : p.nutricionKg) : 0;
                const pdv = p ? (esPract ? p.practicidadPdv : p.nutricionPdv) : 0;
                return [`${fmtVista(Number(value ?? 0), vista)} · ${kgTxt(kg)} · ${pdv} PDV`, String(name ?? "")];
              }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as CrucePunto | undefined;
                return p ? `${label} — ${p.detalle}` : String(label);
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey={`practicidad${sufijo}`}
              name="Practicidad"
              fill={COLOR_COMUNICACION.Practicidad}
              radius={[4, 4, 0, 0]}
              maxBarSize={80}
            >
              <LabelList
                dataKey={`practicidad${sufijo}`}
                position="top"
                fontSize={12}
                fontWeight={700}
                formatter={(v) => fmtVista(Number(v ?? 0), vista)}
              />
            </Bar>
            <Bar
              dataKey={`nutricion${sufijo}`}
              name="Nutrición"
              fill={COLOR_COMUNICACION["Nutrición"]}
              radius={[4, 4, 0, 0]}
              maxBarSize={80}
            >
              <LabelList
                dataKey={`nutricion${sufijo}`}
                position="top"
                fontSize={12}
                fontWeight={700}
                formatter={(v) => fmtVista(Number(v ?? 0), vista)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    function ParticipacionInner({
      porPrecio,
      porComunicacion,
      cruce,
      vista,
    }: {
      porPrecio: Grupo[];
      porComunicacion: Grupo[];
      cruce: CrucePunto[];
      vista: Vista;
    }) {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                1 · Por precio
              </p>
              <PanelSimple data={porPrecio} vista={vista} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                2 · Por comunicación
              </p>
              <PanelSimple data={porComunicacion} vista={vista} />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              3 · Precio × comunicación
            </p>
            <PanelCruce data={cruce} vista={vista} />
          </div>
        </div>
      );
    }

    return ParticipacionInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[640px] bg-slate-50 rounded-lg animate-pulse" />,
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
  const [vista, setVista] = useState<Vista>("pct");

  const calculo = useMemo(() => {
    const sumaFilas = data.filas.reduce((s, f) => s + f.panquecitasKg, 0);
    // Ventas totales del alcance: incluye PDV sin combinación. Si el servidor
    // no lo trae, la suma de las filas.
    const total = data.totalPanquecitasKg > 0 ? data.totalPanquecitasKg : sumaFilas;
    const pctDe = (v: number) => (total > 0 ? r1((v / total) * 100) : 0);

    function agrupar(clave: (f: CombinacionRow) => string, detalle: (f: CombinacionRow) => string) {
      const acc = new Map<string, { kg: number; clientes: number; detalles: Set<string> }>();
      for (const f of data.filas) {
        const k = clave(f);
        const a = acc.get(k) ?? { kg: 0, clientes: 0, detalles: new Set<string>() };
        a.kg += f.panquecitasKg;
        a.clientes += f.clientes;
        a.detalles.add(detalle(f));
        acc.set(k, a);
      }
      return [...acc.entries()].map(([categoria, a]) => ({
        categoria,
        detalle: [...a.detalles].join(" / "),
        kg: r1(a.kg),
        clientes: a.clientes,
        pct: pctDe(a.kg),
        porPdv: a.clientes > 0 ? r2(a.kg / a.clientes) : 0,
      }));
    }

    const porPrecio: Grupo[] = agrupar(precioDe, (f) => f.ciudad).map((g, i) => ({
      ...g,
      color: COLORES_PRECIO[i % COLORES_PRECIO.length],
    }));
    const porComunicacion: Grupo[] = agrupar(
      (f) => f.comunicacion,
      (f) => f.ciudad
    ).map((g) => ({ ...g, color: COLOR_COMUNICACION[g.categoria] ?? "#64748b" }));

    const crucePorPrecio = new Map<string, CrucePunto>();
    for (const f of data.filas) {
      const precio = precioDe(f);
      const p =
        crucePorPrecio.get(precio) ??
        ({
          precio,
          detalle: f.ciudad,
          practicidadPct: 0,
          practicidadPorPdv: 0,
          practicidadKg: 0,
          practicidadPdv: 0,
          nutricionPct: 0,
          nutricionPorPdv: 0,
          nutricionKg: 0,
          nutricionPdv: 0,
        } satisfies CrucePunto);
      if (f.comunicacion === "Nutrición") {
        p.nutricionKg += f.panquecitasKg;
        p.nutricionPdv += f.clientes;
      } else {
        p.practicidadKg += f.panquecitasKg;
        p.practicidadPdv += f.clientes;
      }
      crucePorPrecio.set(precio, p);
    }
    const cruce = [...crucePorPrecio.values()].map((p) => ({
      ...p,
      practicidadKg: r1(p.practicidadKg),
      nutricionKg: r1(p.nutricionKg),
      practicidadPct: pctDe(p.practicidadKg),
      nutricionPct: pctDe(p.nutricionKg),
      practicidadPorPdv: p.practicidadPdv > 0 ? r2(p.practicidadKg / p.practicidadPdv) : 0,
      nutricionPorPdv: p.nutricionPdv > 0 ? r2(p.nutricionKg / p.nutricionPdv) : 0,
    }));

    return {
      total,
      totalPdv: data.filas.reduce((s, f) => s + f.clientes, 0) + data.sinCombinacion,
      fueraDeCombinacionKg: r1(Math.max(0, total - sumaFilas)),
      porPrecio,
      porComunicacion,
      cruce,
      pctDe,
    };
  }, [data]);

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
            Cuánto de las <span className="font-medium">ventas totales de Panquecitas</span> de {alcance} (
            {kgTxt(calculo.total)}, {calculo.totalPdv} PDV) salió de cada precio, de cada eje de comunicación y de cada
            cruce entre los dos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {(
              [
                ["pct", "% de las ventas"],
                ["porPdv", "kg por PDV"],
              ] as const
            ).map(([key, label]) => (
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
          <ExportExcelButton filename={`${titulo}`} rows={data.filas} columns={columnas} />
        </div>
      </CardHeader>
      <CardContent>
        {calculo.total > 0 ? (
          <Graficos
            porPrecio={calculo.porPrecio}
            porComunicacion={calculo.porComunicacion}
            cruce={calculo.cruce}
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
          {vista === "pct" ? (
            <>
              <span className="font-medium text-slate-600">% de las ventas</span>: kg de Panquecitas del grupo ÷ las
              ventas totales de {alcance} desde el {data.desdePanquecitas}. Los porcentajes dependen también de cuántos
              PDV tiene cada grupo — para comparar rendimiento, cambiá a{" "}
              <span className="font-medium">kg por PDV</span>.
            </>
          ) : (
            <>
              <span className="font-medium text-slate-600">kg por PDV</span>: kg de Panquecitas del grupo ÷ sus PDV
              (hayan comprado o no). Quita el efecto del tamaño de cada grupo.
            </>
          )}{" "}
          Cada precio corrió en una sola ciudad (Cumaná o Cabudare), así que la comparación por precio también es una
          comparación entre ciudades.
          {calculo.fueraDeCombinacionKg > 0 && (
            <>
              {" "}
              {kgTxt(calculo.fueraDeCombinacionKg)} vienen de PDV cuyo grupo vendedor no está en ninguna combinación:
              cuentan en el total pero en ninguna barra, por eso los porcentajes no suman 100%.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
