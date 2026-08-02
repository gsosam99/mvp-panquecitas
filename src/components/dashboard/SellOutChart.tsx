"use client";

import dynamic from "next/dynamic";
import type { SellOutPorRondaPoint } from "@/lib/sellout-utils";

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } =
      await import("recharts");

    function SellOutInner({ data }: { data: SellOutPorRondaPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="roundLabel" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit=" kg" width={70} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [
                `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`,
                name === "sellInKg" ? "Sell-In (SAP)" : name === "sellOutKg" ? "Sell-Out Calculado" : "Inventario Promedio",
              ]}
            />
            <Legend
              formatter={(value: string) =>
                value === "sellInKg" ? "Sell-In (SAP)" : value === "sellOutKg" ? "Sell-Out Calculado" : "Inventario Promedio"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="sellInKg" fill="#f5c400" radius={[3, 3, 0, 0]} maxBarSize={48} />
            <Bar dataKey="sellOutKg" fill="#1a65bd" radius={[3, 3, 0, 0]} maxBarSize={48} />
            <Line type="monotone" dataKey="inventarioPromedioKg" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return SellOutInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[300px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function SellOutChart({ data }: { data: SellOutPorRondaPoint[] }) {
  return <Inner data={data} />;
}
