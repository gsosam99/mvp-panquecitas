"use client";

import dynamic from "next/dynamic";
import type { RankingSegmentoRow } from "@/lib/dienn-queries";

// Ranking de volumen por segmento de cartera (punto 2 del documento de cambios).
// Barras horizontales ordenadas de mayor a menor volumen; la etiqueta de cada
// barra acompaña el volumen con el promedio diario por cliente del segmento.

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } =
      await import("recharts");

    function RankingSegmentoInner({ data }: { data: RankingSegmentoRow[] }) {
      // Alto proporcional a la cantidad de segmentos, con un mínimo utilizable.
      const height = Math.max(240, data.length * 42 + 40);

      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 96, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="segmento"
              width={150}
              tick={{ fontSize: 11, fill: "#475569" }}
              interval={0}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => {
                if (name === "volumenKg")
                  return [
                    `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`,
                    "Volumen Radar",
                  ];
                return [String(value ?? ""), String(name ?? "")];
              }}
              labelFormatter={(label) => String(label)}
            />
            <Bar dataKey="volumenKg" fill="#3e7cb1" radius={[0, 3, 3, 0]}>
              <LabelList
                dataKey="volumenKg"
                position="right"
                offset={8}
                fill="#1f4e79"
                fontSize={10}
                formatter={(v) => `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return RankingSegmentoInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[240px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function RankingSegmentoChart({ data }: { data: RankingSegmentoRow[] }) {
  return <Inner data={data} />;
}
