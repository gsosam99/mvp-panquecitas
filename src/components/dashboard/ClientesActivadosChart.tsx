"use client";

import dynamic from "next/dynamic";
import type { ActivacionPoint } from "@/lib/admin-metrics";

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } = await import("recharts");

    function ClientesActivadosInner({ data }: { data: ActivacionPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" width={44} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, _name, item) => [
                `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })}% (${
                  item?.payload?.count ?? 0
                } clientes)`,
                "% Cartera activada",
              ]}
            />
            <Line type="monotone" dataKey="pct" stroke="#1a65bd" strokeWidth={2} dot={{ r: 3, fill: "#1a65bd" }} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return ClientesActivadosInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[280px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function ClientesActivadosChart({ data }: { data: ActivacionPoint[] }) {
  return <Inner data={data} />;
}
