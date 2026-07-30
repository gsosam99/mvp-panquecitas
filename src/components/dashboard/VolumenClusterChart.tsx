"use client";

import dynamic from "next/dynamic";
import type { VolumenClusterPoint } from "@/lib/dienn-queries";

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

    function VolumenClusterInner({ data }: { data: VolumenClusterPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="cluster" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit=" kg" width={60} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [
                `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`,
                String(name) === "pan_kg" ? "HMP (Harina PAN)" : "Panquecitas",
              ]}
            />
            <Legend
              formatter={(value: string) => (value === "pan_kg" ? "HMP (Harina PAN)" : "Panquecitas")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="pan_kg" fill="#f5c400" radius={[3, 3, 0, 0]} maxBarSize={40} />
            <Bar dataKey="panquecitas_kg" fill="#1a65bd" radius={[3, 3, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return VolumenClusterInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[280px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function VolumenClusterChart({ data }: { data: VolumenClusterPoint[] }) {
  return <Inner data={data} />;
}
