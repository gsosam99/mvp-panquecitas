"use client";

import dynamic from "next/dynamic";
import type { Rendimiento3MResult } from "@/lib/dienn-queries";

/** Ratio ACUMULADO por ciudad, alineado por día con data.puntos. */
export interface Rendimiento3MRatioCiudad {
  dia: string;
  ratioCumanaAcum: number | null;
  ratioCabudareAcum: number | null;
}

// Rendimiento diario de Panquecitas contra el promedio histórico de Harina PAN
// de los últimos 3 meses (punto 1 del documento de cambios).
//
// Eje en kg. Dos referencias FIJAS y horizontales: el promedio diario de PAN
// (línea continua, se puede apagar porque su escala aplasta la de Panquecitas)
// y el 4% de ese promedio (línea punteada, la meta). El ratio del día
// (Panquecitas ÷ promedio3M × 100) va en la etiqueta y en el tooltip.

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, LabelList } =
      await import("recharts");

    function Rendimiento3MInner({
      data,
      showPanDiario,
      ratiosCiudad,
      showRatioCiudades,
    }: {
      data: Rendimiento3MResult;
      showPanDiario: boolean;
      ratiosCiudad: Rendimiento3MRatioCiudad[];
      showRatioCiudades: boolean;
    }) {
      // Escala del eje de kg.
      //
      // El promedio de PAN es un orden de magnitud mayor que la venta diaria de
      // Panquecitas (p. ej. 17.939 vs ~500 kg). Con eje LINEAL el promedio se
      // lleva toda la altura, la meta del 4% queda pegada al piso y el
      // comportamiento diario no se aprecia.
      //
      // Con la línea de PAN visible se usa escala LOGARÍTMICA: el promedio queda
      // arriba como referencia, pero la meta y el día a día recuperan detalle.
      // Con la línea apagada no hay rango extremo que resolver y se vuelve al
      // eje lineal, que es más fácil de leer.
      const valores = data.puntos.map((p) => p.panquecitasKg).filter((v) => v > 0);
      const maxPanquecitas = valores.length > 0 ? Math.max(...valores) : 0;
      const minPanquecitas = valores.length > 0 ? Math.min(...valores) : 1;

      const escalaLog = showPanDiario && data.promedio3M > 0;
      const maxLineal = Math.ceil(Math.max(maxPanquecitas, data.meta4Pct) * 1.15);
      // En log el dominio no puede tocar el 0; se deja un piso por debajo del
      // valor más chico para que ningún punto quede fuera.
      const minLog = Math.max(1, Math.floor(Math.min(minPanquecitas, data.meta4Pct) * 0.6));
      const maxLog = Math.ceil(data.promedio3M * 1.3);

      // Los ratios por ciudad llegan aparte y se pegan por día: van en su propio
      // eje porque son % y en la escala de kg quedarían pegados a cero.
      const ratioPorDia = new Map(ratiosCiudad.map((r) => [r.dia, r]));
      const chartData = data.puntos.map((p) => ({
        ...p,
        ratioCumanaAcum: ratioPorDia.get(p.dia)?.ratioCumanaAcum ?? null,
        ratioCabudareAcum: ratioPorDia.get(p.dia)?.ratioCabudareAcum ?? null,
      }));

      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 24, right: 16, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} minTickGap={16} />
            {/* El dominio se fuerza a incluir las líneas fijas: en automático
                Recharts escala solo con las Panquecitas y el promedio de PAN
                (mucho mayor) queda FUERA del área visible — por eso no se veía.
                Eje oculto, igual que en Panquecitas vs Harina PAN. */}
            <YAxis
              yAxisId="kg"
              hide
              scale={escalaLog ? "log" : "auto"}
              domain={escalaLog ? [minLog, maxLog] : [0, maxLineal]}
              allowDataOverflow
            />
            {/* Eje propio para los ratios por ciudad (%). */}
            <YAxis yAxisId="pct" hide />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name, item) => {
                if (name === "ratioCumanaAcum")
                  return [`${Number(value ?? 0)}%`, "Ratio acumulado — Cumaná"];
                if (name === "ratioCabudareAcum")
                  return [`${Number(value ?? 0)}%`, "Ratio acumulado — Cabudare"];
                if (name === "panquecitasKg") {
                  // Cast defensivo: el tipo del item del tooltip varía entre
                  // versiones de Recharts y solo se necesita el ratio del punto.
                  const ratio =
                    (item as unknown as { payload?: { ratioPct?: number } } | undefined)?.payload?.ratioPct ?? 0;
                  return [
                    `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg · ${ratio}% del promedio PAN`,
                    "Panquecitas del día",
                  ];
                }
                return [String(value ?? ""), String(name ?? "")];
              }}
            />
            <Legend
              formatter={(value: string) =>
                value === "panquecitasKg"
                  ? "Panquecitas del día (kg)"
                  : value === "ratioCumanaAcum"
                  ? "Ratio acum. — Cumaná"
                  : value === "ratioCabudareAcum"
                  ? "Ratio acum. — Cabudare"
                  : value
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            {/* Indicador Fijo A: promedio diario de Harina PAN de los 3 meses. */}
            {showPanDiario && (
              <ReferenceLine
                yAxisId="kg"
                y={data.promedio3M}
                stroke="#64748b"
                strokeWidth={2}
                label={{
                  value: `Promedio PAN 3M: ${data.promedio3M.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg/día`,
                  position: "insideTopLeft",
                  fill: "#475569",
                  fontSize: 10,
                }}
              />
            )}
            {/* Indicador Fijo B: 4% de ese promedio — la meta. */}
            <ReferenceLine
              yAxisId="kg"
              y={data.meta4Pct}
              stroke="#16a34a"
              strokeWidth={2}
              strokeDasharray="6 4"
              label={{
                value: `Meta 4%: ${data.meta4Pct.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg/día`,
                position: "insideBottomLeft",
                fill: "#15803d",
                fontSize: 10,
              }}
            />
            {/* Suavizada y con el mismo grosor/puntos que Panquecitas vs Harina PAN. */}
            <Line
              yAxisId="kg"
              type="monotone"
              dataKey="panquecitasKg"
              stroke="#1a65bd"
              strokeWidth={2}
              dot={{ r: 3, fill: "#1a65bd" }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="ratioPct"
                position="top"
                offset={6}
                fill="#1a65bd"
                fontSize={9}
                formatter={(v) => `${Number(v ?? 0)}%`}
              />
            </Line>
            {/* Ratio ACUMULADO por ciudad (opcional): Σ Panquecitas de la ciudad ÷
                (su promedio PAN × días hábiles transcurridos). Mismos tonos de
                azul que el resto del dashboard. */}
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

    return Rendimiento3MInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[340px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function Rendimiento3MChart({
  data,
  showPanDiario = true,
  ratiosCiudad = [],
  showRatioCiudades = false,
}: {
  data: Rendimiento3MResult;
  showPanDiario?: boolean;
  ratiosCiudad?: Rendimiento3MRatioCiudad[];
  showRatioCiudades?: boolean;
}) {
  return (
    <Inner
      data={data}
      showPanDiario={showPanDiario}
      ratiosCiudad={ratiosCiudad}
      showRatioCiudades={showRatioCiudades}
    />
  );
}
