"use client";

import dynamic from "next/dynamic";
import type { EjecucionSemanalPoint } from "@/lib/admin-metrics";
import { CAMPAIGN_WEEKS } from "@/lib/campaign-weeks";

interface RoundTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
}

function RoundTick({ x = 0, y = 0, payload }: RoundTickProps) {
  const color = CAMPAIGN_WEEKS.find((w) => w.label === payload?.value)?.color ?? "#94a3b8";
  return (
    <g transform={`translate(${x},${y})`}>
      <circle cx={0} cy={8} r={3} fill={color} />
      <text x={0} y={23} textAnchor="middle" fontSize={11} fontWeight={600} fill="#475569">
        {payload?.value}
      </text>
    </g>
  );
}

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = await import(
      "recharts"
    );

    function EjecucionSemanalInner({ data }: { data: EjecucionSemanalPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <XAxis dataKey="label" tick={RoundTick as any} height={32} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" width={44} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [
                `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`,
                name === "popPct" ? "% Material POP" : "% Precio correcto",
              ]}
            />
            <Legend
              formatter={(value: string) => (value === "popPct" ? "% Material POP" : "% Precio correcto")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="popPct" fill="#1a65bd" radius={[3, 3, 0, 0]} maxBarSize={36} />
            <Bar dataKey="precioPct" fill="#f5c400" radius={[3, 3, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return EjecucionSemanalInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[280px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function EjecucionSemanalChart({ data }: { data: EjecucionSemanalPoint[] }) {
  return <Inner data={data} />;
}
