"use client";

import dynamic from "next/dynamic";

export interface SellOutResumenPoint {
  concepto: string;
  kg: number;
}

const COLORS = ["#f5c400", "#94a3b8", "#1a65bd"];

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } = await import("recharts");

    function SellOutResumenInner({ data }: { data: SellOutResumenPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="concepto" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis
              hide
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              unit=" kg"
              width={70}
              tickFormatter={(v) => Number(v).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value) => [`${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`, "Total"]}
            />
            <Bar dataKey="kg" radius={[4, 4, 0, 0]} maxBarSize={80}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return SellOutResumenInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[300px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function SellOutResumenChart({ data }: { data: SellOutResumenPoint[] }) {
  return <Inner data={data} />;
}
