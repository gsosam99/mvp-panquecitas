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
  /** Segmentación de cartera ("Segmento de Clientes 2"), distinta de tipo_cliente. */
  segmento_cliente: string | null;
  oficina_venta: string | null;
  /** Grupo vendedor de SAP (ej. U29, U30) — subdivisión dentro de la oficina. */
  grupo_vendedor: string | null;
  /** Esquema de Atención de SAP (Directo / Mixto / Indirecto). */
  esquema_atencion: string | null;
  /** Plan de visita: días ISO programados separados por coma (1=Lun..7=Dom), ej "1,3,5". */
  dias_visita: string | null;
  /** Zona de Ventas de SAP (ej. V07N01, V44N02). */
  zona_venta: string | null;
  asesor_encargado: string | null;
  fuente_sell_out: FuenteSellOut;
  lat: number | null;
  lng: number | null;
}

export type FuenteSellOut = "Calculado" | "Reportado_B2B";

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
  anaquel_400_units: number | null;
  anaquel_800_units: number | null;
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
  tickets_entregados: number;
  tickets_recibidos: number;
  tickets_intactos: number;
  location?: Location;
}

/** Tamaño fijo del rollo de tickets que porta cada promotora por jornada. */
export const TICKETS_PER_ROLL = 80;

export interface ParseError {
  row: number;
  field: string;
  message: string;
}

// ════════════════════════════════════════════════════════════════
// Reporte "Radar" SAP (Harina PAN y Panquecitas) — export MHTML de SAP BW
// (mismo mecanismo que el reporte de Pedido/Facturado más abajo), pero con
// un solo ratio: "Venta Acumulada" (KG) — el acumulado real DESPACHADO en
// lo que va del mes para ese cliente + material. "fecha" es el corte del
// acumulado, no una venta puntual de ese día. El código de material
// determina el producto (Harina PAN o Panquecitas) — ver
// SAP_RADAR_MATERIAL_PRODUCT_MAP en catalog.ts. Ver src/lib/sap-mhtml-parser.ts.
// ════════════════════════════════════════════════════════════════

export interface ParsedSapRadarRow {
  sap_code: string;
  client_name: string;
  tipo_cliente: string;
  esquema_atencion: string;
  grupo_vendedor: string;
  region: string;
  oficina_venta: string;
  zona_venta: string;
  material_code: string;
  material_name: string;
  fecha: string;
  quantity_kg: number;
}

export interface SapRadarParseResult {
  valid: ParsedSapRadarRow[];
  errors: ParseError[];
  // TODAS las fechas distintas con venta Radar por cliente+material (no solo el
  // último corte de `valid`). Alimenta la tasa de recompra (≥2 fechas del mismo
  // cliente). Ver tabla radar_ventas_fechas. Opcional: los returns de error
  // temprano no lo traen.
  fechas?: { sap_code: string; material_code: string; fecha: string }[];
  // TODAS las filas del archivo SIN colapsar, con su kg y su fecha. `valid` se
  // queda con el último corte por cliente+material, que sirve para el acumulado
  // del MES en curso pero pierde los meses anteriores — inservible para un
  // reporte de varios meses. La carga "Radar últimos 3 Meses" usa esto para
  // poder sumar el acumulado de cada mes. Opcional: los returns de error
  // temprano no lo traen.
  filas?: ParsedSapRadarRow[];
}

// ════════════════════════════════════════════════════════════════
// Reporte SAP N7_V_SD83_WEB_001 (Cantidad Pedido/Entregada/Facturada) —
// export "Web Page, Single File" de SAP BW (MHTML con extensión .xls, no
// un binario Excel real). Una sola fila trae tanto lo ya facturado como lo
// pedido, así que una sola carga alimenta sap_sell_in_records (facturado)
// y sap_pending_orders (pedido menos facturado). Ver src/lib/sap-mhtml-parser.ts.
// ════════════════════════════════════════════════════════════════

export interface ParsedSapFacturacionRow {
  sap_code: string;
  client_name: string;
  tipo_cliente: string;
  esquema_atencion: string;
  grupo_vendedor: string;
  region: string;
  oficina_venta: string;
  zona_venta: string;
  material_code: string;
  material_name: string;
  fecha: string;
  cantidad_pedido_kg: number;
  cantidad_facturada_kg: number;
}

export interface SapFacturacionParseResult {
  valid: ParsedSapFacturacionRow[];
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
  grupo_vendedor: string;
  asesor_encargado: string;
  fuente_sell_out?: FuenteSellOut;
  /** Modelo de atención de la columna "Directo o Indirecto" (Directo/Indirecto/Mixto). "" si la columna no está. */
  esquema_atencion: string;
  /** "Segmento de Clientes 2" de la Cartera Consolidada. "" si la columna no está. */
  segmento_cliente: string;
}

export interface CarteraParseResult {
  valid: ParsedCarteraRow[];
  errors: ParseError[];
  /** Encabezados crudos de la fila detectada como header. Sirve para diagnosticar
   *  por qué no se reconoció una columna (p. ej. "Segmento de Clientes 2"). */
  headers?: string[];
  /** true si se reconoció la columna de segmento de cartera. */
  segmentoDetectado?: boolean;
}

// ════════════════════════════════════════════════════════════════
// Reporte SAP N7_V_SD85_WEB_001_OP (Efectividad de Visita / Motivos de No
// Venta) — export "Web Page, Single File" de SAP BW (MHTML .xls). Una fila
// por cliente + material + justificación, con 3 % de efectividad. No trae
// fecha. Ver src/lib/sap-mhtml-parser.ts y migración 011.
// ════════════════════════════════════════════════════════════════

export type MotivoNoVentaTipo = "NO_ACTIVACION" | "NO_RECOMPRA" | "VENTA_EFECTIVA";

export interface ParsedSapEfectividadRow {
  sap_code: string;
  client_name: string;
  material_name: string;
  justificacion: string; // motivo crudo ("Venta Efectiva", "NVE - Sin pedido PIM", …)
  efectividad_visita: number;
  efectividad_pedidos: number;
  efectividad_ventas: number;
}

export interface SapEfectividadParseResult {
  valid: ParsedSapEfectividadRow[];
  errors: ParseError[];
}

// ════════════════════════════════════════════════════════════════
// Modelo de Atención (Esquema): asigna Directo/Indirecto a cada cliente de la
// cartera por código SAP. Dos fuentes: el maestro SAP N7_V_SD56_WEB_001
// (MHTML, columna "Esquema de Atención") y el maestro de indirectos de la
// distribuidora (xlsx, columnas "Deudor" + "Esquema"). Ambos actualizan
// locations.esquema_atencion. Ver src/lib/sap-mhtml-parser.ts, excel-parser.ts.
// ════════════════════════════════════════════════════════════════

export interface ParsedModeloRow {
  sap_code: string;
  esquema_atencion: string; // "Directo" / "Indirecto" / "Mixto" / …
  /** Días ISO programados de visita separados por coma (1=Lun..7=Dom), ej "1,3,5". "" si no hay plan. */
  dias_visita: string;
}

export interface ModeloParseResult {
  valid: ParsedModeloRow[];
  errors: ParseError[];
}

export interface SapDispatch {
  id: string;
  created_at: string;
  upload_batch_id: string;
  location_id: string;
  variant_id: string | null;
  quantity: number;
  dispatch_date: string;
  location?: Location;
}

export interface ParsedDispatchRow {
  sap_code: string;
  variant_sku?: string;
  quantity: number;
  dispatch_date: string;
}

export interface DispatchesParseResult {
  valid: ParsedDispatchRow[];
  errors: ParseError[];
}

export interface SellOutReportado {
  id: string;
  created_at: string;
  upload_batch_id: string;
  location_id: string;
  variant_id: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  volumen: number;
  location?: Location;
}

export interface ParsedSellOutReportadoRow {
  sap_code: string;
  variant_sku?: string;
  fecha_inicio: string;
  fecha_fin: string;
  volumen: number;
}

export interface SellOutReportadoParseResult {
  valid: ParsedSellOutReportadoRow[];
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
