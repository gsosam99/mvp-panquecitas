"use client";

import dynamic from "next/dynamic";
import type { VentaRecompraActivacionPoint } from "@/lib/dienn-queries";

const SERIES_LABEL: Record<string, string> = {
  ventaAcumuladaKg: "Venta acumulada",
  recompraPct: "Tasa de recompra",
  recompraFocoPct: "Tasa de recompra foco",
  activacionPct: "% Activación de clientes",
};

const Inner = dynamic(
  async () => {
    const {
      ResponsiveContainer,
      ComposedChart,
      Bar,
      Line,
      XAxis,
      YAxis,
      CartesianGrid,
      Tooltip,
      Legend,
    } = await import("recharts");

    function VentaRecompraActivacionInner({
      data,
      showRecompraFoco,
    }: {
      data: VentaRecompraActivacionPoint[];
      showRecompraFoco: boolean;
    }) {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            {/* Eje izquierdo: kg (barras de venta acumulada) */}
            <YAxis
              hide
              yAxisId="left"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              unit=" kg"
              width={70}
              tickFormatter={(v) => Number(v).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
            />
            {/* Eje derecho: % (líneas de recompra y activación) */}
            <YAxis
              hide
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              unit="%"
              width={44}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => {
                const key = String(name);
                const num = Number(value ?? 0);
                const formatted =
                  key === "ventaAcumuladaKg"
                    ? `${num.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`
                    : `${num.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;
                return [formatted, SERIES_LABEL[key] ?? key];
              }}
            />
            <Legend formatter={(value: string) => SERIES_LABEL[value] ?? value} wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="ventaAcumuladaKg" fill="#1a65bd" radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="recompraPct"
              stroke="#16a34a"
              strokeWidth={2}
              dot={{ r: 3, fill: "#16a34a" }}
            />
            {/* Recompra foco: mismo verde pero más oscuro y punteado, para que se
                lea como variante de la recompra y no como una métrica aparte. */}
            {showRecompraFoco && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="recompraFocoPct"
                stroke="#14532d"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: "#14532d" }}
              />
            )}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="activacionPct"
              stroke="#f5c400"
              strokeWidth={2}
              dot={{ r: 3, fill: "#f5c400" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return VentaRecompraActivacionInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[320px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function VentaRecompraActivacionChart({
  data,
  showRecompraFoco = false,
}: {
  data: VentaRecompraActivacionPoint[];
  showRecompraFoco?: boolean;
}) {
  return <Inner data={data} showRecompraFoco={showRecompraFoco} />;
}
