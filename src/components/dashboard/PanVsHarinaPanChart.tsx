"use client";

import dynamic from "next/dynamic";
import type { PanVsHarinaPanPoint } from "@/lib/dienn-queries";

function formatKg(value: number): string {
  return `${value.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
}

function formatRatioPct(value: number): string {
  return `${value.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;
}

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } =
      await import("recharts");

    function PanVsHarinaPanInner({ data }: { data: PanVsHarinaPanPoint[] }) {
      // Ratio Panquecitas / HPM por punto, en % (Σ Radar Panquecitas ÷ Σ Radar Harina PAN × 100).
      const withRatio = data.map((d) => ({
        ...d,
        ratio: d.harinaPanKg > 0 ? Math.round((d.panquecitasKg / d.harinaPanKg) * 1000) / 10 : 0,
      }));
      return (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={withRatio} margin={{ top: 20, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis
              hide
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              width={70}
              tickFormatter={(v) => Number(v).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => {
                if (name === "ratio") return [formatRatioPct(Number(value ?? 0)), "Ratio Panq/HPM"];
                return [formatKg(Number(value ?? 0)), name === "panquecitasKg" ? "Panquecitas" : "Harina PAN"];
              }}
            />
            <Legend
              formatter={(value: string) =>
                value === "panquecitasKg" ? "Panquecitas" : value === "harinaPanKg" ? "Harina PAN" : "Ratio Panq/HPM"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line type="monotone" dataKey="harinaPanKg" stroke="#b45309" strokeWidth={2} dot={{ r: 3, fill: "#b45309" }} />
            <Line type="monotone" dataKey="panquecitasKg" stroke="#1a65bd" strokeWidth={2} dot={{ r: 3, fill: "#1a65bd" }}>
              {/* Ratio Panq/HPM etiquetado sobre cada punto. */}
              <LabelList
                dataKey="ratio"
                position="top"
                offset={10}
                fill="#0f172a"
                fontSize={10}
                formatter={(v) => formatRatioPct(Number(v ?? 0))}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return PanVsHarinaPanInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[300px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function PanVsHarinaPanChart({ data }: { data: PanVsHarinaPanPoint[] }) {
  return <Inner data={data} />;
}
