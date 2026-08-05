"use client";

import dynamic from "next/dynamic";
import type { PedidoVsVentasBarPoint } from "@/lib/dienn-queries";

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = await import(
      "recharts"
    );

    function PedidoVsVentasInner({ data }: { data: PedidoVsVentasBarPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="presentacion" tick={{ fontSize: 12, fill: "#64748b" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              unit=" kg"
              width={70}
              tickFormatter={(v) => Number(v).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [
                `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`,
                name === "pedidaKg" ? "Cantidad pedida" : "Cantidad facturada",
              ]}
            />
            <Legend
              formatter={(value: string) =>
                value === "pedidaKg" ? "Cantidad pedida" : "Cantidad facturada"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="pedidaKg" fill="#f5c400" radius={[3, 3, 0, 0]} maxBarSize={56} />
            <Bar dataKey="facturadaKg" fill="#1a65bd" radius={[3, 3, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return PedidoVsVentasInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[300px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function PedidoVsVentasChart({ data }: { data: PedidoVsVentasBarPoint[] }) {
  return <Inner data={data} />;
}
