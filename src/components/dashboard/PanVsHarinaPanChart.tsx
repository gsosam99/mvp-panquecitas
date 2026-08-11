"use client";

import dynamic from "next/dynamic";
import type { PanVsHarinaPanPoint } from "@/lib/dienn-queries";

function formatKg(value: number): string {
  return `${value.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
}

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = await import(
      "recharts"
    );

    function PanVsHarinaPanInner({ data }: { data: PanVsHarinaPanPoint[] }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              width={70}
              tickFormatter={(v) => Number(v).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => [
                formatKg(Number(value ?? 0)),
                name === "panquecitasKg" ? "Panquecitas" : "Harina PAN",
              ]}
            />
            <Legend
              formatter={(value: string) => (value === "panquecitasKg" ? "Panquecitas" : "Harina PAN")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line type="monotone" dataKey="panquecitasKg" stroke="#1a65bd" strokeWidth={2} dot={{ r: 3, fill: "#1a65bd" }} />
            <Line type="monotone" dataKey="harinaPanKg" stroke="#b45309" strokeWidth={2} dot={{ r: 3, fill: "#b45309" }} />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return PanVsHarinaPanInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[300px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function PanVsHarinaPanChart({ data }: { data: PanVsHarinaPanPoint[] }) {
  return (
    <div>
      <Inner data={data} />
      {/* Fórmula/cálculo del ratio que genera la gráfica (pedido explícito). */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="font-semibold">Ratio Panquecitas / HPM</span> ={" "}
        <span className="font-mono">Σ Radar Panquecitas ÷ Σ Radar Harina PAN</span> (por período). ·{" "}
        <span className="font-semibold">Clientes</span>: solo compradores de Panquecitas (Radar &gt; 0). ·{" "}
        <span className="font-semibold">Universo</span>: los 358 clientes del piloto, hayan comprado o no.
      </div>
    </div>
  );
}
