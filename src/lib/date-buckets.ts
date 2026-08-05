// Bucketing de fechas en día / semana ISO / mes, con etiquetas legibles
// para ejes X de gráficos (nunca la clave cruda tipo "2026-W32"). Usado por
// dienn-queries.ts (Penetración/Recompra, Cobertura/Comunicación) y
// admin-metrics.ts (Clientes activados en el tiempo).

export type TimeGranularity = "day" | "week" | "month";

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const target = new Date(d.getTime());
  const dayNr = (d.getUTCDay() + 6) % 7; // lunes=0 .. domingo=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // jueves de esa semana
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNr =
    1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNr).padStart(2, "0")}`;
}

/** Clave de bucket — también sirve como clave de orden cronológico (comparación de strings). */
export function bucketKeyFor(dateStr: string, granularity: TimeGranularity): string {
  if (granularity === "day") return dateStr;
  if (granularity === "month") return dateStr.slice(0, 7);
  return isoWeekKey(dateStr);
}

function shortDate(d: Date): string {
  return `${d.getUTCDate()} ${MESES_ES[d.getUTCMonth()].slice(0, 3)}`;
}

/** Etiqueta legible para el eje X — nunca la clave cruda ("2026-W32"). */
export function bucketLabelFor(bucket: string, granularity: TimeGranularity): string {
  if (granularity === "day") {
    return shortDate(new Date(bucket + "T00:00:00Z"));
  }
  if (granularity === "month") {
    const mes = MESES_ES[Number(bucket.slice(5, 7)) - 1];
    return mes.charAt(0).toUpperCase() + mes.slice(1);
  }
  // Semana ISO ("YYYY-Www") → rango lunes-domingo. El lunes de la semana 1
  // es el lunes de la semana que contiene el 4 de enero (regla ISO 8601).
  const [yyyyStr, wStr] = bucket.split("-W");
  const jan4 = new Date(Date.UTC(Number(yyyyStr), 0, 4));
  const jan4DayNr = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime() - jan4DayNr * 86400000);
  const monday = new Date(week1Monday.getTime() + (Number(wStr) - 1) * 7 * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return `${shortDate(monday)} - ${shortDate(sunday)}`;
}

// ── Día / Mes / Trimestre ────────────────────────────────────────
// Granularidad separada de TimeGranularity (que es día/semana/mes, sin
// trimestre) para no tocar los gráficos que ya dependen de esa unión de 3
// valores — usada solo por el comparativo Panquecitas vs Harina PAN de
// DIENN, que pidió específicamente día/mes/trimestre (sin semana).

export type PanComparisonGranularity = "day" | "month" | "quarter";

function quarterKeyFor(dateStr: string): string {
  const [yyyy, mm] = dateStr.split("-");
  const q = Math.ceil(Number(mm) / 3);
  return `${yyyy}-Q${q}`;
}

function quarterLabelFor(bucket: string): string {
  const [yyyy, qStr] = bucket.split("-Q");
  return `T${qStr} ${yyyy}`;
}

export function panBucketKeyFor(dateStr: string, granularity: PanComparisonGranularity): string {
  if (granularity === "quarter") return quarterKeyFor(dateStr);
  return bucketKeyFor(dateStr, granularity);
}

export function panBucketLabelFor(bucket: string, granularity: PanComparisonGranularity): string {
  if (granularity === "quarter") return quarterLabelFor(bucket);
  return bucketLabelFor(bucket, granularity);
}
