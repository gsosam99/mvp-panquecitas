// Bucketing de fechas en día / semana ISO / mes, con etiquetas legibles
// para ejes X de gráficos (nunca la clave cruda tipo "2026-W32"). Usado por
// dienn-queries.ts (Penetración/Recompra, Cobertura/Comunicación) y
// admin-metrics.ts (Clientes activados en el tiempo).

export type TimeGranularity = "day" | "week" | "month";

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Fecha de hoy en "YYYY-MM-DD" (UTC, igual que el resto de la app — ver
 * bcv.ts). Es la fecha de corte de todo lo que se muestra como "ahora mismo":
 * una tanda de clientes con fecha de incorporación futura no entra a las
 * tarjetas hasta que llega su día. Ver src/lib/cohortes.ts.
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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

/** Lunes de una clave de semana ISO ("YYYY-Www"), regla ISO 8601 (semana 1 = la del 4 de enero). */
function isoWeekMonday(bucket: string): Date {
  const [yyyyStr, wStr] = bucket.split("-W");
  const jan4 = new Date(Date.UTC(Number(yyyyStr), 0, 4));
  const jan4DayNr = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime() - jan4DayNr * 86400000);
  return new Date(week1Monday.getTime() + (Number(wStr) - 1) * 7 * 86400000);
}

/**
 * Último día que cubre un bucket, en "YYYY-MM-DD". Reconoce las cuatro formas
 * de clave que se usan en la app (día, semana ISO, mes y trimestre) por su
 * forma, así que no necesita que le pasen la granularidad.
 *
 * Sirve para el denominador de las series: "¿cuántos clientes había en la
 * cartera al CIERRE de este período?". Se usa el cierre y no el inicio a
 * propósito — un cliente incorporado a mitad de semana ya vendió durante esa
 * semana, así que tiene que estar también en el denominador de esa semana o
 * la tasa saldría inflada. Ver src/lib/cohortes.ts.
 */
export function bucketEndDate(bucket: string): string {
  // Día: "YYYY-MM-DD".
  if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) return bucket;

  // Semana ISO: "YYYY-Www" → domingo.
  if (/^\d{4}-W\d{2}$/.test(bucket)) {
    const sunday = new Date(isoWeekMonday(bucket).getTime() + 6 * 86400000);
    return sunday.toISOString().slice(0, 10);
  }

  // Trimestre: "YYYY-Qn" → último día del tercer mes.
  if (/^\d{4}-Q\d$/.test(bucket)) {
    const [yyyyStr, qStr] = bucket.split("-Q");
    const lastMonth = Number(qStr) * 3; // 1..4 → 3, 6, 9, 12
    return new Date(Date.UTC(Number(yyyyStr), lastMonth, 0)).toISOString().slice(0, 10);
  }

  // Mes: "YYYY-MM" → día 0 del mes siguiente = último día de este.
  if (/^\d{4}-\d{2}$/.test(bucket)) {
    const [yyyyStr, mmStr] = bucket.split("-");
    return new Date(Date.UTC(Number(yyyyStr), Number(mmStr), 0)).toISOString().slice(0, 10);
  }

  // Clave desconocida: no recortar nada es más seguro que recortar de más.
  return "9999-12-31";
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
  // Semana ISO ("YYYY-Www") → rango lunes-viernes (solo DÍAS HÁBILES; el
  // producto se vende de L–V, así que la semana se muestra 3–7, no 3–9).
  const monday = isoWeekMonday(bucket);
  const friday = new Date(monday.getTime() + 4 * 86400000);
  return `${shortDate(monday)} - ${shortDate(friday)}`;
}

// ── Día / Semana / Mes / Trimestre ────────────────────────────────
// Granularidad del comparativo Panquecitas vs Harina PAN (DIENN).
// Reutiliza day/week/month de TimeGranularity y añade trimestre.

export type PanComparisonGranularity = "day" | "week" | "month" | "quarter";

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
