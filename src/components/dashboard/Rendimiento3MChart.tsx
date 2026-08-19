"use client";

import dynamic from "next/dynamic";
import type { Rendimiento3MResult } from "@/lib/dienn-queries";

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
    }: {
      data: Rendimiento3MResult;
      showPanDiario: boolean;
    }) {
      // Tope del eje: el mayor entre la venta diaria más alta y las referencias
      // visibles, con 10% de aire. Sin esto la línea del promedio de PAN, que
      // suele ser un orden de magnitud mayor, no entra en el gráfico.
      const maxPanquecitas = data.puntos.reduce((m, p) => Math.max(m, p.panquecitasKg), 0);
      const maxReferencia = showPanDiario ? data.promedio3M : data.meta4Pct;
      const maxY = Math.ceil(Math.max(maxPanquecitas, maxReferencia) * 1.1);

      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data.puntos} margin={{ top: 24, right: 16, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} minTickGap={16} />
            {/* El dominio se fuerza a incluir las líneas fijas: en automático
                Recharts escala solo con las Panquecitas y el promedio de PAN
                (mucho mayor) queda FUERA del área visible — por eso no se veía.
                Eje oculto, igual que en Panquecitas vs Harina PAN. */}
            <YAxis hide domain={[0, maxY]} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name, item) => {
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
              formatter={(value: string) => (value === "panquecitasKg" ? "Panquecitas del día (kg)" : value)}
              wrapperStyle={{ fontSize: 12 }}
            />
            {/* Indicador Fijo A: promedio diario de Harina PAN de los 3 meses. */}
            {showPanDiario && (
              <ReferenceLine
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
}: {
  data: Rendimiento3MResult;
  showPanDiario?: boolean;
}) {
  return <Inner data={data} showPanDiario={showPanDiario} />;
}
