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
  // Capas por ciudad (solo el gráfico global las provee; null = hueco en la línea).
  efectCumanaAcum?: number | null;
  efectCumanaDia?: number | null;
  efectCabudareAcum?: number | null;
  efectCabudareDia?: number | null;
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
      showCiudadAcum,
      showCiudadDia,
      showCumana,
      showCabudare,
    }: {
      data: CarteraTotalDiaChartPoint[];
      showDirecto: boolean;
      showIndirecto: boolean;
      efectividadColor: string;
      showVentasDirecto: boolean;
      showVentasIndirecto: boolean;
      showCiudadAcum: boolean;
      showCiudadDia: boolean;
      showCumana: boolean;
      showCabudare: boolean;
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
                if (name === "efectCumanaAcum") return [`${Number(value ?? 0)}%`, "Cumaná (acum)"];
                if (name === "efectCumanaDia") return [`${Number(value ?? 0)}%`, "Cumaná (día)"];
                if (name === "efectCabudareAcum") return [`${Number(value ?? 0)}%`, "Cabudare (acum)"];
                if (name === "efectCabudareDia") return [`${Number(value ?? 0)}%`, "Cabudare (día)"];
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
                  : value === "efectividadIndirecto"
                  ? "Activación Radar — Indirecto"
                  : value === "efectCumanaAcum"
                  ? "Cumaná (acum)"
                  : value === "efectCumanaDia"
                  ? "Cumaná (día)"
                  : value === "efectCabudareAcum"
                  ? "Cabudare (acum)"
                  : value === "efectCabudareDia"
                  ? "Cabudare (día)"
                  : value
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
                    Number(v ?? 0) > 0
                      ? `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`
                      : ""
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
                    Number(v ?? 0) > 0
                      ? `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`
                      : ""
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
            {/* Efectividad por ciudad ACUMULADA (línea sólida) — con % visible. */}
            {showCiudadAcum && showCumana && (
              <Line
                yAxisId="pct"
                dataKey="efectCumanaAcum"
                stroke="#0891b2"
                strokeWidth={2}
                dot={{ r: 2, fill: "#0891b2" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCumanaAcum"
                  position="top"
                  offset={6}
                  fill="#0891b2"
                  fontSize={9}
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {showCiudadAcum && showCabudare && (
              <Line
                yAxisId="pct"
                dataKey="efectCabudareAcum"
                stroke="#db2777"
                strokeWidth={2}
                dot={{ r: 2, fill: "#db2777" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCabudareAcum"
                  position="bottom"
                  offset={6}
                  fill="#db2777"
                  fontSize={9}
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {/* Efectividad por ciudad DIARIA (línea punteada) — con % visible. */}
            {showCiudadDia && showCumana && (
              <Line
                yAxisId="pct"
                dataKey="efectCumanaDia"
                stroke="#0891b2"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2, fill: "#0891b2" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCumanaDia"
                  position="top"
                  offset={16}
                  fill="#0e7490"
                  fontSize={9}
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {showCiudadDia && showCabudare && (
              <Line
                yAxisId="pct"
                dataKey="efectCabudareDia"
                stroke="#db2777"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2, fill: "#db2777" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCabudareDia"
                  position="bottom"
                  offset={16}
                  fill="#9d174d"
                  fontSize={9}
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
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
  showCiudadAcum = false,
  showCiudadDia = false,
  showCumana = true,
  showCabudare = true,
}: {
  data: CarteraTotalDiaChartPoint[];
  showDirecto?: boolean;
  showIndirecto?: boolean;
  efectividadColor?: string;
  showVentasDirecto?: boolean;
  showVentasIndirecto?: boolean;
  showCiudadAcum?: boolean;
  showCiudadDia?: boolean;
  showCumana?: boolean;
  showCabudare?: boolean;
}) {
  return (
    <Inner
      data={data}
      showDirecto={showDirecto}
      showIndirecto={showIndirecto}
      efectividadColor={efectividadColor}
      showVentasDirecto={showVentasDirecto}
      showVentasIndirecto={showVentasIndirecto}
      showCiudadAcum={showCiudadAcum}
      showCiudadDia={showCiudadDia}
      showCumana={showCumana}
      showCabudare={showCabudare}
    />
  );
}
