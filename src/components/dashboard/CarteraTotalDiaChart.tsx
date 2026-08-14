"use client";

import dynamic from "next/dynamic";

export interface CarteraTotalDiaChartPoint {
  label: string;
  radarKgDia: number;
  radarKgDiaDirecto: number; // parte del volumen del período del modelo Directo
  radarKgDiaIndirecto: number; // parte del volumen del período del modelo Indirecto
  programados: number;
  efectividad: number; // %
  efectividadDirecto: number; // % activación Radar modelo Directo
  efectividadIndirecto: number; // % activación Radar modelo Indirecto
}

function formatKg(value: number): string {
  return `${value.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
}

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } =
      await import("recharts");

    function CarteraTotalDiaInner({
      data,
      showDirecto,
      showIndirecto,
      efectividadColor,
      showVentasDirecto,
      showVentasIndirecto,
    }: {
      data: CarteraTotalDiaChartPoint[];
      showDirecto: boolean;
      showIndirecto: boolean;
      efectividadColor: string;
      showVentasDirecto: boolean;
      showVentasIndirecto: boolean;
    }) {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data} margin={{ top: 24, right: 12, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={16} />
            {/* Ejes ocultos: escalan las series pero no muestran números. */}
            <YAxis yAxisId="kg" hide />
            <YAxis yAxisId="pct" hide domain={[0, 100]} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => {
                if (name === "efectividad") return [`${Number(value ?? 0)}%`, "Efectividad"];
                if (name === "efectividadDirecto") return [`${Number(value ?? 0)}%`, "Activación Radar — Directo"];
                if (name === "efectividadIndirecto") return [`${Number(value ?? 0)}%`, "Activación Radar — Indirecto"];
                if (name === "radarKgDia") return [formatKg(Number(value ?? 0)), "Volumen Radar"];
                if (name === "radarKgDiaDirecto") return [formatKg(Number(value ?? 0)), "Volumen Radar — Directo"];
                if (name === "radarKgDiaIndirecto") return [formatKg(Number(value ?? 0)), "Volumen Radar — Indirecto"];
                return [String(value ?? ""), String(name ?? "")];
              }}
            />
            <Legend
              formatter={(value: string) =>
                value === "radarKgDia"
                  ? "Volumen Radar (por período)"
                  : value === "radarKgDiaDirecto"
                  ? "Volumen Radar — Directo"
                  : value === "radarKgDiaIndirecto"
                  ? "Volumen Radar — Indirecto"
                  : value === "efectividad"
                  ? "Efectividad"
                  : value === "efectividadDirecto"
                  ? "Activación Radar — Directo"
                  : "Activación Radar — Indirecto"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            {/* Barras: total del período por defecto; con los toggles de modelo se
                muestran las de Directo y/o Indirecto (apiladas si ambas). Condicionales
                hermanos (no un Fragment) para que Recharts detecte los Bar. */}
            {!showVentasDirecto && !showVentasIndirecto && (
              <Bar yAxisId="kg" dataKey="radarKgDia" fill="#bfdbfe" radius={[3, 3, 0, 0]}>
                {/* Kg del período, visibles sobre cada barra. */}
                <LabelList
                  dataKey="radarKgDia"
                  position="top"
                  offset={4}
                  fill="#1e40af"
                  fontSize={9}
                  formatter={(v) => `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`}
                />
              </Bar>
            )}
            {showVentasDirecto && (
              <Bar yAxisId="kg" dataKey="radarKgDiaDirecto" stackId="kg" fill="#86efac" radius={[2, 2, 0, 0]}>
                <LabelList
                  dataKey="radarKgDiaDirecto"
                  position="center"
                  fill="#166534"
                  fontSize={8}
                  formatter={(v) =>
                    Number(v ?? 0) > 0 ? Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 }) : ""
                  }
                />
              </Bar>
            )}
            {showVentasIndirecto && (
              <Bar yAxisId="kg" dataKey="radarKgDiaIndirecto" stackId="kg" fill="#c4b5fd" radius={[2, 2, 0, 0]}>
                <LabelList
                  dataKey="radarKgDiaIndirecto"
                  position="center"
                  fill="#5b21b6"
                  fontSize={8}
                  formatter={(v) =>
                    Number(v ?? 0) > 0 ? Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 }) : ""
                  }
                />
              </Bar>
            )}
            {/* Efectividad principal (color según la métrica elegida). */}
            <Line
              yAxisId="pct"
              dataKey="efectividad"
              stroke={efectividadColor}
              strokeWidth={2}
              dot={{ r: 3, fill: efectividadColor }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="efectividad"
                position="top"
                offset={6}
                fill={efectividadColor}
                fontSize={9}
                formatter={(v) => `${Number(v ?? 0)}%`}
              />
            </Line>
            {/* Activación Radar — Directo (serie opcional). */}
            {showDirecto && (
              <Line
                yAxisId="pct"
                dataKey="efectividadDirecto"
                stroke="#16a34a"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 3, fill: "#16a34a" }}
                isAnimationActive={false}
              >
                {/* Etiqueta debajo del punto para no solaparse con la efectividad. */}
                <LabelList
                  dataKey="efectividadDirecto"
                  position="bottom"
                  offset={8}
                  fill="#16a34a"
                  fontSize={9}
                  formatter={(v) => `${Number(v ?? 0)}%`}
                />
              </Line>
            )}
            {/* Activación Radar — Indirecto (serie opcional). */}
            {showIndirecto && (
              <Line
                yAxisId="pct"
                dataKey="efectividadIndirecto"
                stroke="#7c3aed"
                strokeWidth={2}
                strokeDasharray="2 3"
                dot={{ r: 3, fill: "#7c3aed" }}
                isAnimationActive={false}
              >
                {/* Etiqueta más arriba para separarla de las otras dos series. */}
                <LabelList
                  dataKey="efectividadIndirecto"
                  position="top"
                  offset={20}
                  fill="#7c3aed"
                  fontSize={9}
                  formatter={(v) => `${Number(v ?? 0)}%`}
                />
              </Line>
            )}
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

export function CarteraTotalDiaChart({
  data,
  showDirecto = false,
  showIndirecto = false,
  efectividadColor = "#dc2626",
  showVentasDirecto = false,
  showVentasIndirecto = false,
}: {
  data: CarteraTotalDiaChartPoint[];
  showDirecto?: boolean;
  showIndirecto?: boolean;
  efectividadColor?: string;
  showVentasDirecto?: boolean;
  showVentasIndirecto?: boolean;
}) {
  return (
    <Inner
      data={data}
      showDirecto={showDirecto}
      showIndirecto={showIndirecto}
      efectividadColor={efectividadColor}
      showVentasDirecto={showVentasDirecto}
      showVentasIndirecto={showVentasIndirecto}
    />
  );
}
