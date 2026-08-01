export type UserRole = "ADMIN" | "MERCADERISTA" | "PROMOTORA" | "DIENN";
export type DashboardRole = "ADMIN" | "DIENN";
export type FieldRole = "MERCADERISTA" | "PROMOTORA";
export type LocationType = "SUPERMERCADO" | "ABASTO" | "BODEGA" | "OTRO";
export type VariantType = "UNIDAD" | "BULTO";
export type AuditZone = "BODEGA" | "ANAQUEL";

/** Identidad del personal de campo, resuelta contra el roster (field_workers) por cédula. */
export interface FieldWorker {
  role: FieldRole;
  firstName: string;
  lastName: string;
  cedula: string;
  oficinaVenta: string;
}

/** Fila del roster autorizado de personal de campo (ver field_workers). */
export interface FieldWorkerRecord {
  id: string;
  cedula: string;
  first_name: string;
  last_name: string;
  role: FieldRole;
  oficina_venta: string;
  active: boolean;
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface UserWithProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  sap_code: string;
  address: string | null;
  region: string | null;
  centro_poblado: string | null;
  municipio: string | null;
  tipo_cliente: string | null;
  oficina_venta: string | null;
  lat: number | null;
  lng: number | null;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
}

export interface Variant {
  id: string;
  product_id: string;
  name: string;
  type: VariantType;
  presentation_kg: number;
  units_per_bulk: number;
  product?: Product;
}

export interface SapSellInRecord {
  id: string;
  uploaded_by: string;
  upload_batch_id: string;
  location_id: string;
  product_id: string;
  quantity_kg: number;
  date_of_sale: string;
  location?: Location;
  product?: Product;
}

export type ProductLocationOption = "HARINA_TRIGO" | "OTRA_CATEGORIA";
export type PopMessageOption = "SIEMPRE_GANAS" | "ALIMENTA_IDEAS";
export type PopMaterialOption = "TENT_CARD" | "DANGLER" | "PRECIADOR" | "OTRO";

export interface MercaderistaVisit {
  id: string;
  created_at: string;
  worker_first_name: string;
  worker_last_name: string;
  worker_cedula: string;
  location_id: string;
  pop_present: boolean;
  pop_message: PopMessageOption | null;
  pop_price_tag: boolean | null;
  pop_materials: PopMaterialOption[] | null;
  pop_materials_other: string | null;
  product_present: boolean;
  product_location: ProductLocationOption[] | null;
  product_location_other: string | null;
  price_400: number | null;
  price_400_na: boolean;
  price_800: number | null;
  price_800_na: boolean;
  total_units_anaquel: number | null;
  front_faces: number | null;
  harina_trigo_faces: number | null;
  deposit_access: boolean;
  location?: Location;
}

export interface InventoryAudit {
  id: string;
  created_at: string;
  visit_id: string;
  location_id: string;
  variant_id: string;
  zone: AuditZone;
  quantity: number;
  unit_price_observed: number | null;
  calculated_value: number | null;
  location?: Location;
  variant?: Variant;
}

export interface PromotionActivity {
  id: string;
  created_at: string;
  worker_first_name: string;
  worker_last_name: string;
  worker_cedula: string;
  location_id: string;
  report_date: string;
  samples_given: number;
  conversions_tracked: number;
  location?: Location;
}

export interface ParsedSapRow {
  sap_code: string;
  client_name: string;
  client_type: LocationType;
  region: string;
  city: string;
  category: string;
  quantity_kg: number;
  date_of_sale: string;
}

export interface ParseError {
  row: number;
  field: string;
  message: string;
}

export interface SapParseResult {
  valid: ParsedSapRow[];
  errors: ParseError[];
}

export interface ParsedCarteraRow {
  sap_code: string;
  name: string;
  type: LocationType;
  tipo_cliente: string;
  oficina_venta: string;
  centro_poblado: string;
  municipio: string;
  region: string;
}

export interface CarteraParseResult {
  valid: ParsedCarteraRow[];
  errors: ParseError[];
}

export interface SapPendingOrder {
  id: string;
  created_at: string;
  upload_batch_id: string;
  location_id: string;
  product_id: string | null;
  quantity: number;
  order_date: string | null;
  notes: string | null;
  location?: Location;
}

export interface ParsedPendingOrderRow {
  sap_code: string;
  quantity: number;
  order_date: string | null;
  notes?: string;
}

export interface PendingOrdersParseResult {
  valid: ParsedPendingOrderRow[];
  errors: ParseError[];
}

export interface KpiData {
  panSellInKg: number;
  panquecitasSellInKg: number;
  relativePct: number;
  panquecitasInventoryKg: number;
  promotoraSamples: number;
  promotoraConversions: number;
  conversionRate: number;
}
