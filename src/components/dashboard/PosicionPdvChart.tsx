"use client";

import dynamic from "next/dynamic";
import type { PosicionPdvPoint } from "@/lib/dienn-queries";

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } = await import("recharts");

    function PosicionPdvInner({ data }: { data: PosicionPdvPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="categoria" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis hide allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={44} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value) => [`${Number(value ?? 0)} clientes`, "Posición en PDV"]}
            />
            <Bar dataKey="clientes" fill="#1a65bd" radius={[4, 4, 0, 0]} maxBarSize={80} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return PosicionPdvInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[300px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function PosicionPdvChart({ data }: { data: PosicionPdvPoint[] }) {
  return <Inner data={data} />;
}
