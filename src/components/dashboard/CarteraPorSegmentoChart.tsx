"use client";

import dynamic from "next/dynamic";

export interface CarteraSegmentoChartPoint {
  segmento: string;
  radarKg: number;
  programados: number; // clientes que tocaba visitar (denominador de la efectividad)
  efectividad: number; // %
}

function formatKg(value: number): string {
  return `${value.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
}

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } =
      await import("recharts");

    function CarteraPorSegmentoInner({ data }: { data: CarteraSegmentoChartPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={data} margin={{ top: 28, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="segmento" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis
              yAxisId="kg"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              width={70}
              tickFormatter={(v) => Number(v).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
              label={{ value: "Volumen Radar (kg)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#1a65bd" } }}
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
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => {
                if (name === "efectividad") return [`${Number(value ?? 0)}%`, "Efectividad"];
                if (name === "radarKg") return [formatKg(Number(value ?? 0)), "Volumen Radar"];
                return [String(value ?? ""), String(name ?? "")];
              }}
            />
            <Bar yAxisId="kg" dataKey="radarKg" fill="#1a65bd" radius={[4, 4, 0, 0]} maxBarSize={90}>
              {/* Clientes que tocaba visitar en el segmento (denominador). */}
              <LabelList
                dataKey="programados"
                position="top"
                offset={18}
                fill="#334155"
                fontSize={11}
                formatter={(v) => `A visitar: ${Number(v ?? 0)}`}
              />
              {/* Kg de la barra, visibles dentro de ella. */}
              <LabelList
                dataKey="radarKg"
                position="insideTop"
                offset={10}
                fill="#ffffff"
                fontSize={10}
                formatter={(v) => `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`}
              />
            </Bar>
            <Line
              yAxisId="pct"
              dataKey="efectividad"
              stroke="transparent"
              dot={{ r: 5, fill: "#dc2626" }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="efectividad"
                position="top"
                offset={8}
                fill="#dc2626"
                fontSize={11}
                formatter={(v) => `${Number(v ?? 0)}%`}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return CarteraPorSegmentoInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[360px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function CarteraPorSegmentoChart({ data }: { data: CarteraSegmentoChartPoint[] }) {
  return <Inner data={data} />;
}
