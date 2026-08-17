"use client";

import dynamic from "next/dynamic";
import type { PrecioCorrectoRow, EstadoPrecio } from "@/lib/dienn-queries";

// Colores por dirección de desviación (compartidos entre ambas vistas).
const ESTADO_COLOR: Record<EstadoPrecio, string> = {
  SUBPRECIO: "#f59e0b", // ámbar: por debajo del objetivo
  CORRECTO: "#16a34a", // verde: dentro de la tolerancia
  SOBREPRECIO: "#dc2626", // rojo: por encima del objetivo
};
const ESTADO_LABEL: Record<EstadoPrecio, string> = {
  SUBPRECIO: "Subprecio",
  CORRECTO: "Correcto",
  SOBREPRECIO: "Sobreprecio",
};
const ESTADOS: EstadoPrecio[] = ["SUBPRECIO", "CORRECTO", "SOBREPRECIO"];

function formatUsd(v: number): string {
  return `$${v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const Inner = dynamic(
  async () => {
    const {
      ResponsiveContainer,
      BarChart,
      Bar,
      ScatterChart,
      Scatter,
      XAxis,
      YAxis,
      CartesianGrid,
      Tooltip,
      Legend,
      LabelList,
    } = await import("recharts");

    function PrecioCorrectoInner({ rows, vista }: { rows: PrecioCorrectoRow[]; vista: "A" | "B" }) {
      // ── Vista A: conteo por ciudad × dirección de desviación (barras apiladas) ──
      if (vista === "A") {
        const porCiudad = new Map<string, Record<EstadoPrecio, number>>();
        for (const r of rows) {
          if (!porCiudad.has(r.ciudad)) porCiudad.set(r.ciudad, { SUBPRECIO: 0, CORRECTO: 0, SOBREPRECIO: 0 });
          porCiudad.get(r.ciudad)![r.estado] += 1;
        }
        const data = Array.from(porCiudad.entries())
          .map(([ciudad, c]) => ({ ciudad, ...c }))
          .sort((a, b) => a.ciudad.localeCompare(b.ciudad));

        return (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="ciudad" tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={36} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                formatter={(value, name) => [`${Number(value ?? 0)} PDV`, ESTADO_LABEL[name as EstadoPrecio] ?? name]}
              />
              <Legend formatter={(value: string) => ESTADO_LABEL[value as EstadoPrecio] ?? value} wrapperStyle={{ fontSize: 12 }} />
              {ESTADOS.map((estado) => (
                <Bar key={estado} dataKey={estado} stackId="p" fill={ESTADO_COLOR[estado]} maxBarSize={90}>
                  <LabelList
                    dataKey={estado}
                    position="center"
                    fill="#ffffff"
                    fontSize={10}
                    formatter={(v) => (Number(v ?? 0) > 0 ? String(Number(v ?? 0)) : "")}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      }

      // ── Vista B: precios exactos reportados (scatter: precio por presentación) ──
      // Una serie por dirección, para que el color/leyenda expliquen la desviación.
      const porEstado = new Map<EstadoPrecio, PrecioCorrectoRow[]>();
      for (const r of rows) {
        if (!porEstado.has(r.estado)) porEstado.set(r.estado, []);
        porEstado.get(r.estado)!.push(r);
      }

      return (
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 16, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              type="category"
              dataKey="presentacion"
              allowDuplicatedCategory={false}
              tick={{ fontSize: 12, fill: "#64748b" }}
            />
            <YAxis
              type="number"
              dataKey="precio"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              width={48}
              tickFormatter={(v) => formatUsd(Number(v))}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as PrecioCorrectoRow | undefined;
                if (!p) return null;
                return (
                  <div style={{ fontSize: 12, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
                    <div style={{ fontWeight: 600 }}>{p.cliente}</div>
                    <div style={{ color: "#64748b" }}>
                      {p.ciudad} · {p.presentacion}
                    </div>
                    <div>
                      Precio: <b>{formatUsd(p.precio)}</b> · Objetivo: {formatUsd(p.target)}
                    </div>
                    <div style={{ color: ESTADO_COLOR[p.estado], fontWeight: 600 }}>{ESTADO_LABEL[p.estado]}</div>
                  </div>
                );
              }}
            />
            <Legend
              payload={ESTADOS.map((e) => ({ value: ESTADO_LABEL[e], type: "circle", id: e, color: ESTADO_COLOR[e] }))}
              wrapperStyle={{ fontSize: 12 }}
            />
            {ESTADOS.map((estado) => (
              <Scatter key={estado} name={ESTADO_LABEL[estado]} data={porEstado.get(estado) ?? []} fill={ESTADO_COLOR[estado]} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    return PrecioCorrectoInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[340px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function PrecioCorrectoChart({ rows, vista }: { rows: PrecioCorrectoRow[]; vista: "A" | "B" }) {
  return <Inner rows={rows} vista={vista} />;
}
