// IDs fijos del seed — sincronizados con supabase/schema.sql migración 02_seed_data

export const PRODUCT_IDS = {
  HARINA_PAN: "00000000-0000-0000-0000-000000000001",
  PANQUECITAS: "00000000-0000-0000-0000-000000000002",
} as const;

export const VARIANT_IDS = {
  PAN_1KG_BULTO:  "10000000-0000-0000-0000-000000000001",
  PAN_2KG_BULTO:  "10000000-0000-0000-0000-000000000002",
  PAN_1KG_UNIDAD: "10000000-0000-0000-0000-000000000003",
  PAN_2KG_UNIDAD: "10000000-0000-0000-0000-000000000004",
  PANQ_04KG_BULTO:  "20000000-0000-0000-0000-000000000001",
  PANQ_08KG_BULTO:  "20000000-0000-0000-0000-000000000002",
  PANQ_04KG_UNIDAD: "20000000-0000-0000-0000-000000000003",
  PANQ_08KG_UNIDAD: "20000000-0000-0000-0000-000000000004",
} as const;

// Variantes de Panquecitas disponibles para auditoría en campo
export const PANQUECITAS_FIELD_VARIANTS = [
  {
    id: VARIANT_IDS.PANQ_04KG_BULTO,
    name: "Panquecitas 0.4kg",
    subtitle: "Bulto × 16 unidades",
    presentation_kg: 0.4,
    units_per_bulk: 16,
  },
  {
    id: VARIANT_IDS.PANQ_08KG_BULTO,
    name: "Panquecitas 0.8kg",
    subtitle: "Bulto × 12 unidades",
    presentation_kg: 0.8,
    units_per_bulk: 12,
  },
  {
    id: VARIANT_IDS.PANQ_04KG_UNIDAD,
    name: "Panquecitas 0.4kg",
    subtitle: "Unidad suelta",
    presentation_kg: 0.4,
    units_per_bulk: 1,
  },
  {
    id: VARIANT_IDS.PANQ_08KG_UNIDAD,
    name: "Panquecitas 0.8kg",
    subtitle: "Unidad suelta",
    presentation_kg: 0.8,
    units_per_bulk: 1,
  },
] as const;

// Mapeo de "Material" (código SKU, ej. "H187", "Q147") del reporte "Radar"
// SAP (Harina PAN y Panquecitas, ver src/lib/sap-mhtml-parser.ts →
// parseSapRadarMhtml) → product_id. Un solo parser cubre ambos archivos
// (Radar HPM.xls / Radar panquecitas.xls) porque el producto se resuelve
// por código de material, no por nombre de archivo. A diferencia de
// SAP_MATERIAL_PRODUCT_MAP (reporte de Pedido/Facturado), estos códigos NO
// traen el prefijo "CR/". Agregar aquí los códigos nuevos que aparezcan —
// un material no listado se reporta como error en vez de asumir un
// producto por defecto.
export const SAP_RADAR_MATERIAL_PRODUCT_MAP: Record<string, string> = {
  "H187": PRODUCT_IDS.HARINA_PAN, // PAN HPM BLANCO GLUTEN FREE 1KGX20UN VE
  "H439": PRODUCT_IDS.HARINA_PAN, // PAN HARINA MAIZ GF 2KGx9UNID BOPP
  "Q147": PRODUCT_IDS.PANQUECITAS, // PRIMOR MEZCLA DE HARINAS BOLSA 400Gx16UN
  "Q148": PRODUCT_IDS.PANQUECITAS, // PRIMOR MEZCLA DE HARINAS BOLSA 800Gx12UN
};

// Misma tabla de materiales del Radar, pero a nivel de presentación —
// alimenta el Mix de Producto de DIENN. Harina PAN no distingue
// presentación (queda sin variant_id, a nivel de producto).
export const SAP_RADAR_MATERIAL_VARIANT_MAP: Record<string, string> = {
  "Q147": VARIANT_IDS.PANQ_04KG_UNIDAD,
  "Q148": VARIANT_IDS.PANQ_08KG_UNIDAD,
};

// Mapeo de "Material" (código SKU, ej. "CR/Q147") del reporte SAP
// N7_V_SD83_WEB_001 (Pedido/Entregado/Facturado) → product_id. A diferencia
// de SAP_CATEGORY_MAP, ese reporte no trae una columna de categoría por
// fila (viene fija como filtro del query, "Categoria de Productos:
// Panquecas") así que el producto se resuelve por código de material.
// Agregar aquí los códigos nuevos que aparezcan — un material no listado
// se reporta como error en vez de asumir un producto por defecto.
export const SAP_MATERIAL_PRODUCT_MAP: Record<string, string> = {
  "CR/Q147": PRODUCT_IDS.PANQUECITAS, // PRIMOR MEZCLA DE HARINAS BOLSA 400Gx16UN
  "CR/Q148": PRODUCT_IDS.PANQUECITAS, // PRIMOR MEZCLA DE HARINAS BOLSA 800Gx12UN
};

// Misma tabla de materiales, pero a nivel de presentación: alimenta el
// Mix de Producto de DIENN (cantidad facturada 400g vs 800g). Se usa la
// variante UNIDAD porque el reporte ya viene en kg, no en bultos.
export const SAP_MATERIAL_VARIANT_MAP: Record<string, string> = {
  "CR/Q147": VARIANT_IDS.PANQ_04KG_UNIDAD,
  "CR/Q148": VARIANT_IDS.PANQ_08KG_UNIDAD,
};

// Heurística para resolver el SKU/presentación de un despacho o Sell-Out
// reportado (columna libre, formato SAP aún no confirmado) a un variant_id
// de Panquecitas. Se usa la variante "UNIDAD" de cada presentación porque
// despachos/facturas normalmente vienen en unidades, no en bultos — ajustar
// si el reporte real trae otra unidad de medida. Retorna null si el SKU no
// menciona la presentación (el despacho queda a nivel de producto, sin
// desglose 400g/800g).
export function resolveVariantFromSku(sku: string | null | undefined): string | null {
  if (!sku) return null;
  const normalized = sku.replace(/[.,]/g, "").toUpperCase();
  if (normalized.includes("400")) return VARIANT_IDS.PANQ_04KG_UNIDAD;
  if (normalized.includes("800")) return VARIANT_IDS.PANQ_08KG_UNIDAD;
  return null;
}
