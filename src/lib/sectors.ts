// Constantes de sectorización puras (sin dependencias de servidor/Supabase)
// para que puedan importarse también desde Client Components — ver
// src/lib/universe.ts, que las re-exporta junto con las queries que sí
// necesitan el cliente de Supabase (server-only).

export const CUMANA_SECTOR = "Cumaná" as const;
export const BARQUISIMETO_ESTE_SECTOR = "Barquisimeto Este" as const;

export const PILOT_SECTORS = [CUMANA_SECTOR, BARQUISIMETO_ESTE_SECTOR] as const;

export type Sector = "cumana" | "barquisimeto_este";

// Rango Unicode de marcas diacríticas combinantes (para quitar tildes tras
// normalize("NFD")) — mismo enfoque que normalizeHeader() en excel-parser.ts.
const DIACRITICS_RE = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

function foldSector(value: string): string {
  return value.trim().toUpperCase().normalize("NFD").replace(DIACRITICS_RE, "");
}

// Comparación sin tildes ni espacios: la cartera trae "CUMANA" (sin tilde),
// pero el roster de personal (field_workers, cargado a mano desde Admin) o
// cargas futuras pueden traer "Cumaná"/"CUMANÁ" — deben resolver al mismo
// sector. Bug real detectado: con comparación exacta, un trabajador con
// oficina_venta="Cumaná" nunca hacía match contra "CUMANA" y no veía PDVs.
const CUMANA_SECTOR_FOLDED = foldSector("CUMANA");
const BARQUISIMETO_ESTE_SECTOR_FOLDED = foldSector("BARQUISIMETO ESTE");

export function sectorGroup(oficinaVenta: string | null | undefined): Sector | null {
  if (!oficinaVenta) return null;
  const folded = foldSector(oficinaVenta);
  if (folded === CUMANA_SECTOR_FOLDED) return "cumana";
  if (folded === BARQUISIMETO_ESTE_SECTOR_FOLDED) return "barquisimeto_este";
  return null;
}

export const SECTOR_LABELS: Record<Sector, string> = {
  cumana: CUMANA_SECTOR,
  barquisimeto_este: BARQUISIMETO_ESTE_SECTOR,
};
