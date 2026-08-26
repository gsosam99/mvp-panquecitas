"use client";

import dynamic from "next/dynamic";
import type { PortafolioProducto } from "@/lib/mavesa-queries";

// Barras de Margarina, Mayonesa y Harina PAN de los últimos 3 meses
// (referencia), por ciudad — mismo patrón visual que PortafolioPorCiudadChart,
// pero acá `data` ya viene resuelto a la población elegida (Cliente/Universo)
// desde afuera, no hay toggle de Harina PAN porque siempre está presente.

const COLORES: Record<string, string> = {
  Margarina: "#3e7cb1",
  Mayonesa: "#7fb2da",
  "Harina PAN": "#94a3b8",
};

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } =
      await import("recharts");

    function Ventas3MesesInner({
      data,
      comoPct,
    }: {
      data: { label: string; productos: PortafolioProducto[] }[];
      comoPct: boolean;
    }) {
      const categorias = ["Margarina", "Mayonesa", "Harina PAN"];

      const chartData = data.map((row) => {
        const porNombre = new Map(row.productos.map((p) => [p.nombre, p.volumenKg]));
        const totalFila = categorias.reduce((s, nombre) => s + (porNombre.get(nombre) ?? 0), 0);
        const punto: Record<string, string | number> = { label: row.label };
        for (const nombre of categorias) {
          const kg = porNombre.get(nombre) ?? 0;
          punto[nombre] = comoPct ? (totalFila > 0 ? Math.round((kg / totalFila) * 1000) / 10 : 0) : Math.round(kg * 10) / 10;
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
            <XAxis dataKey="label" tick={{ fontSize: 13, fill: "#64748b" }} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [formatLabel(Number(value ?? 0)), String(name ?? "")]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {categorias.map((nombre) => (
              <Bar key={nombre} dataKey={nombre} fill={COLORES[nombre] ?? "#94a3b8"} radius={[3, 3, 0, 0]}>
                <LabelList dataKey={nombre} position="top" fontSize={11} formatter={(v) => formatLabel(Number(v ?? 0))} />
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
  data: { label: string; productos: PortafolioProducto[] }[];
  comoPct?: boolean;
}) {
  return <Inner data={data} comoPct={comoPct} />;
}
