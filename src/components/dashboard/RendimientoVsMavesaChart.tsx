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
// referencia ESCALONADA por fecha de cartera, ratio del día como etiqueta
// sobre la línea de Panquecitas, y ratio acumulado por ciudad opcional en su
// propio eje — pero para Margarina/Mayonesa. Dos diferencias reales: los
// textos se parametrizan por `categoriaLabel` en vez de tener "PAN"
// hardcodeado, y acá NO se dibuja la meta del 4% (estas categorías no la
// tienen).

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } =
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
      // Contra el ESCALÓN MÁS ALTO del promedio, no contra un valor único: el
      // promedio sube en cada ampliación de cartera y el último escalón es el
      // más grande; con el valor de un solo día se salía del dominio.
      const promediosDia = data.puntos.map((p) => p.promedioDia).filter((v) => v > 0);
      const maxPromedio =
        promediosDia.length > 0 ? Math.max(...promediosDia) : data.promedioReferencia;
      const maxLog = Math.max(1, Math.ceil(Math.max(maxPromedio, maxPanquecitas) * 1.3));

      // El piso puede bajar de 1 kg: la escala log no admite 0, pero si
      // fracciones. Antes se forzaba a >= 1 y un dia de menos de 1 kg se
      // salia por abajo del dominio, con el mismo resultado.
      const minLog = Math.max(0.1, minPanquecitas * 0.6);

      // Rótulo del promedio, anclado al último escalón (el vigente hoy) y
      // dibujado a la derecha de la línea. Named function, no flecha en línea:
      // una flecha que devuelve JSX en una prop la marca ESLint como
      // componente sin displayName.
      const ultimoIdx = data.puntos.length - 1;
      function rotuloPromedio(props: unknown) {
        const { x, y, index, value } = props as {
          x: number;
          y: number;
          index: number;
          value: number | null | undefined;
        };
        if (index !== ultimoIdx || value == null) return null;
        return (
          <text fill="#334155" fontSize={15} fontWeight={700}>
            <tspan x={x + 8} y={y - 3}>
              {categoriaLabel}
            </tspan>
            <tspan x={x + 8} y={y + 16}>
              {`${Number(value).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg/día`}
            </tspan>
          </text>
        );
      }

      const ratioPorDia = new Map(ratiosCiudad.map((r) => [r.dia, r]));
      const chartData = data.puntos.map((p) => ({
        ...p,
        ratioCumanaAcum: ratioPorDia.get(p.dia)?.ratioCumanaAcum ?? null,
        ratioCabudareAcum: ratioPorDia.get(p.dia)?.ratioCabudareAcum ?? null,
      }));

      // Franja derecha para el rótulo del promedio, que se ancla al último
      // escalón y va fuera del área de dibujo. Da para "Margarina" /
      // "3.268 kg/día" a 15px en dos líneas. Antes el rótulo iba dentro
      // (insideTopLeft) y bastaban 24px, pero con el promedio escalonado el
      // texto tiene que quedar a la altura del escalón vigente.
      const MARGEN_DERECHO = 104;

      return (
        <ResponsiveContainer width="100%" height={370}>
          <ComposedChart data={chartData} margin={{ top: 66, right: MARGEN_DERECHO, left: 10, bottom: 5 }}>
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
                if (name === "promedioDia")
                  return [
                    `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg/día`,
                    `Promedio ${categoriaLabel} (cartera vigente ese día)`,
                  ];
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
                  : value === "promedioDia"
                  ? `Promedio ${categoriaLabel} (escalonado por tanda)`
                  : value === "ratioCumanaAcum"
                  ? "Ratio acum. — Cumaná"
                  : value === "ratioCabudareAcum"
                  ? "Ratio acum. — Cabudare"
                  : value
              }
              wrapperStyle={{ fontSize: 13 }}
            />
            {/* Promedio de la categoría, ESCALONADO por fecha de cartera —
                igual que en el gráfico de PAN. Deja de ser una horizontal
                porque el denominador de cada día son los PDV que ya eran
                cartera esa fecha; una recta única mentía sobre los días
                anteriores a cada ampliación. */}
            {showReferenciaDiario && (
              <Line
                yAxisId="kg"
                type="stepAfter"
                dataKey="promedioDia"
                stroke="#64748b"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              >
                <LabelList dataKey="promedioDia" content={rotuloPromedio} />
              </Line>
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
    loading: () => <div className="h-[370px] bg-slate-50 rounded-lg animate-pulse" />,
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
