import { isoWeekKey, type TimeGranularity } from "@/lib/date-buckets";

// Rondas de auditoría del piloto (lunes a viernes, inclusive) — calendario
// fijo dado por Alejandro (chat 05/06-08-2026), no semanas ISO. Un registro
// de mercaderista (mercaderista_visits.created_at) cae en la ronda cuya
// ventana de fecha lo contiene. Colores fijos para que la misma ronda se
// vea igual en todos los gráficos que la usan: Admin (Ejecución semanal,
// Riesgo de stock-out) y DIENN (Cobertura y Comunicación).
export interface CampaignWeek {
  label: string;
  start: string;
  end: string;
  color: string;
}

export const CAMPAIGN_WEEKS: CampaignWeek[] = [
  { label: "S2", start: "2026-08-10", end: "2026-08-14", color: "#0ea5e9" },
  { label: "S4", start: "2026-08-24", end: "2026-08-28", color: "#10b981" },
  { label: "S6", start: "2026-09-07", end: "2026-09-11", color: "#f97316" },
  { label: "S8", start: "2026-09-21", end: "2026-09-25", color: "#8b5cf6" },
];

/** Ronda a la que pertenece una fecha ("YYYY-MM-DD"), o null si cae fuera de las 4 ventanas. */
export function roundForDate(dateStr: string): CampaignWeek | null {
  return CAMPAIGN_WEEKS.find((w) => dateStr >= w.start && dateStr <= w.end) ?? null;
}

/**
 * Ronda a la que pertenece un bucket de gráfico (clave de date-buckets.ts)
 * según su granularidad. El rango lunes-viernes de cada ronda siempre cae
 * dentro de una sola semana ISO, así que a granularidad "week" alcanza con
 * comparar la clave de semana del lunes de la ronda. A granularidad
 * "month" dos rondas pueden compartir el mismo bucket (S2 y S4 caen ambas
 * en "2026-08") — se devuelve la primera que calce, así que a esa
 * granularidad la distinción por ronda no es exacta (ver CoberturaComunicacionChart,
 * que por eso no dibuja bandas de ronda en vista mensual).
 */
export function roundForBucket(bucket: string, granularity: TimeGranularity): CampaignWeek | null {
  if (granularity === "day") return roundForDate(bucket);
  if (granularity === "month") {
    return CAMPAIGN_WEEKS.find((w) => w.start.slice(0, 7) === bucket || w.end.slice(0, 7) === bucket) ?? null;
  }
  return CAMPAIGN_WEEKS.find((w) => isoWeekKey(w.start) === bucket) ?? null;
}
