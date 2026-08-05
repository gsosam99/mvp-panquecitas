"use client";

import dynamic from "next/dynamic";
import type { RiesgoStockOutPoint } from "@/lib/admin-metrics";
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

interface RoundDotProps {
  cx?: number;
  cy?: number;
  payload?: RiesgoStockOutPoint;
}

function RoundDot({ cx, cy, payload }: RoundDotProps) {
  if (cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={5} fill={payload?.color ?? "#dc2626"} stroke="#fff" strokeWidth={1.5} />;
}

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } = await import("recharts");

    function RiesgoStockOutSemanalInner({ data }: { data: RiesgoStockOutPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <XAxis dataKey="label" tick={RoundTick as any} height={32} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} width={44} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value) => [`${value} clientes`, "En riesgo de stock-out"]}
            />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Line type="monotone" dataKey="count" stroke="#cbd5e1" strokeWidth={2} dot={RoundDot as any} />
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
