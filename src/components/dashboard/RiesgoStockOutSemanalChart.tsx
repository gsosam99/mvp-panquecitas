"use client";

import dynamic from "next/dynamic";
import type { RiesgoStockOutPoint } from "@/lib/admin-metrics";

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } = await import("recharts");

    function RiesgoStockOutSemanalInner({ data }: { data: RiesgoStockOutPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} width={44} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value) => [`${value} clientes`, "En riesgo de stock-out"]}
            />
            <Line type="monotone" dataKey="count" stroke="#dc2626" strokeWidth={2} dot={{ r: 3, fill: "#dc2626" }} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return RiesgoStockOutSemanalInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[280px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function RiesgoStockOutSemanalChart({ data }: { data: RiesgoStockOutPoint[] }) {
  return <Inner data={data} />;
}
