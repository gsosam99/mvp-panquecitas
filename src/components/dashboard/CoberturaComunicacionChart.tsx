"use client";

import dynamic from "next/dynamic";
import type { CoberturaComunicacionPoint } from "@/lib/dienn-queries";
import type { Sector } from "@/lib/sectors";

const SECTOR_COLORS: Record<Sector, { bar: string; dot: string }> = {
  cumana: { bar: "#1a65bd", dot: "#0f3d75" },
  barquisimeto_este: { bar: "#f5c400", dot: "#8a6d00" },
};
const SECTOR_LABELS_ES: Record<Sector, string> = {
  cumana: "Cumaná",
  barquisimeto_este: "Barquisimeto Este",
};

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend } =
      await import("recharts");

    function CoberturaComunicacionInner({
      data,
      sectors,
    }: {
      data: CoberturaComunicacionPoint[];
      sectors: Sector[];
    }) {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" width={44} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {sectors.map((s) => (
              <Bar
                key={`${s}_cobertura`}
                dataKey={`${s}_cobertura`}
                name={`Cobertura — ${SECTOR_LABELS_ES[s]}`}
                fill={SECTOR_COLORS[s].bar}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            ))}
            {sectors.map((s) => (
              <Scatter
                key={`${s}_comunicacion`}
                dataKey={`${s}_comunicacion`}
                name={`Comunicación (POP) — ${SECTOR_LABELS_ES[s]}`}
                fill={SECTOR_COLORS[s].dot}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return CoberturaComunicacionInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[280px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function CoberturaComunicacionChart({
  data,
  sectors,
}: {
  data: CoberturaComunicacionPoint[];
  sectors: Sector[];
}) {
  return <Inner data={data} sectors={sectors} />;
}
