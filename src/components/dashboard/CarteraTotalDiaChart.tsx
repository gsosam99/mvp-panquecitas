"use client";

import dynamic from "next/dynamic";

export interface CarteraTotalDiaChartPoint {
  label: string;
  radarKgAcum: number;
  programados: number;
  efectividad: number; // %
}

function formatKg(value: number): string {
  return `${value.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
}

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } =
      await import("recharts");

    function CarteraTotalDiaInner({ data }: { data: CarteraTotalDiaChartPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={16} />
            <YAxis
              yAxisId="kg"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              width={70}
              tickFormatter={(v) => Number(v).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
              label={{ value: "Radar acumulado (kg)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#1a65bd" } }}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              domain={[0, 100]}
              width={48}
              tick={{ fontSize: 11, fill: "#dc2626" }}
              tickFormatter={(v) => `${v}%`}
              label={{ value: "Efectividad (%)", angle: 90, position: "insideRight", style: { fontSize: 11, fill: "#dc2626" } }}
            />
            {/* Eje oculto para escalar la "cartera del día" (conteo), distinta escala que kg y %. */}
            <YAxis yAxisId="count" hide domain={[0, "auto"]} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => {
                if (name === "efectividad") return [`${Number(value ?? 0)}%`, "Efectividad"];
                if (name === "radarKgAcum") return [formatKg(Number(value ?? 0)), "Radar acumulado"];
                if (name === "programados") return [String(Number(value ?? 0)), "Cartera del día (a visitar)"];
                return [String(value ?? ""), String(name ?? "")];
              }}
            />
            <Legend
              formatter={(value: string) =>
                value === "radarKgAcum" ? "Radar acumulado" : value === "efectividad" ? "Efectividad" : "Cartera del día"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar yAxisId="kg" dataKey="radarKgAcum" fill="#bfdbfe" radius={[3, 3, 0, 0]}>
              {/* Kg acumulados, visibles sobre cada barra. */}
              <LabelList
                dataKey="radarKgAcum"
                position="top"
                offset={4}
                fill="#1e40af"
                fontSize={9}
                formatter={(v) => `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`}
              />
            </Bar>
            <Line
              yAxisId="count"
              dataKey="programados"
              stroke="transparent"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            >
              {/* Cartera del día a visitar: número visible sobre cada barra, sin hover. */}
              <LabelList dataKey="programados" position="top" offset={8} fill="#334155" fontSize={10} />
            </Line>
            <Line
              yAxisId="pct"
              dataKey="efectividad"
              stroke="#dc2626"
              strokeWidth={2}
              dot={{ r: 3, fill: "#dc2626" }}
              isAnimationActive={false}
            >
              {/* Efectividad del día, visible sobre cada punto. */}
              <LabelList
                dataKey="efectividad"
                position="top"
                offset={6}
                fill="#dc2626"
                fontSize={9}
                formatter={(v) => `${Number(v ?? 0)}%`}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return CarteraTotalDiaInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[340px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function CarteraTotalDiaChart({ data }: { data: CarteraTotalDiaChartPoint[] }) {
  return <Inner data={data} />;
}
