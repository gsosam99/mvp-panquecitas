"use client";

import dynamic from "next/dynamic";

export interface CarteraTotalDiaChartPoint {
  label: string;
  radarKgDia: number;
  radarKgDiaDirecto: number; // parte del volumen del período del modelo Directo
  radarKgDiaIndirecto: number; // parte del volumen del período del modelo Indirecto
  // Parte del volumen del período de cada ciudad (solo el gráfico global las provee).
  radarKgDiaCumana?: number;
  radarKgDiaCabudare?: number;
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
      showEfectividad,
      showDirecto,
      showIndirecto,
      efectividadColor,
      showVentasDirecto,
      showVentasIndirecto,
      showVentasCumana,
      showVentasCabudare,
      showCiudadAcum,
      showCiudadDia,
      showCumana,
      showCabudare,
    }: {
      data: CarteraTotalDiaChartPoint[];
      showEfectividad: boolean;
      showDirecto: boolean;
      showIndirecto: boolean;
      efectividadColor: string;
      showVentasDirecto: boolean;
      showVentasIndirecto: boolean;
      showVentasCumana: boolean;
      showVentasCabudare: boolean;
      showCiudadAcum: boolean;
      showCiudadDia: boolean;
      showCumana: boolean;
      showCabudare: boolean;
    }) {
      // Con cualquier desglose de barras prendido (modelo o ciudad) se oculta la
      // barra del total, para no sumar dos veces el mismo volumen.
      const hayDesglose = showVentasDirecto || showVentasIndirecto || showVentasCumana || showVentasCabudare;

      // ── Bandas separadas para que ningún texto tape a otro ─────────────
      // El problema no era de legibilidad sino de ESPACIO: barras y líneas viven
      // en ejes distintos y se repartían la misma altura, así que los kg y los %
      // terminaban escritos uno encima del otro.
      //
      // La solución es darle a cada uno su franja: se estiran los dominios de
      // los dos ejes para que las barras ocupen solo la mitad de abajo y las
      // líneas de % solo el tercio de arriba. Ningún valor se mueve de su sitio
      // relativo — lo único que cambia es cuánto del alto usa cada serie.
      const alturaBarra = (d: CarteraTotalDiaChartPoint) => {
        if (!hayDesglose) return d.radarKgDia;
        const modelo =
          (showVentasDirecto ? d.radarKgDiaDirecto : 0) + (showVentasIndirecto ? d.radarKgDiaIndirecto : 0);
        const ciudad =
          (showVentasCumana ? d.radarKgDiaCumana ?? 0 : 0) + (showVentasCabudare ? d.radarKgDiaCabudare ?? 0 : 0);
        return Math.max(modelo, ciudad);
      };
      const maxKg = data.reduce((m, d) => Math.max(m, alturaBarra(d)), 0);
      // Tope del eje al doble del pico: las barras nunca pasan de la mitad.
      const kgDomain: [number, number] = [0, Math.max(maxKg * 1.95, 1)];

      // Rango real de los porcentajes visibles. El piso del eje se hunde muy por
      // debajo del mínimo para empujar las líneas hacia arriba.
      const pctVisibles: number[] = [];
      for (const d of data) {
        if (showEfectividad) pctVisibles.push(d.efectividad);
        if (showDirecto) pctVisibles.push(d.efectividadDirecto);
        if (showIndirecto) pctVisibles.push(d.efectividadIndirecto);
        if (showCiudadAcum && showCumana && d.efectCumanaAcum != null) pctVisibles.push(d.efectCumanaAcum);
        if (showCiudadAcum && showCabudare && d.efectCabudareAcum != null) pctVisibles.push(d.efectCabudareAcum);
        if (showCiudadDia && showCumana && d.efectCumanaDia != null) pctVisibles.push(d.efectCumanaDia);
        if (showCiudadDia && showCabudare && d.efectCabudareDia != null) pctVisibles.push(d.efectCabudareDia);
      }
      const pctHi = pctVisibles.length > 0 ? Math.max(...pctVisibles) : 100;
      const pctLo = pctVisibles.length > 0 ? Math.min(...pctVisibles) : 0;
      const pctRango = Math.max(pctHi - pctLo, 1);
      const pctDomain: [number, number] = [pctLo - pctRango * 2.2, pctHi + pctRango * 0.35];
      return (
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={data} margin={{ top: 32, right: 12, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={16} />
            {/* Ejes ocultos: escalan las series pero no muestran números. */}
            <YAxis yAxisId="kg" hide domain={kgDomain} allowDataOverflow />
            <YAxis yAxisId="pct" hide domain={pctDomain} allowDataOverflow />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => {
                if (name === "efectividad") return [`${Number(value ?? 0)}%`, "Efectividad"];
                if (name === "efectividadDirecto") return [`${Number(value ?? 0)}%`, "Activación Radar — Directo"];
                if (name === "efectividadIndirecto") return [`${Number(value ?? 0)}%`, "Activación Radar — Indirecto"];
                if (name === "radarKgDia") return [formatKg(Number(value ?? 0)), "Volumen Radar"];
                if (name === "radarKgDiaDirecto") return [formatKg(Number(value ?? 0)), "Volumen Radar — Directo"];
                if (name === "radarKgDiaIndirecto") return [formatKg(Number(value ?? 0)), "Volumen Radar — Indirecto"];
                if (name === "radarKgDiaCumana") return [formatKg(Number(value ?? 0)), "Volumen Radar — Cumaná"];
                if (name === "radarKgDiaCabudare") return [formatKg(Number(value ?? 0)), "Volumen Radar — Cabudare"];
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
                  : value === "radarKgDiaCumana"
                  ? "Volumen Radar — Cumaná"
                  : value === "radarKgDiaCabudare"
                  ? "Volumen Radar — Cabudare"
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
            {/* Barras: total del período por defecto; con los toggles se muestran los
                desgloses por modelo (Directo/Indirecto) y/o por ciudad (Cumaná/Cabudare),
                apilados dentro de su propio stack. Condicionales hermanos (no un
                Fragment) para que Recharts detecte los Bar. */}
            {!hayDesglose && (
              <Bar yAxisId="kg" dataKey="radarKgDia" fill="#bfdbfe" radius={[3, 3, 0, 0]}>
                {/* Los kg van DENTRO de la barra, no encima: las barras están en el
                    eje de kg y las líneas de % en otro, así que sus posiciones son
                    independientes y arriba de la barra los dos textos se pisaban
                    cuando el ratio caía cerca. Dejando el espacio de arriba solo
                    para los %, ya no compiten por el mismo lugar. */}
                <LabelList
                  dataKey="radarKgDia"
                  position="insideTop"
                  offset={6}
                  fill="#1e3a8a"
                  fontSize={10}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`}
                />
              </Bar>
            )}
            {showVentasDirecto && (
              <Bar yAxisId="kg" dataKey="radarKgDiaDirecto" stackId="modelo" fill="#9db99f" radius={[2, 2, 0, 0]}>
                <LabelList
                  dataKey="radarKgDiaDirecto"
                  position="center"
                  fill="#2c4634"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) =>
                    Number(v ?? 0) > 0
                      ? `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`
                      : ""
                  }
                />
              </Bar>
            )}
            {showVentasIndirecto && (
              <Bar yAxisId="kg" dataKey="radarKgDiaIndirecto" stackId="modelo" fill="#cbb894" radius={[2, 2, 0, 0]}>
                <LabelList
                  dataKey="radarKgDiaIndirecto"
                  position="center"
                  fill="#4d3c1f"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) =>
                    Number(v ?? 0) > 0
                      ? `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`
                      : ""
                  }
                />
              </Bar>
            )}
            {/* Barras de volumen Radar del período por CIUDAD. Stack propio ("ciudad")
                para que, si además se prendió un desglose por modelo, queden columnas
                lado a lado en vez de sumarse en la misma pila. La etiqueta lleva solo
                los kg (sin el nombre de la ciudad) — se identifican por color. */}
            {showVentasCumana && (
              <Bar yAxisId="kg" dataKey="radarKgDiaCumana" stackId="ciudad" fill="#b4d0e7" radius={[2, 2, 0, 0]}>
                <LabelList
                  dataKey="radarKgDiaCumana"
                  position="center"
                  fill="#1f4e79"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) =>
                    Number(v ?? 0) > 0
                      ? `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`
                      : ""
                  }
                />
              </Bar>
            )}
            {showVentasCabudare && (
              <Bar yAxisId="kg" dataKey="radarKgDiaCabudare" stackId="ciudad" fill="#5a89b8" radius={[2, 2, 0, 0]}>
                <LabelList
                  dataKey="radarKgDiaCabudare"
                  position="center"
                  fill="#ffffff"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) =>
                    Number(v ?? 0) > 0
                      ? `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`
                      : ""
                  }
                />
              </Bar>
            )}
            {/* Efectividad principal (color según la métrica elegida) — se puede apagar. */}
            {showEfectividad && (
              <Line
                yAxisId="pct"
                dataKey="efectividad"
                stroke={efectividadColor}
                strokeWidth={2}
                dot={{ r: 2, fill: efectividadColor }}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectividad"
                  position="top"
                  offset={10}
                  fill={efectividadColor}
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => `${Number(v ?? 0)}%`}
                />
              </Line>
            )}
            {/* Activación Radar — Directo (serie opcional). */}
            {showDirecto && (
              <Line
                yAxisId="pct"
                dataKey="efectividadDirecto"
                stroke="#4f7a5c"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 2, fill: "#4f7a5c" }}
                isAnimationActive={false}
              >
                {/* Etiqueta debajo del punto para no solaparse con la efectividad. */}
                <LabelList
                  dataKey="efectividadDirecto"
                  position="bottom"
                  offset={14}
                  fill="#4f7a5c"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => `${Number(v ?? 0)}%`}
                />
              </Line>
            )}
            {/* Activación Radar — Indirecto (serie opcional). */}
            {showIndirecto && (
              <Line
                yAxisId="pct"
                dataKey="efectividadIndirecto"
                stroke="#8a6d3b"
                strokeWidth={2}
                strokeDasharray="2 3"
                dot={{ r: 2, fill: "#8a6d3b" }}
                isAnimationActive={false}
              >
                {/* Etiqueta más arriba para separarla de las otras dos series. */}
                <LabelList
                  dataKey="efectividadIndirecto"
                  position="top"
                  offset={24}
                  fill="#8a6d3b"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => `${Number(v ?? 0)}%`}
                />
              </Line>
            )}
            {/* Efectividad por ciudad ACUMULADA (línea sólida) — con % visible. */}
            {showCiudadAcum && showCumana && (
              <Line
                yAxisId="pct"
                dataKey="efectCumanaAcum"
                stroke="#3e7cb1"
                strokeWidth={2}
                dot={{ r: 2, fill: "#3e7cb1" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCumanaAcum"
                  position="top"
                  offset={34}
                  fill="#3e7cb1"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {showCiudadAcum && showCabudare && (
              <Line
                yAxisId="pct"
                dataKey="efectCabudareAcum"
                stroke="#1f4e79"
                strokeWidth={2}
                dot={{ r: 2, fill: "#1f4e79" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCabudareAcum"
                  position="bottom"
                  offset={26}
                  fill="#1f4e79"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {/* Efectividad por ciudad DIARIA (línea punteada) — con % visible. */}
            {showCiudadDia && showCumana && (
              <Line
                yAxisId="pct"
                dataKey="efectCumanaDia"
                stroke="#3e7cb1"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2, fill: "#3e7cb1" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCumanaDia"
                  position="top"
                  offset={48}
                  fill="#3e7cb1"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {showCiudadDia && showCabudare && (
              <Line
                yAxisId="pct"
                dataKey="efectCabudareDia"
                stroke="#1f4e79"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2, fill: "#1f4e79" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCabudareDia"
                  position="bottom"
                  offset={40}
                  fill="#1f4e79"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
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
    loading: () => <div className="h-[400px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function CarteraTotalDiaChart({
  data,
  showEfectividad = true,
  showDirecto = false,
  showIndirecto = false,
  efectividadColor = "#dc2626",
  showVentasDirecto = false,
  showVentasIndirecto = false,
  showVentasCumana = false,
  showVentasCabudare = false,
  showCiudadAcum = false,
  showCiudadDia = false,
  showCumana = true,
  showCabudare = true,
}: {
  data: CarteraTotalDiaChartPoint[];
  showEfectividad?: boolean;
  showDirecto?: boolean;
  showIndirecto?: boolean;
  efectividadColor?: string;
  showVentasDirecto?: boolean;
  showVentasIndirecto?: boolean;
  showVentasCumana?: boolean;
  showVentasCabudare?: boolean;
  showCiudadAcum?: boolean;
  showCiudadDia?: boolean;
  showCumana?: boolean;
  showCabudare?: boolean;
}) {
  return (
    <Inner
      data={data}
      showEfectividad={showEfectividad}
      showDirecto={showDirecto}
      showIndirecto={showIndirecto}
      efectividadColor={efectividadColor}
      showVentasDirecto={showVentasDirecto}
      showVentasIndirecto={showVentasIndirecto}
      showVentasCumana={showVentasCumana}
      showVentasCabudare={showVentasCabudare}
      showCiudadAcum={showCiudadAcum}
      showCiudadDia={showCiudadDia}
      showCumana={showCumana}
      showCabudare={showCabudare}
    />
  );
}
