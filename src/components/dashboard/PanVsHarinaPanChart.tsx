"use client";

import dynamic from "next/dynamic";
import type { PanVsHarinaPanPoint } from "@/lib/dienn-queries";

/** Punto del gráfico + el ratio ACUMULADO de cada ciudad (opcional). */
export interface PanVsHarinaPanChartPoint extends PanVsHarinaPanPoint {
  /** Σ Panquecitas ÷ Σ Harina PAN de Cumaná hasta este punto (%). null = sin datos aún. */
  ratioCumanaAcum?: number | null;
  ratioCabudareAcum?: number | null;
}

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

    function PanVsHarinaPanInner({
      data,
      showRatioCiudades,
    }: {
      data: PanVsHarinaPanChartPoint[];
      showRatioCiudades: boolean;
    }) {
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
              yAxisId="kg"
              hide
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              width={70}
              tickFormatter={(v) => Number(v).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
            />
            {/* Eje propio para los ratios: en la escala de kg quedarían pegados a cero. */}
            <YAxis yAxisId="pct" hide />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => {
                if (name === "ratio") return [formatRatioPct(Number(value ?? 0)), "Ratio Panq/HPM"];
                if (name === "ratioCumanaAcum")
                  return [formatRatioPct(Number(value ?? 0)), "Ratio acumulado — Cumaná"];
                if (name === "ratioCabudareAcum")
                  return [formatRatioPct(Number(value ?? 0)), "Ratio acumulado — Cabudare"];
                return [formatKg(Number(value ?? 0)), name === "panquecitasKg" ? "Panquecitas" : "Harina PAN"];
              }}
            />
            <Legend
              formatter={(value: string) =>
                value === "panquecitasKg"
                  ? "Panquecitas"
                  : value === "harinaPanKg"
                  ? "Harina PAN"
                  : value === "ratioCumanaAcum"
                  ? "Ratio acum. — Cumaná"
                  : value === "ratioCabudareAcum"
                  ? "Ratio acum. — Cabudare"
                  : "Ratio Panq/HPM"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              yAxisId="kg"
              type="monotone"
              dataKey="harinaPanKg"
              stroke="#b45309"
              strokeWidth={2}
              dot={{ r: 3, fill: "#b45309" }}
            />
            <Line
              yAxisId="kg"
              type="monotone"
              dataKey="panquecitasKg"
              stroke="#1a65bd"
              strokeWidth={2}
              dot={{ r: 3, fill: "#1a65bd" }}
            >
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
            {/* Ratio ACUMULADO por ciudad (opcional): mismos tonos de azul que el
                resto del dashboard. connectNulls para que la línea no se corte en
                los períodos sin movimiento de esa ciudad. */}
            {showRatioCiudades && (
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="ratioCumanaAcum"
                stroke="#3e7cb1"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 2, fill: "#3e7cb1" }}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {showRatioCiudades && (
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="ratioCabudareAcum"
                stroke="#1f4e79"
                strokeWidth={2}
                strokeDasharray="2 3"
                dot={{ r: 2, fill: "#1f4e79" }}
                connectNulls
                isAnimationActive={false}
              />
            )}
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

export function PanVsHarinaPanChart({
  data,
  showRatioCiudades = false,
}: {
  data: PanVsHarinaPanChartPoint[];
  showRatioCiudades?: boolean;
}) {
  return <Inner data={data} showRatioCiudades={showRatioCiudades} />;
}
