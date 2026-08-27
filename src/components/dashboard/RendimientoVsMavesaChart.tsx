"use client";

import dynamic from "next/dynamic";
import type { RendimientoVsMavesaResult } from "@/lib/mavesa-queries";

/** Ratio ACUMULADO por ciudad, alineado por día con data.puntos. Mismas
 * etiquetas de ciudad que Rendimiento3MChart (Cumaná/Cabudare). */
export interface RendimientoVsMavesaRatioCiudad {
  dia: string;
  ratioCumanaAcum: number | null;
  ratioCabudareAcum: number | null;
}

// Copia adaptada de Rendimiento3MChart.tsx (PAN): misma mecánica —
// referencia horizontal fija, meta 4% punteada, ratio del día como etiqueta
// sobre la línea de Panquecitas, y ratio acumulado por ciudad opcional en su
// propio eje — pero para Margarina/Mayonesa. Diferencia real: los textos se
// parametrizan por `categoriaLabel` en vez de tener "PAN" hardcodeado.

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, LabelList } =
      await import("recharts");

    function RendimientoVsMavesaInner({
      data,
      categoriaLabel,
      showReferenciaDiario,
      ratiosCiudad,
      showRatioCiudades,
    }: {
      data: RendimientoVsMavesaResult;
      categoriaLabel: string;
      showReferenciaDiario: boolean;
      ratiosCiudad: RendimientoVsMavesaRatioCiudad[];
      showRatioCiudades: boolean;
    }) {
      const valores = data.puntos.map((p) => p.panquecitasKg).filter((v) => v > 0);
      const maxPanquecitas = valores.length > 0 ? Math.max(...valores) : 0;
      const minPanquecitas = valores.length > 0 ? Math.min(...valores) : 1;

      // Este gráfico NO dibuja la línea de meta 4% (decisión del usuario,
      // 27-08-2026) — a diferencia del de Harina PAN, que sí la conserva. Por
      // eso `data.meta4Pct` ya no entra en el dominio del eje: incluirlo solo
      // servía para que la línea cupiera, y como es el 4% de la referencia
      // (un valor muy por debajo de la venta diaria) arrastraba el piso hacia
      // abajo y aplastaba los datos reales contra el techo.
      const escalaLog = showReferenciaDiario && data.promedioReferencia > 0;
      const maxLineal = Math.max(1, Math.ceil(maxPanquecitas * 1.15));

      // El techo de la escala log tiene que contemplar TAMBIEN el maximo de
      // Panquecitas, no solo el promedio de referencia. Con Mayonesa el
      // promedio es bajo (vende bastante menos que Harina PAN), asi que los
      // dias buenos del piloto quedaban por encima del dominio y, como el eje
      // va con allowDataOverflow, se cortaban sin dejar rastro: ni punto, ni
      // etiqueta de %, ni tramo de linea.
      const maxLog = Math.max(1, Math.ceil(Math.max(data.promedioReferencia, maxPanquecitas) * 1.3));

      // El piso puede bajar de 1 kg: la escala log no admite 0, pero si
      // fracciones. Antes se forzaba a >= 1 y un dia de menos de 1 kg se
      // salia por abajo del dominio, con el mismo resultado.
      const minLog = Math.max(0.1, minPanquecitas * 0.6);

      const ratioPorDia = new Map(ratiosCiudad.map((r) => [r.dia, r]));
      const chartData = data.puntos.map((p) => ({
        ...p,
        ratioCumanaAcum: ratioPorDia.get(p.dia)?.ratioCumanaAcum ?? null,
        ratioCabudareAcum: ratioPorDia.get(p.dia)?.ratioCabudareAcum ?? null,
      }));

      // Margen derecho chico: la etiqueta que lo obligaba a ser ancho era la
      // de la meta 4%, que ya no se dibuja. La del promedio va insideTopLeft.
      const MARGEN_DERECHO = 24;

      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 52, right: MARGEN_DERECHO, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 13, fill: "#64748b" }} minTickGap={16} />
            <YAxis
              yAxisId="kg"
              hide
              scale={escalaLog ? "log" : "auto"}
              domain={escalaLog ? [minLog, maxLog] : [0, maxLineal]}
              allowDataOverflow
            />
            <YAxis yAxisId="pct" hide />
            <Tooltip
              contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name, item) => {
                if (name === "ratioCumanaAcum")
                  return [`${Number(value ?? 0)}%`, "Ratio acumulado — Cumaná"];
                if (name === "ratioCabudareAcum")
                  return [`${Number(value ?? 0)}%`, "Ratio acumulado — Cabudare"];
                if (name === "panquecitasKg") {
                  const ratio =
                    (item as unknown as { payload?: { ratioPct?: number } } | undefined)?.payload?.ratioPct ?? 0;
                  return [
                    `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg · ${ratio}% del promedio ${categoriaLabel}`,
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
              wrapperStyle={{ fontSize: 13 }}
            />
            {showReferenciaDiario && (
              <ReferenceLine
                yAxisId="kg"
                y={data.promedioReferencia}
                stroke="#64748b"
                strokeWidth={2}
                label={{
                  value: `Promedio ${categoriaLabel}: ${data.promedioReferencia.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg/día`,
                  position: "insideTopLeft",
                  fill: "#334155",
                  fontSize: 15,
                  fontWeight: 600,
                }}
              />
            )}
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
                offset={8}
                fill="#1a65bd"
                fontSize={15}
                fontWeight={600}
                formatter={(v) => `${Number(v ?? 0)}%`}
              />
            </Line>
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

    return RendimientoVsMavesaInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[340px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function RendimientoVsMavesaChart({
  data,
  categoriaLabel,
  showReferenciaDiario = true,
  ratiosCiudad = [],
  showRatioCiudades = false,
}: {
  data: RendimientoVsMavesaResult;
  categoriaLabel: string;
  showReferenciaDiario?: boolean;
  ratiosCiudad?: RendimientoVsMavesaRatioCiudad[];
  showRatioCiudades?: boolean;
}) {
  return (
    <Inner
      data={data}
      categoriaLabel={categoriaLabel}
      showReferenciaDiario={showReferenciaDiario}
      ratiosCiudad={ratiosCiudad}
      showRatioCiudades={showRatioCiudades}
    />
  );
}
