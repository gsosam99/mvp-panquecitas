"use client";

import dynamic from "next/dynamic";
import type { WeeklyPoint } from "@/lib/kpi-queries";

const SellInChartInner = dynamic(
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

    function SellInChartInnerComponent({ data }: { data: WeeklyPoint[] }) {
      const formatted = data.map((d) => ({
        ...d,
        week: d.week.slice(5),
      }));

      return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={formatted} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit=" kg" />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [
                `${Number(value ?? 0).toFixed(1)} kg`,
                String(name) === "pan_kg" ? "Harina PAN" : "Panquecitas",
              ]}
            />
            <Legend
              formatter={(value: string) => (value === "pan_kg" ? "Harina PAN" : "Panquecitas")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="pan_kg"
              stroke="#0f172a"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="panquecitas_kg"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return SellInChartInnerComponent;
  },
  {
    ssr: false,
    loading: () => <div className="h-[280px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

interface SellInChartProps {
  data: WeeklyPoint[];
}

export function SellInChart({ data }: SellInChartProps) {
  return <SellInChartInner data={data} />;
}
