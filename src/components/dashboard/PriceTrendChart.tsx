"use client";

import dynamic from "next/dynamic";
import type { PricePoint } from "@/lib/kpi-queries";

const Inner = dynamic(
  async () => {
    const {
      ResponsiveContainer,
      LineChart,
      Line,
      XAxis,
      YAxis,
      CartesianGrid,
      Tooltip,
      Legend,
    } = await import("recharts");

    function PriceTrendInner({ data }: { data: PricePoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [
                `$${Number(value ?? 0).toFixed(2)} USD`,
                String(name) === "price_04" ? "Panquecitas 400g" : "Panquecitas 800g",
              ]}
            />
            <Legend
              formatter={(v: string) =>
                v === "price_04" ? "Panquecitas 400g" : "Panquecitas 800g"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="price_04"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="price_08"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return PriceTrendInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[260px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function PriceTrendChart({ data }: { data: PricePoint[] }) {
  return <Inner data={data} />;
}
