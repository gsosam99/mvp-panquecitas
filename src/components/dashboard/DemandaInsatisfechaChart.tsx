"use client";

import dynamic from "next/dynamic";
import type { DemandaInsatisfechaPoint } from "@/lib/dienn-queries";

const SERIES_LABEL: Record<string, string> = {
  pedidoKg: "Pedido",
  facturadoKg: "Facturado",
  radarKg: "Radar",
};

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = await import(
      "recharts"
    );

    function DemandaInsatisfechaInner({ data }: { data: DemandaInsatisfechaPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis
              hide
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              unit=" kg"
              width={70}
              tickFormatter={(v) => Number(v).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [
                `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`,
                SERIES_LABEL[String(name)] ?? String(name),
              ]}
            />
            <Legend
              formatter={(value: string) => SERIES_LABEL[value] ?? value}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line type="monotone" dataKey="pedidoKg" stroke="#f5c400" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="facturadoKg" stroke="#1a65bd" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="radarKg" stroke="#16a34a" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return DemandaInsatisfechaInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[300px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function DemandaInsatisfechaChart({ data }: { data: DemandaInsatisfechaPoint[] }) {
  return <Inner data={data} />;
}
