"use client";

import dynamic from "next/dynamic";
import type { PromotoraPoint } from "@/lib/kpi-queries";

const Inner = dynamic(
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
    } = await import("recharts");

    function PromotoraActivityInner({ data }: { data: PromotoraPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [
                value,
                String(name) === "samples" ? "Muestras" : "Compras",
              ]}
            />
            <Legend
              formatter={(v: string) => (v === "samples" ? "Muestras" : "Compras")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="samples" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Bar dataKey="conversions" fill="#1a65bd" radius={[3, 3, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return PromotoraActivityInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[260px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function PromotoraActivityChart({ data }: { data: PromotoraPoint[] }) {
  return <Inner data={data} />;
}
