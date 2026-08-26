"use client";

import dynamic from "next/dynamic";
import type { PortafolioPorCiudadRow } from "@/lib/mavesa-queries";

// Totales acumulados HASTA LA FECHA de Panquecitas, Margarina y Mayonesa por
// ciudad (sector), con un toggle para sumar Harina PAN a la comparación —
// para ver si el comportamiento de Panquecitas en una ciudad es parecido al
// de las demás categorías del portafolio o es un caso aparte.
//
// Eje X = categoría, color = ciudad (integrado en un solo grupo de barras
// por categoría, en vez de un grupo de barras por ciudad) — así se compara
// directamente Cumaná vs. Cabudare para cada categoría. El % (cuando
// comoPct está activo) sigue siendo "participación de esa categoría en el
// volumen total DE ESA CIUDAD" — cada color sigue sumando 100% a lo ancho
// del eje X, solo cambia cómo se agrupan visualmente las barras.

const COLOR_POR_SECTOR: Record<string, string> = {
  cumana: "#1a65bd",
  barquisimeto_este: "#f59e0b",
};

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } =
      await import("recharts");

    function PortafolioPorCiudadInner({
      data,
      comoPct,
      incluirHarinaPan,
    }: {
      data: PortafolioPorCiudadRow[];
      comoPct: boolean;
      incluirHarinaPan: boolean;
    }) {
      const categorias = ["Panquecitas", "Margarina", "Mayonesa", ...(incluirHarinaPan ? ["Harina PAN"] : [])];

      // Total por CIUDAD (sobre las categorías visibles), para que el % de
      // cada barra siga siendo "esta categoría ÷ el total de su ciudad".
      const totalPorCiudad = new Map(
        data.map((row) => [
          row.label,
          categorias.reduce((s, nombre) => s + (row.productos.find((p) => p.nombre === nombre)?.volumenKg ?? 0), 0),
        ])
      );

      const chartData = categorias.map((nombre) => {
        const punto: Record<string, string | number> = { categoria: nombre };
        for (const row of data) {
          const kg = row.productos.find((p) => p.nombre === nombre)?.volumenKg ?? 0;
          const total = totalPorCiudad.get(row.label) ?? 0;
          punto[row.label] = comoPct ? (total > 0 ? Math.round((kg / total) * 1000) / 10 : 0) : Math.round(kg * 10) / 10;
        }
        return punto;
      });

      const formatLabel = (v: number) =>
        comoPct
          ? `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`
          : `${v.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`;

      return (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="categoria" tick={{ fontSize: 13, fill: "#64748b" }} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [formatLabel(Number(value ?? 0)), String(name ?? "")]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {data.map((row) => (
              <Bar key={row.sector} dataKey={row.label} fill={COLOR_POR_SECTOR[row.sector] ?? "#94a3b8"} radius={[3, 3, 0, 0]}>
                <LabelList dataKey={row.label} position="top" fontSize={11} formatter={(v) => formatLabel(Number(v ?? 0))} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return PortafolioPorCiudadInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[320px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function PortafolioPorCiudadChart({
  data,
  comoPct = false,
  incluirHarinaPan = false,
}: {
  data: PortafolioPorCiudadRow[];
  comoPct?: boolean;
  incluirHarinaPan?: boolean;
}) {
  return <Inner data={data} comoPct={comoPct} incluirHarinaPan={incluirHarinaPan} />;
}
