"use client";

import dynamic from "next/dynamic";
import type { RankingSegmentoRow } from "@/lib/dienn-queries";

// Ranking de volumen por segmento de cartera (punto 2 del documento de cambios).
//
// Dos paneles de barras HORIZONTALES con eje de categorías vertical, lado a
// lado y en el mismo orden: a la izquierda el volumen (la métrica que ordena el
// ranking, de mayor a menor) y a la derecha el promedio de ventas diarias por
// cliente de ese mismo segmento.
//
// Las filas de ambos paneles calzan porque comparten datos, alto y márgenes; el
// panel derecho no repite los nombres de segmento (reserva el eje sin dibujar
// los rótulos) para no duplicar la lectura.

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } =
      await import("recharts");

    function Panel({
      data,
      dataKey,
      fill,
      labelFill,
      mostrarSegmentos,
      formatLabel,
      tooltipLabel,
      height,
    }: {
      data: RankingSegmentoRow[];
      dataKey: "volumenKg" | "promedioDiarioPorCliente";
      fill: string;
      labelFill: string;
      mostrarSegmentos: boolean;
      formatLabel: (v: number) => string;
      tooltipLabel: string;
      height: number;
    }) {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 72, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="segmento"
              width={mostrarSegmentos ? 150 : 8}
              tick={mostrarSegmentos ? { fontSize: 11, fill: "#475569" } : false}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value) => [formatLabel(Number(value ?? 0)), tooltipLabel]}
            />
            <Bar dataKey={dataKey} fill={fill} radius={[0, 3, 3, 0]}>
              <LabelList
                dataKey={dataKey}
                position="right"
                offset={8}
                fill={labelFill}
                fontSize={10}
                formatter={(v) => formatLabel(Number(v ?? 0))}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    function RankingSegmentoInner({ data }: { data: RankingSegmentoRow[] }) {
      // Alto proporcional a la cantidad de segmentos; el mismo para los dos
      // paneles, que es lo que mantiene las filas alineadas.
      const height = Math.max(240, data.length * 42 + 40);

      return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Volumen de Panquecitas (kg)
            </p>
            <Panel
              data={data}
              dataKey="volumenKg"
              fill="#3e7cb1"
              labelFill="#1f4e79"
              mostrarSegmentos
              height={height}
              tooltipLabel="Volumen Radar"
              formatLabel={(v) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`}
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Promedio diario por cliente (kg)
            </p>
            <Panel
              data={data}
              dataKey="promedioDiarioPorCliente"
              fill="#b4d0e7"
              labelFill="#1f4e79"
              mostrarSegmentos={false}
              height={height}
              tooltipLabel="Prom. diario por cliente"
              formatLabel={(v) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 2 })} kg`}
            />
          </div>
        </div>
      );
    }

    return RankingSegmentoInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[240px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function RankingSegmentoChart({ data }: { data: RankingSegmentoRow[] }) {
  return <Inner data={data} />;
}
