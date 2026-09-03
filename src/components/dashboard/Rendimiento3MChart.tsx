"use client";

import dynamic from "next/dynamic";
import type { Rendimiento3MResult } from "@/lib/dienn-queries";

/**
 * Rótulo de una línea escalonada, anclado a su ÚLTIMO punto y dibujado en el
 * margen derecho (MARGEN_META), fuera del área de dibujo.
 *
 * En dos líneas a propósito: en una sola, el texto de la meta a 17px pedía
 * ~150px de franja, el área de dibujo se quedaba corta y el eje X empezaba a
 * botar días (se perdió el 24 de agosto). Partido en dos, la franja baja a
 * ~104px sin achicar la letra.
 *
 * Va sobre el último punto y no como ReferenceLine porque el promedio y la
 * meta ya no son horizontales: cambian con cada tanda que entra a la cartera.
 * El último escalón es el vigente hoy, y es el que queda pegado al borde.
 */
function rotuloUltimoEscalon(
  props: unknown,
  ultimoIdx: number,
  titulo: string,
  color: string,
  fontSize: number,
  sufijo: string
) {
  const { x, y, index, value } = props as {
    x: number;
    y: number;
    index: number;
    value: number | null | undefined;
  };
  if (index !== ultimoIdx || value == null) return null;
  const tx = x + 8;
  return (
    <text fill={color} fontSize={fontSize} fontWeight={700}>
      <tspan x={tx} y={y - 3}>
        {titulo}
      </tspan>
      <tspan x={tx} y={y + fontSize + 1}>
        {`${Number(value).toLocaleString("es-VE", { maximumFractionDigits: 0 })}${sufijo}`}
      </tspan>
    </text>
  );
}

/** Ratio ACUMULADO por ciudad, alineado por día con data.puntos. */
export interface Rendimiento3MRatioCiudad {
  dia: string;
  ratioCumanaAcum: number | null;
  ratioCabudareAcum: number | null;
}

// Rendimiento diario de Panquecitas contra el promedio histórico de Harina PAN
// de los últimos 3 meses (punto 1 del documento de cambios).
//
// Eje en kg. Dos referencias ESCALONADAS: el promedio diario de PAN (línea
// continua, se puede apagar porque su escala aplasta la de Panquecitas) y el
// 4% de ese promedio (punteada, la meta). Escalonadas y no horizontales porque
// el denominador de cada día son los PDV que ya eran cartera esa fecha, así
// que sube en cada ampliación. El ratio del día (Panquecitas ÷ promedio de ESE
// día × 100) va en la etiqueta y en el tooltip.

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } =
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

      // El promedio y la meta son ESCALONADOS: cambian cada vez que entra una
      // tanda a la cartera. El dominio se calcula contra sus extremos, no
      // contra un valor único, o los escalones se salen del área visible.
      const metasDia = data.puntos.map((p) => p.meta4PctDia).filter((v) => v > 0);
      const promediosDia = data.puntos.map((p) => p.promedioDia).filter((v) => v > 0);
      const maxMeta = metasDia.length > 0 ? Math.max(...metasDia) : data.meta4Pct;
      const minMeta = metasDia.length > 0 ? Math.min(...metasDia) : data.meta4Pct;
      const maxPromedio = promediosDia.length > 0 ? Math.max(...promediosDia) : data.promedio3M;

      const escalaLog = showPanDiario && data.promedio3M > 0;
      const maxLineal = Math.ceil(Math.max(maxPanquecitas, maxMeta) * 1.15);
      // En log el dominio no puede tocar el 0; se deja un piso por debajo del
      // valor más chico para que ningún punto quede fuera.
      const minLog = Math.max(1, Math.floor(Math.min(minPanquecitas, minMeta) * 0.6));
      const maxLog = Math.ceil(maxPromedio * 1.3);

      // Índice del último punto: los rótulos del promedio y de la meta se
      // anclan ahí (ver rotuloUltimoEscalon).
      const ultimoIdx = data.puntos.length - 1;
      // Envoltorios con nombre, no flechas en línea: una flecha que devuelve
      // JSX dentro de una prop la marca ESLint como componente sin displayName.
      function rotuloPromedio(p: unknown) {
        return rotuloUltimoEscalon(p, ultimoIdx, "PAN 3M", "#334155", 15, " kg/día");
      }
      function rotuloMeta(p: unknown) {
        return rotuloUltimoEscalon(p, ultimoIdx, "Meta 4%", "#15803d", 17, " kg");
      }

      const ratioPorDia = new Map(ratiosCiudad.map((r) => [r.dia, r]));
      const chartData = data.puntos.map((p) => ({
        ...p,
        ratioCumanaAcum: ratioPorDia.get(p.dia)?.ratioCumanaAcum ?? null,
        ratioCabudareAcum: ratioPorDia.get(p.dia)?.ratioCabudareAcum ?? null,
      }));

      // ── Dónde van los textos del promedio y de la meta ────────────────
      //
      // Franja reservada a la DERECHA, fuera del área de dibujo, donde ambos
      // rótulos se anclan al último escalón (ver rotuloUltimoEscalon). Da para
      // "Meta 4%" / "1.234 kg" a 17px en dos líneas; en una sola pedía ~150px
      // y el eje X se quedaba sin ancho para mostrar todos los días.
      //
      // Estar fuera del área es lo que evita el solapamiento con los números de
      // ratio, que se dibujan encima de cada punto. Se intentó antes ponerlos
      // dentro y estimar en qué píxel cae cada ratio para esquivarlos: no
      // alcanzó, porque Recharts no expone la geometría real del área al
      // posicionar la etiqueta y la estimación erraba. Fuera del área no hay
      // nada que estimar: donde van no hay ratios.
      const MARGEN_META = 104;

      return (
        <ResponsiveContainer width="100%" height={370}>
          {/* El margen derecho reserva la franja donde vive el texto de la meta,
              fuera del área de dibujo. Ver MARGEN_META más abajo. */}
          <ComposedChart data={chartData} margin={{ top: 66, right: MARGEN_META, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 13, fill: "#64748b" }} minTickGap={16} />
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
              contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name, item) => {
                if (name === "ratioCumanaAcum")
                  return [`${Number(value ?? 0)}%`, "Ratio acumulado — Cumaná"];
                if (name === "ratioCabudareAcum")
                  return [`${Number(value ?? 0)}%`, "Ratio acumulado — Cabudare"];
                if (name === "promedioDia")
                  return [
                    `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg/día`,
                    "Promedio PAN 3M (cartera vigente ese día)",
                  ];
                if (name === "meta4PctDia")
                  return [
                    `${Number(value ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`,
                    "Meta 4% de ese día",
                  ];
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
                  : value === "promedioDia"
                  ? "Promedio PAN 3M (escalonado por tanda)"
                  : value === "meta4PctDia"
                  ? "Meta 4%"
                  : value === "ratioCumanaAcum"
                  ? "Ratio acum. — Cumaná"
                  : value === "ratioCabudareAcum"
                  ? "Ratio acum. — Cabudare"
                  : value
              }
              wrapperStyle={{ fontSize: 13 }}
            />
            {/* Indicador A: promedio diario de PAN VIGENTE cada día.

                Ya no es una ReferenceLine horizontal sino una línea ESCALONADA
                (`stepAfter`): el promedio cambia el día que entra cada tanda a
                la cartera, y una recta única mentía sobre el denominador que se
                usó en los días anteriores a la ampliación. El escalón deja ver
                exactamente cuándo y cuánto subió. */}
            {showPanDiario && (
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
                <LabelList
                  dataKey="promedioDia"
                  content={rotuloPromedio}
                />
              </Line>
            )}
            {/* Indicador B: 4% de ese promedio — la meta, también escalonada.

                El texto va FUERA del área de dibujo, en el margen derecho que
                reserva MARGEN_META. Antes iba dentro (abajo a la izquierda) y
                se solapaba con los números de ratio, que se dibujan encima de
                cada punto: bastaba un punto algo por debajo de la línea para
                que su número cayera sobre el texto. Fuera del área no hay
                ratios, así que el solapamiento deja de ser posible en vez de
                depender de una estimación.

                La etiqueta se ancla al ÚLTIMO escalón (el vigente hoy), que es
                el que queda a la altura del borde derecho. */}
            <Line
              yAxisId="kg"
              type="stepAfter"
              dataKey="meta4PctDia"
              stroke="#16a34a"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="meta4PctDia"
                content={rotuloMeta}
              />
            </Line>
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
              {/* Ratio del día: es el dato que se lee, así que va más grande y en
                  seminegrita — con 9px se perdía sobre la línea. */}
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
    loading: () => <div className="h-[370px] bg-slate-50 rounded-lg animate-pulse" />,
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
