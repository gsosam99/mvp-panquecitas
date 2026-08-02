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

// Mapeo de "Categoria de productos (N)" del SAP → product_id
// Cuando se conozca el tag de Panquecitas en SAP, agregar aquí.
export const SAP_CATEGORY_MAP: Record<string, string> = {
  "Harina de Maíz": PRODUCT_IDS.HARINA_PAN,
  // "TAG_PANQUECITAS": PRODUCT_IDS.PANQUECITAS,  ← agregar cuando esté disponible
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
