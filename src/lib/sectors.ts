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

// Distribuidoras intermediarias que aparecieron en el reporte de Pedidos y
// Facturado (antes de que "Carga Radar"/"Pedidos y Facturado" dejaran de
// crear clientes nuevos) y quedaron guardadas en `locations` con una
// oficina_venta válida — pasan el filtro de sector pero NO son puntos de
// venta finales, solo ayudan a distribuir el producto a abastos/bodegas.
// Se excluyen aquí a nivel de código porque la limpieza en la base de datos
// no es suficiente por sí sola (si vuelven a aparecer en un reporte y se
// refrescan sus datos de cartera, la fila persiste). Nunca deben contar en
// el universo real del piloto ni recibir visitas de mercaderista/promotora.
// Ver conversación con Alejandro (07-08-2026) y Mariana Di Buongrazio (08-08-2026).
const EXCLUDED_DISTRIBUIDOR_SAP_CODES = new Set<string>([
  "22401504", // DISTRIBUIDORA LEOMAR, S.A
  "22401950", // DISTRIBUIDORA LA EXCELENCIA, C.A
  "22403639", // DISTRIBUIDORA D'AVALLGAR, C.A.
  "22405578", // DISTRIBUIDORA KATAO, C.A
  "22406035", // DISTRIBUIDORA ANTONELLI F&G, C.A
  // Franquiciadas del modelo indirecto de Cumaná, incorporado el 14-08-2026
  // (Alejandro, 21-08-2026). Mismo tratamiento que las de arriba: no son
  // población, solo se leen para lo facturado y lo pedido. Los PDV reales
  // que abastecen SÍ son cartera y se distinguen por los grupos vendedores
  // U27/U28 — ver COHORTES_NUEVAS en src/lib/cohortes.ts.
  "22401000", // COMERCIAL VELIZ SUCRE, C.A.
  "22403226", // KEYKA, C.A.
  "22403689", // DISTRIBUIDORA NURCARLYS, C.A.
  "22405444", // DISTRIBUIDORA RCY 85, C.A.
  "22405792", // INVERSIONES C.C., C.A.
]);

export function isExcludedDistribuidor(sapCode: string | null | undefined): boolean {
  return !!sapCode && EXCLUDED_DISTRIBUIDOR_SAP_CODES.has(sapCode.trim());
}
