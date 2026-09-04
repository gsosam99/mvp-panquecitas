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
  /**
   * Activación acumulada "a escala": el mismo numerador contra la cartera SIN
   * los inactivos de segmentos no vendibles (licorerías, CS, farmacias,
   * mascotas, animales). Ver SEGMENTOS_SIN_ALIMENTOS.
   */
  efectCumanaEscala?: number | null;
  efectCabudareEscala?: number | null;
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
      showEscalaCumana,
      showEscalaCabudare,
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
      showEscalaCumana: boolean;
      showEscalaCabudare: boolean;
      showCabudare: boolean;
    }) {
      // Con cualquier desglose de barras prendido (modelo o ciudad) se oculta la
      // barra del total, para no sumar dos veces el mismo volumen.
      const hayDesglose = showVentasDirecto || showVentasIndirecto || showVentasCumana || showVentasCabudare;

      // Margen superior del gráfico: hace falta para reconstruir dónde cae cada
      // ratio en píxeles (ver etiquetaKgEnExtremoLibre).
      const MARGEN_TOP = 32;

      /**
       * Dibuja los kg de una barra en el extremo — arriba o abajo — que quede
       * más lejos de los ratios de ese día.
       *
       * Los % viven en el eje 0–100 y los kg en el suyo, así que la distancia
       * entre ambos cambia día a día: no hay posición fija que sirva siempre.
       * Acá se convierte cada ratio visible a su píxel y se elige el extremo de
       * la barra cuya distancia al ratio más cercano sea mayor.
       */
      function etiquetaKgEnExtremoLibre(props: unknown) {
        const { x, y, width, height, index, value } = props as {
          x: number;
          y: number;
          width: number;
          height: number;
          index: number;
          value: number;
        };
        if (!value) return null;

        const punto = data[index];
        const base = y + height; // la base de la barra ES la línea del eje X
        const altoArea = Math.max(base - MARGEN_TOP, 1);
        const pixelDeRatio = (pct: number) => base - (pct / 100) * altoArea;

        const ratios: number[] = [];
        if (showEfectividad) ratios.push(punto.efectividad);
        if (showDirecto) ratios.push(punto.efectividadDirecto);
        if (showIndirecto) ratios.push(punto.efectividadIndirecto);
        if (showCiudadAcum && showCumana && punto.efectCumanaAcum != null) ratios.push(punto.efectCumanaAcum);
        if (showCiudadAcum && showCabudare && punto.efectCabudareAcum != null) ratios.push(punto.efectCabudareAcum);
        if (showCiudadDia && showCumana && punto.efectCumanaDia != null) ratios.push(punto.efectCumanaDia);
        if (showCiudadDia && showCabudare && punto.efectCabudareDia != null) ratios.push(punto.efectCabudareDia);

        const yArriba = y + 12;
        const yAbajo = base - 6;
        // Sin ratios visibles no hay nada que esquivar: se deja arriba.
        const holgura = (yTexto: number) =>
          ratios.length === 0 ? Infinity : Math.min(...ratios.map((r) => Math.abs(pixelDeRatio(r) - yTexto)));
        const yTexto = holgura(yArriba) >= holgura(yAbajo) ? yArriba : yAbajo;

        return (
          <text
            x={x + width / 2}
            y={yTexto}
            textAnchor="middle"
            fill="#1e3a8a"
            fontSize={10}
            stroke="#ffffff"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {`${Number(value).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`}
          </text>
        );
      }

      return (
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={data} margin={{ top: MARGEN_TOP, right: 12, left: 10, bottom: 5 }}>
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
                if (name === "radarKgDiaCumana") return [formatKg(Number(value ?? 0)), "Volumen Radar — Cumaná"];
                if (name === "radarKgDiaCabudare") return [formatKg(Number(value ?? 0)), "Volumen Radar — Cabudare"];
                if (name === "efectCumanaAcum") return [`${Number(value ?? 0)}%`, "Cumaná (acum)"];
                if (name === "efectCumanaDia") return [`${Number(value ?? 0)}%`, "Cumaná (día)"];
                if (name === "efectCabudareAcum") return [`${Number(value ?? 0)}%`, "Cabudare (acum)"];
                if (name === "efectCabudareDia") return [`${Number(value ?? 0)}%`, "Cabudare (día)"];
                if (name === "efectCumanaEscala")
                  return [`${Number(value ?? 0)}%`, "Cumaná a escala (sin no vendibles)"];
                if (name === "efectCabudareEscala")
                  return [`${Number(value ?? 0)}%`, "Cabudare a escala (sin no vendibles)"];
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
                  : value === "efectCumanaEscala"
                  ? "Cumaná a escala"
                  : value === "efectCabudareEscala"
                  ? "Cabudare a escala"
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
                {/* Los kg se colocan en el extremo de la barra que le deje espacio
                    al ratio, decidido punto por punto (ver etiquetaKgEnExtremoLibre).
                    Una posición fija no sirve: los % viven en otro eje, así que en
                    unos días caen cerca del tope de la barra y en otros cerca de la
                    base — el 17 de agosto tapaban el ratio del modelo. */}
                <LabelList dataKey="radarKgDia" content={etiquetaKgEnExtremoLibre} />
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
                {/* Texto OSCURO, no blanco: el halo de las etiquetas es blanco y
                    un relleno blanco encima de un contorno blanco desaparecía —
                    las barras de Cabudare se veían con un borrón en vez del kg. */}
                <LabelList
                  dataKey="radarKgDiaCabudare"
                  position="center"
                  fill="#12365c"
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
                {/* Etiqueta ENCIMA de su propia línea verde. Antes iba debajo del
                    punto y el número del Indirecto —que va arriba de su línea,
                    con offset 24— le caía justo encima: para separarse hacía
                    falta que las dos líneas quedaran a más de ~38 px, y no lo
                    están. Con las dos etiquetas por encima de su respectiva
                    línea, la separación necesaria baja a ~14 px y los dos
                    números se leen. */}
                <LabelList
                  dataKey="efectividadDirecto"
                  position="top"
                  offset={10}
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
            {/* Activación ACUMULADA "a escala": mismo numerador, denominador sin
                los inactivos de segmentos no vendibles. Línea gruesa y sólida
                para que se distinga de la acumulada normal, que va sobre el
                mismo eje y es siempre más baja. */}
            {showEscalaCumana && (
              <Line
                yAxisId="pct"
                dataKey="efectCumanaEscala"
                stroke="#0d9488"
                strokeWidth={3}
                dot={{ r: 3, fill: "#0d9488" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCumanaEscala"
                  position="top"
                  offset={58}
                  fill="#0d9488"
                  fontSize={10}
                  fontWeight={700}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {showEscalaCabudare && (
              <Line
                yAxisId="pct"
                dataKey="efectCabudareEscala"
                stroke="#0f766e"
                strokeWidth={3}
                strokeDasharray="8 3"
                dot={{ r: 3, fill: "#0f766e" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCabudareEscala"
                  position="bottom"
                  offset={52}
                  fill="#0f766e"
                  fontSize={10}
                  fontWeight={700}
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
  showEscalaCumana = false,
  showEscalaCabudare = false,
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
  showEscalaCumana?: boolean;
  showEscalaCabudare?: boolean;
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
      showEscalaCumana={showEscalaCumana}
      showEscalaCabudare={showEscalaCabudare}
      showCabudare={showCabudare}
    />
  );
}
