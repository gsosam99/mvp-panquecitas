// Rondas de visita de mercaderistas — fechas fijas dadas por el negocio
// (ver "Arreglos app Panquecitas" §Perfil DIENN, punto 7.a). Se usan para
// el motor de Sell-Out: para cada cliente, "la visita de la ronda N" es su
// visita de mercaderista más reciente cuya fecha caiga dentro de esa
// ventana — si no hay ninguna, esa ronda queda sin dato para ese cliente
// (no se inventa). Ver src/lib/sellout-queries.ts.

export interface VisitRound {
  label: string;
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

export const VISIT_ROUNDS: VisitRound[] = [
  { label: "Ronda 1", start: "2026-08-10", end: "2026-08-14" },
  { label: "Ronda 2", start: "2026-08-24", end: "2026-08-28" },
  { label: "Ronda 3", start: "2026-09-07", end: "2026-09-11" },
  { label: "Ronda 4", start: "2026-09-21", end: "2026-09-25" },
];
