import { CAMPAIGN_WEEKS } from "@/lib/campaign-weeks";

const MESES_ABR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function rangeLabel(start: string, end: string): string {
  const [, startMonth, startDay] = start.split("-");
  const [, endMonth, endDay] = end.split("-");
  const startDayNum = String(Number(startDay));
  const endDayNum = String(Number(endDay));
  if (startMonth === endMonth) {
    return `${startDayNum}-${endDayNum} ${MESES_ABR[Number(startMonth) - 1]}`;
  }
  return `${startDayNum} ${MESES_ABR[Number(startMonth) - 1]} - ${endDayNum} ${MESES_ABR[Number(endMonth) - 1]}`;
}

/** Tags de color por ronda de auditoría (S2/S4/S6/S8) — mismo color en todos los gráficos que las usan. */
export function RoundLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {CAMPAIGN_WEEKS.map((w) => (
        <span key={w.label} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: w.color }} />
          <span className="font-medium text-slate-600">{w.label}</span>
          <span>{rangeLabel(w.start, w.end)}</span>
        </span>
      ))}
    </div>
  );
}
