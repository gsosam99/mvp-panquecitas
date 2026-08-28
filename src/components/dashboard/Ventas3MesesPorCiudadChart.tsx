"use client";

import dynamic from "next/dynamic";
import type { Ventas3MesesRow } from "@/lib/mavesa-queries";

// Barras de Margarina, Mayonesa y Harina PAN de los últimos 3 meses
// (referencia), por ciudad — mismo patrón visual que PortafolioPorCiudadChart
// (eje X = categoría, color = ciudad). Sin toggle de Harina PAN (siempre
// presente) ni de Cliente/Universo (la cartera es una sola población, ver
// getVentas3MesesPorCiudad).

const COLOR_POR_SECTOR: Record<string, string> = {
  cumana: "#1a65bd",
  barquisimeto_este: "#f59e0b",
};

const CATEGORIAS = ["Margarina", "Mayonesa", "Harina PAN"];

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
      LabelList,
      ReferenceLine,
    } = await import("recharts");

    function Ventas3MesesInner({
      data,
      comoPct,
      showIndiceCumana,
      ratiosPanquecitas,
    }: {
      data: Ventas3MesesRow[];
      comoPct: boolean;
      showIndiceCumana: boolean;
      ratiosPanquecitas: Record<string, number | null>;
    }) {
      const categorias = CATEGORIAS;

      const kgDe = (row: Ventas3MesesRow, nombre: string) =>
        row.productos.find((p) => p.nombre === nombre)?.volumenKg ?? 0;

      const totalPorCiudad = new Map(
        data.map((row) => [row.label, categorias.reduce((s, nombre) => s + kgDe(row, nombre), 0)])
      );

      // Índice con Cumaná como base 100: cuánto pesa Cabudare frente a Cumaná en
      // cada categoría. Siempre en kg, aunque las barras estén en "% del total"
      // — es una comparación de volumen entre ciudades, no de mezcla interna.
      const cumana = data.find((r) => r.sector === "cumana");
      const cabudare = data.find((r) => r.sector === "barquisimeto_este");

      const chartData = categorias.map((nombre) => {
        const punto: Record<string, string | number | null> = { categoria: nombre };
        for (const row of data) {
          const kg = kgDe(row, nombre);
          const total = totalPorCiudad.get(row.label) ?? 0;
          punto[row.label] = comoPct ? (total > 0 ? Math.round((kg / total) * 1000) / 10 : 0) : Math.round(kg * 10) / 10;
        }
        // Ratio acumulado de Panquecitas vs. esta categoría, por ciudad. Va en
        // el propio punto para que cada LabelList lo saque por dataKey y no
        // haga falta cerrar sobre la ciudad.
        for (const row of data) {
          punto[`ratioPanq_${row.sector}`] = ratiosPanquecitas[`${nombre}|${row.sector}`] ?? null;
        }
        const baseCumana = cumana ? kgDe(cumana, nombre) : 0;
        const kgCabudare = cabudare ? kgDe(cabudare, nombre) : 0;
        punto.indiceCabudare =
          baseCumana > 0 && kgCabudare > 0 ? Math.round((kgCabudare / baseCumana) * 1000) / 10 : null;
        return punto;
      });

      // El eje del índice se estira un 20% sobre el mayor entre 100 y el índice
      // más alto, para que la línea y su base de 100% queden ARRIBA, sobre las
      // barras, y no cruzándolas por el medio.
      const maxIndice = Math.max(
        100,
        ...chartData.map((p) => Number(p.indiceCabudare ?? 0)).filter((v) => v > 0)
      );

      const formatLabel = (v: number) =>
        comoPct
          ? `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`
          : `${v.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`;

      /**
       * Ratio acumulado de Panquecitas vs. esta categoría en esta ciudad,
       * dibujado DEBAJO de su barra (por fuera del área de dibujo, en la franja
       * que reserva la altura del XAxis).
       *
       * Va como `content` y no con `position="bottom"`: la base de la barra es
       * la línea del eje, así que "bottom" lo dejaría pisando el nombre de la
       * categoría. Con la geometría de la barra (y + height = la base) el texto
       * se ancla debajo de ese nombre, alineado con SU columna.
       */
      function etiquetaRatioDebajo(props: unknown) {
        // `fill` llega tal cual desde el LabelList: así el color de la ciudad
        // viaja con el propio label y esta función no necesita saber cuál es.
        const { x, y, width, height, value, fill } = props as {
          x: number;
          y: number;
          width: number;
          height: number;
          value: number | null | undefined;
          fill?: string;
        };
        if (value == null) return null;
        return (
          <text
            x={x + width / 2}
            y={y + height + 40}
            textAnchor="middle"
            fill={fill ?? "#64748b"}
            fontSize={11}
            fontWeight={600}
          >
            {`${Number(value).toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`}
          </text>
        );
      }

      return (
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            {/* Alto extra en el eje X: debajo del nombre de la categoría van los
                ratios acumulados de Panquecitas de cada ciudad. */}
            <XAxis dataKey="categoria" tick={{ fontSize: 13, fill: "#64748b" }} height={58} />
            <YAxis yAxisId="vol" hide />
            {/* Eje propio del índice (Cumaná = 100), en % y separado del volumen. */}
            <YAxis yAxisId="idx" hide domain={[0, Math.ceil(maxIndice * 1.2)]} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) =>
                name === "indiceCabudare"
                  ? [`${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })}% de Cumaná`, "Cabudare vs Cumaná"]
                  : [formatLabel(Number(value ?? 0)), String(name ?? "")]
              }
            />
            <Legend
              formatter={(value: string) => (value === "indiceCabudare" ? "Cabudare vs Cumaná (Cumaná = 100%)" : value)}
              wrapperStyle={{ fontSize: 12 }}
            />
            {data.map((row) => (
              <Bar
                key={row.sector}
                yAxisId="vol"
                dataKey={row.label}
                fill={COLOR_POR_SECTOR[row.sector] ?? "#94a3b8"}
                radius={[3, 3, 0, 0]}
              >
                <LabelList dataKey={row.label} position="top" fontSize={11} formatter={(v) => formatLabel(Number(v ?? 0))} />
                {/* Ratio acumulado de Panquecitas vs. esta categoría, debajo de la barra. */}
                <LabelList
                  dataKey={`ratioPanq_${row.sector}`}
                  fill={COLOR_POR_SECTOR[row.sector] ?? "#94a3b8"}
                  content={etiquetaRatioDebajo}
                />
              </Bar>
            ))}
            {/* Base del índice: Cumaná = 100%. */}
            {showIndiceCumana && (
              <ReferenceLine
                yAxisId="idx"
                y={100}
                stroke={COLOR_POR_SECTOR.cumana}
                strokeWidth={2}
                strokeDasharray="6 4"
                label={{
                  value: "Cumaná = 100%",
                  position: "insideTopLeft",
                  fill: COLOR_POR_SECTOR.cumana,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              />
            )}
            {showIndiceCumana && (
              <Line
                yAxisId="idx"
                type="monotone"
                dataKey="indiceCabudare"
                stroke={COLOR_POR_SECTOR.barquisimeto_este}
                strokeWidth={2}
                dot={{ r: 4, fill: COLOR_POR_SECTOR.barquisimeto_este }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="indiceCabudare"
                  position="top"
                  offset={10}
                  fill="#b45309"
                  fontSize={12}
                  fontWeight={700}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) =>
                    v == null ? "" : `${Number(v).toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`
                  }
                />
              </Line>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return Ventas3MesesInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[380px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function Ventas3MesesPorCiudadChart({
  data,
  comoPct = false,
  showIndiceCumana = false,
  ratiosPanquecitas = {},
}: {
  data: Ventas3MesesRow[];
  comoPct?: boolean;
  /** Superpone la línea de Cabudare como % de Cumaná (Cumaná = 100%). */
  showIndiceCumana?: boolean;
  /** Ratio acumulado Panquecitas vs. categoría, clave `${categoría}|${sector}`. */
  ratiosPanquecitas?: Record<string, number | null>;
}) {
  return (
    <Inner
      data={data}
      comoPct={comoPct}
      showIndiceCumana={showIndiceCumana}
      ratiosPanquecitas={ratiosPanquecitas}
    />
  );
}
