"use client";

import dynamic from "next/dynamic";

// Promedio de venta DIARIA por segmento de cliente y categoría.
//
// El problema de diseño era la cantidad de elementos: 14 segmentos × 4
// categorías × 2 ciudades son 112 barras. Se resuelve quitando dimensiones,
// no apretándolas:
//
//   - la CIUDAD sale del gráfico y pasa a ser un corte (Total/Cumaná/Cabudare),
//   - los segmentos chicos se agrupan en "Otros" salvo que se pidan todos,
//   - Panquecitas viene apagada: su ritmo es un orden de magnitud menor y
//     aplasta la escala de las otras tres.
//
// Quedan ~7 posiciones × 3 barras. Y como los segmentos tienen tamaños muy
// distintos (Bodegas 282 PDV, Cad Farmacia 6), el botón "por PDV" es el que
// vuelve la comparación honesta: sin él, el gráfico mide tamaño de segmento.

export interface VentaSegmentoPunto {
  segmento: string;
  clientes: number;
  /** kg/día de cada categoría, ya divididos por sus días hábiles. */
  margarina: number;
  mayonesa: number;
  harinaPan: number;
  panquecitas: number;
  /** Ratio Panquecitas ÷ categoría (%), para la fila debajo de las barras. */
  ratioMargarina: number | null;
  ratioMayonesa: number | null;
  ratioHarinaPan: number | null;
}

const CATEGORIAS = [
  { key: "harinaPan", label: "Harina PAN", color: "#1a65bd", ratio: "ratioHarinaPan" },
  { key: "margarina", label: "Margarina", color: "#f59e0b", ratio: "ratioMargarina" },
  { key: "mayonesa", label: "Mayonesa", color: "#14b8a6", ratio: "ratioMayonesa" },
] as const;

const PANQUECITAS = { key: "panquecitas", label: "Panquecitas", color: "#8b5cf6" } as const;

// Franja izquierda para el rótulo de la fila de ratios, fuera del área de
// dibujo — mismo patrón que Ventas3MesesPorCiudadChart.
const MARGEN_ROTULO = 150;

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } =
      await import("recharts");

    function VentaDiariaInner({
      data,
      porPdv,
      showPanquecitas,
    }: {
      data: VentaSegmentoPunto[];
      porPdv: boolean;
      showPanquecitas: boolean;
    }) {
      // Tipado explícito y array mutable: con el ternario sobre dos tuplas
      // `as const`, TS infiere una unión de arrays y `.map` deja de ser
      // invocable sobre ella.
      type Serie = { key: string; label: string; color: string; ratio: string | null };
      const base: Serie[] = CATEGORIAS.map((c) => ({ ...c }));
      const series: Serie[] = showPanquecitas ? [...base, { ...PANQUECITAS, ratio: null }] : base;

      const fmt = (v: number) =>
        porPdv
          ? `${v.toLocaleString("es-VE", { maximumFractionDigits: 2 })} kg`
          : `${v.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`;

      /**
       * Ratio de Panquecitas contra esta categoría, debajo de su barra.
       *
       * Va como `content` y no con position="bottom": la base de la barra es la
       * línea del eje, así que "bottom" pisaría el nombre del segmento. El
       * `fill` llega desde el LabelList, así que el color de la categoría viaja
       * con la etiqueta.
       */
      function etiquetaRatio(props: unknown) {
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
            y={y + height + 46}
            textAnchor="middle"
            fill={fill ?? "#64748b"}
            fontSize={13}
            fontWeight={700}
          >
            {`${Number(value).toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`}
          </text>
        );
      }

      /** El mismo ratio, más el rótulo de la fila en el primer segmento. */
      function etiquetaRatioConRotulo(props: unknown) {
        const { index, y, height } = props as { index: number; y: number; height: number };
        if (index !== 0) return etiquetaRatio(props);
        const base = y + height;
        return (
          <>
            <text x={4} textAnchor="start">
              <tspan x={4} y={base + 32} fill="#64748b" fontSize={12} fontWeight={700}>
                Ratio acumulado
              </tspan>
              <tspan x={4} y={base + 49} fill="#94a3b8" fontSize={12}>
                Panquecitas vs categoría
              </tspan>
            </text>
            {etiquetaRatio(props)}
          </>
        );
      }

      return (
        <ResponsiveContainer width="100%" height={430}>
          <BarChart data={data} margin={{ top: 24, right: 20, left: MARGEN_ROTULO, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            {/* Alto extra: debajo del nombre del segmento va la fila de ratios. */}
            <XAxis dataKey="segmento" tick={{ fontSize: 12, fill: "#64748b" }} height={68} interval={0} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => {
                const cat = [...CATEGORIAS, PANQUECITAS].find((c) => c.key === name);
                return [fmt(Number(value ?? 0)), cat ? cat.label : String(name ?? "")];
              }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as VentaSegmentoPunto | undefined;
                return p ? `${label} — ${p.clientes} PDV` : String(label);
              }}
            />
            <Legend
              formatter={(value: string) =>
                [...CATEGORIAS, PANQUECITAS].find((c) => c.key === value)?.label ?? value
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            {series.map((cat, i) => (
              <Bar key={cat.key} dataKey={cat.key} fill={cat.color} radius={[3, 3, 0, 0]}>
                <LabelList
                  dataKey={cat.key}
                  position="top"
                  fontSize={11}
                  fontWeight={600}
                  formatter={(v) => (Number(v ?? 0) > 0 ? fmt(Number(v ?? 0)) : "")}
                />
                {/* Solo las tres categorías de referencia llevan ratio, y solo
                    la primera dibuja además el rótulo de la fila. */}
                {cat.ratio && (
                  <LabelList
                    dataKey={cat.ratio}
                    fill={cat.color}
                    content={i === 0 ? etiquetaRatioConRotulo : etiquetaRatio}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return VentaDiariaInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[430px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function VentaDiariaPorSegmentoChart({
  data,
  porPdv = false,
  showPanquecitas = false,
}: {
  data: VentaSegmentoPunto[];
  porPdv?: boolean;
  showPanquecitas?: boolean;
}) {
  return <Inner data={data} porPdv={porPdv} showPanquecitas={showPanquecitas} />;
}
