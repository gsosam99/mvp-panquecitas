// Constantes de sectorización puras (sin dependencias de servidor/Supabase)
// para que puedan importarse también desde Client Components — ver
// src/lib/universe.ts, que las re-exporta junto con las queries que sí
// necesitan el cliente de Supabase (server-only).

export const CUMANA_SECTOR = "Cumaná" as const;
export const BARQUISIMETO_ESTE_SECTOR = "Barquisimeto Este" as const;

export const PILOT_SECTORS = [CUMANA_SECTOR, BARQUISIMETO_ESTE_SECTOR] as const;

const CUMANA_SECTOR_UPPER = "CUMANA"; // sin tilde: así llega en la cartera
const BARQUISIMETO_ESTE_SECTOR_UPPER = "BARQUISIMETO ESTE";

export type Sector = "cumana" | "barquisimeto_este";

export function sectorGroup(oficinaVenta: string | null | undefined): Sector | null {
  if (!oficinaVenta) return null;
  const upper = oficinaVenta.trim().toUpperCase();
  if (upper === CUMANA_SECTOR_UPPER) return "cumana";
  if (upper === BARQUISIMETO_ESTE_SECTOR_UPPER) return "barquisimeto_este";
  return null;
}

export const SECTOR_LABELS: Record<Sector, string> = {
  cumana: CUMANA_SECTOR,
  barquisimeto_este: BARQUISIMETO_ESTE_SECTOR,
};
