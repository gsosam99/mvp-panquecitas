"use client";

import dynamic from "next/dynamic";

export interface SellOutPorPosicionPoint {
  categoria: string;
  sellOutKg: number;
  clientes: number;
}

function formatKg(value: number): string {
  return `${value.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
}

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } = await import("recharts");

    function SellOutPorPosicionInner({ data }: { data: SellOutPorPosicionPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="categoria" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              width={64}
              tickFormatter={(v) => Number(v).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value) => [formatKg(Number(value ?? 0)), "Sell-Out"]}
            />
            <Bar dataKey="sellOutKg" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={80} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return SellOutPorPosicionInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[300px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function SellOutPorPosicionChart({ data }: { data: SellOutPorPosicionPoint[] }) {
  return <Inner data={data} />;
}
