"use client";

import dynamic from "next/dynamic";
import type { PenetracionRecompraPoint } from "@/lib/dienn-queries";

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = await import(
      "recharts"
    );

    function PenetracionRecompraInner({ data }: { data: PenetracionRecompraPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" width={44} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [
                `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`,
                name === "penetracionPct" ? "% Penetración" : "% Tasa de Recompra",
              ]}
            />
            <Legend
              formatter={(value: string) => (value === "penetracionPct" ? "% Penetración" : "% Tasa de Recompra")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line type="monotone" dataKey="penetracionPct" stroke="#1a65bd" strokeWidth={2} dot={false} />
            <Line
              type="monotone"
              dataKey="recompraPct"
              stroke="#16a34a"
              strokeWidth={0}
              dot={{ r: 3, fill: "#16a34a" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return PenetracionRecompraInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[280px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function PenetracionRecompraChart({ data }: { data: PenetracionRecompraPoint[] }) {
  return <Inner data={data} />;
}
