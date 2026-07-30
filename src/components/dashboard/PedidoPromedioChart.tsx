"use client";

import dynamic from "next/dynamic";
import type { PedidoPromedioSegmento } from "@/lib/dienn-queries";

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
    } = await import("recharts");

    function PedidoPromedioInner({ data }: { data: PedidoPromedioSegmento[] }) {
      return (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="segment" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit=" kg" width={60} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, _name, item) => [
                `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`,
                `Ticket promedio (${item.payload.orders} pedidos)`,
              ]}
            />
            <Bar dataKey="avgKg" fill="#1a65bd" radius={[3, 3, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return PedidoPromedioInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[260px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function PedidoPromedioChart({ data }: { data: PedidoPromedioSegmento[] }) {
  return <Inner data={data} />;
}
