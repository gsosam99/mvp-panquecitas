"use client";

import dynamic from "next/dynamic";
import type { CoberturaComunicacionPoint, TimeGranularity } from "@/lib/dienn-queries";
import type { Sector } from "@/lib/sectors";
import { CAMPAIGN_WEEKS, roundForBucket, type CampaignWeek } from "@/lib/campaign-weeks";

const SECTOR_COLORS: Record<Sector, { bar: string; dot: string }> = {
  cumana: { bar: "#1a65bd", dot: "#0f3d75" },
  barquisimeto_este: { bar: "#f5c400", dot: "#8a6d00" },
};
const SECTOR_LABELS_ES: Record<Sector, string> = {
  cumana: "Cumaná",
  barquisimeto_este: "Barquisimeto Este",
};

interface RoundBand {
  week: CampaignWeek;
  x1: string;
  x2: string;
}

// A granularidad "month" varias rondas pueden compartir el mismo bucket
// (S2 y S4 caen ambas en "2026-08"), así que ahí no se puede marcar la
// ronda sin ambigüedad — se omiten las bandas en esa vista (ver
// roundForBucket en campaign-weeks.ts).
function roundBandsFor(data: CoberturaComunicacionPoint[], granularity: TimeGranularity): RoundBand[] {
  if (granularity === "month") return [];
  const bands: RoundBand[] = [];
  for (const week of CAMPAIGN_WEEKS) {
    const matches = data.filter((d) => roundForBucket(d.bucket, granularity)?.label === week.label);
    if (matches.length === 0) continue;
    bands.push({ week, x1: matches[0].label, x2: matches[matches.length - 1].label });
  }
  return bands;
}

const Inner = dynamic(
  async () => {
    const {
      ResponsiveContainer,
      ComposedChart,
      Bar,
      Scatter,
      XAxis,
      YAxis,
      CartesianGrid,
      Tooltip,
      Legend,
      ReferenceArea,
    } = await import("recharts");

    function CoberturaComunicacionInner({
      data,
      sectors,
      granularity,
    }: {
      data: CoberturaComunicacionPoint[];
      sectors: Sector[];
      granularity: TimeGranularity;
    }) {
      const bands = roundBandsFor(data, granularity);

      return (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            {bands.map((band) => (
              <ReferenceArea
                key={band.week.label}
                x1={band.x1}
                x2={band.x2}
                fill={band.week.color}
                fillOpacity={0.12}
                stroke={band.week.color}
                strokeOpacity={0.4}
                ifOverflow="visible"
                label={{ value: band.week.label, position: "insideTop", fill: band.week.color, fontSize: 11, fontWeight: 600 }}
              />
            ))}
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis hide tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" width={44} />
            <Tooltip
              content={(props: { active?: boolean; label?: unknown; payload?: readonly unknown[] }) => {
                if (!props.active || !props.payload || props.payload.length === 0) return null;
                // Solo entradas con valor NUMÉRICO (así se eliminan por completo
                // los dos textos "label"/"NaN%" que metía el tooltip por defecto).
                const items = props.payload
                  .map((raw) => raw as { name?: string; value?: unknown; color?: string })
                  .filter((p) => typeof p.value === "number" && Number.isFinite(p.value));
                if (items.length === 0) return null;
                return (
                  <div style={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", padding: "6px 10px" }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{String(props.label ?? "")}</div>
                    {items.map((p, i) => (
                      <div key={i} style={{ color: p.color }}>
                        {p.name}: {Number(p.value).toLocaleString("es-VE", { maximumFractionDigits: 1 })}%
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {sectors.map((s) => (
              <Bar
                key={`${s}_cobertura`}
                dataKey={`${s}_cobertura`}
                name={`Cobertura — ${SECTOR_LABELS_ES[s]}`}
                fill={SECTOR_COLORS[s].bar}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            ))}
            {sectors.map((s) => (
              <Scatter
                key={`${s}_comunicacion`}
                dataKey={`${s}_comunicacion`}
                name={`Comunicación (POP) — ${SECTOR_LABELS_ES[s]}`}
                fill={SECTOR_COLORS[s].dot}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return CoberturaComunicacionInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[280px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function CoberturaComunicacionChart({
  data,
  sectors,
  granularity,
}: {
  data: CoberturaComunicacionPoint[];
  sectors: Sector[];
  granularity: TimeGranularity;
}) {
  return <Inner data={data} sectors={sectors} granularity={granularity} />;
}
