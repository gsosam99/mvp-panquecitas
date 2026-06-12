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

// Nombre de variante SAP → ID (para el parser de Excel)
export const SAP_VARIANT_NAME_MAP: Record<string, string> = {
  "PAN 1KG BULTO":  VARIANT_IDS.PAN_1KG_BULTO,
  "PAN 2KG BULTO":  VARIANT_IDS.PAN_2KG_BULTO,
  "PAN 1KG UNIDAD": VARIANT_IDS.PAN_1KG_UNIDAD,
  "PAN 2KG UNIDAD": VARIANT_IDS.PAN_2KG_UNIDAD,
  "PANQUECITAS 0.4KG BULTO":  VARIANT_IDS.PANQ_04KG_BULTO,
  "PANQUECITAS 0.8KG BULTO":  VARIANT_IDS.PANQ_08KG_BULTO,
  "PANQUECITAS 0.4KG UNIDAD": VARIANT_IDS.PANQ_04KG_UNIDAD,
  "PANQUECITAS 0.8KG UNIDAD": VARIANT_IDS.PANQ_08KG_UNIDAD,
};
