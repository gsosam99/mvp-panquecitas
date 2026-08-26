"use client";

import dynamic from "next/dynamic";
import type { PortafolioProducto } from "@/lib/mavesa-queries";
import type { Sector } from "@/lib/sectors";

// Barras de Margarina, Mayonesa y Harina PAN de los últimos 3 meses
// (referencia), por ciudad — mismo patrón visual que PortafolioPorCiudadChart
// (eje X = categoría, color = ciudad), pero acá `data` ya viene resuelto a la
// población elegida (Cliente/Universo) desde afuera, y no hay toggle de
// Harina PAN porque siempre está presente.

const COLOR_POR_SECTOR: Record<string, string> = {
  cumana: "#1a65bd",
  barquisimeto_este: "#f59e0b",
};

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } =
      await import("recharts");

    function Ventas3MesesInner({
      data,
      comoPct,
    }: {
      data: { sector: Sector; label: string; productos: PortafolioProducto[] }[];
      comoPct: boolean;
    }) {
      const categorias = ["Margarina", "Mayonesa", "Harina PAN"];

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

    return Ventas3MesesInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[320px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function Ventas3MesesPorCiudadChart({
  data,
  comoPct = false,
}: {
  data: { sector: Sector; label: string; productos: PortafolioProducto[] }[];
  comoPct?: boolean;
}) {
  return <Inner data={data} comoPct={comoPct} />;
}
