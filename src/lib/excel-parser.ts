import type {
  ParsedSapRow,
  ParseError,
  SapParseResult,
  ParsedCarteraRow,
  CarteraParseResult,
  ParsedPendingOrderRow,
  PendingOrdersParseResult,
  ParsedDispatchRow,
  DispatchesParseResult,
  ParsedSellOutReportadoRow,
  SellOutReportadoParseResult,
} from "@/types";

const MONTH_ES: Record<string, string> = {
  ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
  JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12",
};

type LocationType = "SUPERMERCADO" | "ABASTO" | "BODEGA" | "OTRO";

// Exportada para reusarla en parseCarteraExcel() — ambos reportes SAP
// (ventas y cartera de clientes) usan los mismos valores crudos de
// "Tipo de Cliente".
export function mapLocationType(raw: string): LocationType {
  if (raw === "SUPERMERCADOS") return "SUPERMERCADO";
  if (raw === "ABASTOS") return "ABASTO";
  if (raw === "BODEGAS" || raw === "BODEGON/EXQUISITES") return "BODEGA";
  return "OTRO";
}

function parseMonthHeader(value: string): string | null {
  const match = value.trim().match(/^([A-ZÁÉÍÓÚ]{3})\s+(\d{4})$/i);
  if (!match) return null;
  const month = MONTH_ES[match[1].toUpperCase()];
  return month ? `${match[2]}-${month}-01` : null;
}

// Column positions (1-indexed, fixed by SAP report format N7_V_SD88_WEB_001)
const COL_TERRITORY   = 1;
const COL_SAP_CODE    = 5;
const COL_CLIENT_NAME = 6;
const COL_CLIENT_TYPE = 10;
const COL_MUNICIPIO   = 11;
const COL_CENTRO      = 12;
const COL_CATEGORIA   = 13;
const MONTH_START_COL = 14; // First KGL month column

export async function parseSapExcel(buffer: ArrayBuffer): Promise<SapParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws) {
    return {
      valid: [],
      errors: [{ row: 0, field: "file", message: "El archivo no contiene hojas." }],
    };
  }

  // Row 9 (1-indexed) contains month names: "ENE 2026", "FEB 2026", etc.
  const monthCols: { col: number; date: string }[] = [];
  const monthRow = ws.getRow(9);
  monthRow.eachCell({ includeEmpty: false }, (cell, col) => {
    if (col < MONTH_START_COL) return;
    const date = parseMonthHeader(String(cell.value ?? ""));
    if (date) monthCols.push({ col, date });
  });

  if (monthCols.length === 0) {
    return {
      valid: [],
      errors: [{ row: 0, field: "formato", message: "No se encontraron columnas de mes (ej. 'ENE 2026'). Verifica que sea el reporte SAP correcto." }],
    };
  }

  const valid: ParsedSapRow[] = [];
  const errors: ParseError[] = [];

  // Data starts at row 11 (rows 1-10 are metadata + headers)
  ws.eachRow((row, rowNum) => {
    if (rowNum <= 10) return;

    const territory = String(row.getCell(COL_TERRITORY).value ?? "").trim();
    if (!territory || territory === "Resultado total") return;

    const rawCode = row.getCell(COL_SAP_CODE).value;
    if (rawCode === null || rawCode === undefined) return;
    const sap_code = String(rawCode).trim();
    if (!sap_code || sap_code === "0") return;

    const client_name = String(row.getCell(COL_CLIENT_NAME).value ?? "").trim();
    const raw_type    = String(row.getCell(COL_CLIENT_TYPE).value ?? "").trim().toUpperCase();
    const region      = String(row.getCell(COL_MUNICIPIO).value ?? "").trim();
    const city        = String(row.getCell(COL_CENTRO).value ?? "").trim();
    const category    = String(row.getCell(COL_CATEGORIA).value ?? "").trim();
    const client_type = mapLocationType(raw_type);

    for (const { col, date } of monthCols) {
      const rawKg = row.getCell(col).value;
      if (rawKg === null || rawKg === undefined) continue;
      const kg = Number(rawKg);
      if (!isFinite(kg) || kg <= 0) continue;

      valid.push({ sap_code, client_name, client_type, region, city, category, quantity_kg: kg, date_of_sale: date });
    }
  });

  if (valid.length === 0 && errors.length === 0) {
    errors.push({ row: 0, field: "datos", message: "No se encontraron filas con datos de venta." });
  }

  return { valid, errors };
}

// ════════════════════════════════════════════════════════════════
// Cartera de clientes — reporte distinto al de ventas (N7_V_SD88_WEB_001):
// trae la maestra de clientes con "Oficina de Ventas", "Tipo de Cliente",
// "Centro Poblado", etc. No se conoce todavía el layout exacto que usará
// el equipo para cargas futuras (la primera carga se hizo con un archivo
// ya convertido a tabla), así que en vez de columnas por posición fija
// se detectan por nombre de encabezado — más tolerante a variaciones.
// Ver decisión #4 en docs/decisiones-implementacion.md.
// ════════════════════════════════════════════════════════════════

// Rango Unicode de marcas diacríticas combinantes (tildes tras normalize("NFD")):
// U+0300–U+036F. Se arma con fromCharCode (no como literal en el código
// fuente) para evitar cualquier ambigüedad de codificación.
const DIACRITICS_RE = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "") // quita diacríticos (tildes) tras NFD
    .replace(/[^a-z0-9]/g, "");
}

// Alias aceptados por columna (normalizados: sin tildes/espacios/puntuación).
const CARTERA_HEADER_ALIASES: Record<keyof CarteraColumnMap, string[]> = {
  sap_code: ["ncliente", "nrocliente", "codigocliente", "codigosap", "sapcode"],
  name: ["nombre", "nombrecliente", "razonsocial"],
  tipo_cliente: ["tipodecliente"],
  oficina_venta: ["oficinadeventas", "oficinadeventa", "oficventas"],
  centro_poblado: ["centropoblado"],
  municipio: ["municipio"],
  region: ["territoriodeventas2", "territoriodeventas"],
  asesor_encargado: ["asesorencargado", "asesor"],
  fuente_sell_out: ["fuentesellout", "fuentedesellout"],
};

interface CarteraColumnMap {
  sap_code: number;
  name: number;
  tipo_cliente: number;
  oficina_venta: number;
  centro_poblado: number;
  municipio: number;
  region: number;
  asesor_encargado: number;
  fuente_sell_out: number;
}

export async function parseCarteraExcel(buffer: ArrayBuffer): Promise<CarteraParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws) {
    return {
      valid: [],
      errors: [{ row: 0, field: "file", message: "El archivo no contiene hojas." }],
    };
  }

  // Buscar la fila de encabezados entre las primeras 10 filas.
  let headerRowNum = -1;
  let columns: Partial<CarteraColumnMap> = {};
  for (let r = 1; r <= 10 && headerRowNum < 0; r++) {
    const row = ws.getRow(r);
    const found: Partial<CarteraColumnMap> = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const norm = normalizeHeader(String(cell.value ?? ""));
      for (const [field, aliases] of Object.entries(CARTERA_HEADER_ALIASES) as [
        keyof CarteraColumnMap,
        string[],
      ][]) {
        if (field in found) continue;
        if (aliases.includes(norm)) found[field] = col;
      }
    });
    // Exigimos al menos sap_code, name y oficina_venta para aceptar la fila como header.
    if (found.sap_code && found.name && found.oficina_venta) {
      headerRowNum = r;
      columns = found;
    }
  }

  if (headerRowNum < 0 || !columns.sap_code || !columns.name || !columns.oficina_venta) {
    return {
      valid: [],
      errors: [
        {
          row: 0,
          field: "formato",
          message:
            'No se encontraron las columnas esperadas ("Nº cliente", "Nombre", "Oficina de ventas"). Verifica que sea el archivo de cartera de clientes correcto.',
        },
      ],
    };
  }

  const valid: ParsedCarteraRow[] = [];
  const errors: ParseError[] = [];
  const col = columns as CarteraColumnMap;

  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;

    const rawCode = row.getCell(col.sap_code).value;
    if (rawCode === null || rawCode === undefined) return;
    const sap_code = String(rawCode).trim();
    if (!sap_code) return;

    const name = String(row.getCell(col.name).value ?? "").trim();
    const oficina_venta = String(row.getCell(col.oficina_venta).value ?? "").trim().toUpperCase();
    if (!name || !oficina_venta) {
      errors.push({ row: rowNum, field: "nombre/oficina", message: "Fila sin nombre u oficina de venta." });
      return;
    }

    const tipo_cliente_raw = String(col.tipo_cliente ? row.getCell(col.tipo_cliente).value ?? "" : "")
      .trim()
      .toUpperCase();

    const fuenteRaw = String(col.fuente_sell_out ? row.getCell(col.fuente_sell_out).value ?? "" : "")
      .trim()
      .toUpperCase();

    valid.push({
      sap_code,
      name,
      type: mapLocationType(tipo_cliente_raw),
      tipo_cliente: tipo_cliente_raw,
      oficina_venta,
      centro_poblado: String(col.centro_poblado ? row.getCell(col.centro_poblado).value ?? "" : "").trim(),
      municipio: String(col.municipio ? row.getCell(col.municipio).value ?? "" : "").trim(),
      region: String(col.region ? row.getCell(col.region).value ?? "" : "").trim(),
      asesor_encargado: String(col.asesor_encargado ? row.getCell(col.asesor_encargado).value ?? "" : "").trim(),
      fuente_sell_out: fuenteRaw.includes("B2B") || fuenteRaw.includes("REPORTADO") ? "Reportado_B2B" : undefined,
    });
  });

  if (valid.length === 0 && errors.length === 0) {
    errors.push({ row: 0, field: "datos", message: "No se encontraron filas de clientes." });
  }

  return { valid, errors };
}

// ════════════════════════════════════════════════════════════════
// Pedidos pendientes por entregar — el formato real del reporte SAP no
// está confirmado todavía (no se recibió un archivo de ejemplo). Este
// parser es "best-effort": detecta columnas por nombre de encabezado
// (cliente/código, cantidad, fecha) en vez de posiciones fijas. Ajustar
// cuando llegue un archivo real. Ver decisión #13 en
// docs/decisiones-implementacion.md.
// ════════════════════════════════════════════════════════════════

const PENDING_ORDER_ALIASES: Record<keyof PendingOrderColumnMap, string[]> = {
  sap_code: ["ncliente", "nrocliente", "codigocliente", "codigosap", "cliente", "sapcode"],
  quantity: ["cantidad", "cantidadpendiente", "qty", "unidades", "cantidadpedida"],
  order_date: ["fecha", "fechapedido", "fechadeentrega", "fechaentrega"],
};

interface PendingOrderColumnMap {
  sap_code: number;
  quantity: number;
  order_date: number;
}

function parseDateCell(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value.trim());
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

export async function parsePendingOrdersExcel(buffer: ArrayBuffer): Promise<PendingOrdersParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws) {
    return { valid: [], errors: [{ row: 0, field: "file", message: "El archivo no contiene hojas." }] };
  }

  let headerRowNum = -1;
  let columns: Partial<PendingOrderColumnMap> = {};
  for (let r = 1; r <= 10 && headerRowNum < 0; r++) {
    const row = ws.getRow(r);
    const found: Partial<PendingOrderColumnMap> = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const norm = normalizeHeader(String(cell.value ?? ""));
      for (const [field, aliases] of Object.entries(PENDING_ORDER_ALIASES) as [
        keyof PendingOrderColumnMap,
        string[],
      ][]) {
        if (field in found) continue;
        if (aliases.includes(norm)) found[field] = col;
      }
    });
    if (found.sap_code && found.quantity) {
      headerRowNum = r;
      columns = found;
    }
  }

  if (headerRowNum < 0 || !columns.sap_code || !columns.quantity) {
    return {
      valid: [],
      errors: [
        {
          row: 0,
          field: "formato",
          message:
            'No se encontraron las columnas esperadas ("Nº cliente" y "Cantidad"). El formato del reporte SAP de pedidos pendientes aún no está confirmado — ajusta este parser cuando tengas un archivo real (ver src/lib/excel-parser.ts).',
        },
      ],
    };
  }

  const valid: ParsedPendingOrderRow[] = [];
  const errors: ParseError[] = [];
  const col = columns as PendingOrderColumnMap;

  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;

    const rawCode = row.getCell(col.sap_code).value;
    if (rawCode === null || rawCode === undefined) return;
    const sap_code = String(rawCode).trim();
    if (!sap_code) return;

    const rawQty = row.getCell(col.quantity).value;
    const quantity = Number(rawQty);
    if (!isFinite(quantity) || quantity < 0) {
      errors.push({ row: rowNum, field: "cantidad", message: "Cantidad inválida." });
      return;
    }

    valid.push({
      sap_code,
      quantity,
      order_date: col.order_date ? parseDateCell(row.getCell(col.order_date).value) : null,
    });
  });

  if (valid.length === 0 && errors.length === 0) {
    errors.push({ row: 0, field: "datos", message: "No se encontraron filas de pedidos pendientes." });
  }

  return { valid, errors };
}

// ════════════════════════════════════════════════════════════════
// Despachos SAP con fecha real (para el motor de Sell-Out, corte D-1).
// El reporte mensual agregado que usa "Carga SAP" no sirve para esto: no
// trae fecha real por despacho. No se recibió un archivo de ejemplo de
// este reporte tampoco, así que el parser es "best-effort" por nombre de
// columna, igual que parsePendingOrdersExcel. Ver decisión #2 en
// docs/decisiones-implementacion.md.
// ════════════════════════════════════════════════════════════════

const DISPATCH_ALIASES: Record<keyof DispatchColumnMap, string[]> = {
  sap_code: ["ncliente", "nrocliente", "codigocliente", "codigosap", "cliente", "sapcode"],
  variant_sku: ["sku", "presentacion", "variante", "producto", "codigoproducto"],
  quantity: ["cantidad", "unidades", "cantidaddespachada", "qty", "cantidadfacturada"],
  dispatch_date: ["fecha", "fechadespacho", "fechafactura", "fechadefacturacion", "fechadeldespacho"],
};

interface DispatchColumnMap {
  sap_code: number;
  variant_sku: number;
  quantity: number;
  dispatch_date: number;
}

export async function parseDispatchesExcel(buffer: ArrayBuffer): Promise<DispatchesParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws) {
    return { valid: [], errors: [{ row: 0, field: "file", message: "El archivo no contiene hojas." }] };
  }

  let headerRowNum = -1;
  let columns: Partial<DispatchColumnMap> = {};
  for (let r = 1; r <= 10 && headerRowNum < 0; r++) {
    const row = ws.getRow(r);
    const found: Partial<DispatchColumnMap> = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const norm = normalizeHeader(String(cell.value ?? ""));
      for (const [field, aliases] of Object.entries(DISPATCH_ALIASES) as [keyof DispatchColumnMap, string[]][]) {
        if (field in found) continue;
        if (aliases.includes(norm)) found[field] = col;
      }
    });
    if (found.sap_code && found.quantity && found.dispatch_date) {
      headerRowNum = r;
      columns = found;
    }
  }

  if (headerRowNum < 0 || !columns.sap_code || !columns.quantity || !columns.dispatch_date) {
    return {
      valid: [],
      errors: [
        {
          row: 0,
          field: "formato",
          message:
            'No se encontraron las columnas esperadas ("Nº cliente", "Cantidad", "Fecha"). El formato del reporte de despachos aún no está confirmado — ajusta parseDispatchesExcel en src/lib/excel-parser.ts cuando tengas un archivo real.',
        },
      ],
    };
  }

  const valid: ParsedDispatchRow[] = [];
  const errors: ParseError[] = [];
  const col = columns as DispatchColumnMap;

  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;

    const rawCode = row.getCell(col.sap_code).value;
    if (rawCode === null || rawCode === undefined) return;
    const sap_code = String(rawCode).trim();
    if (!sap_code) return;

    const rawQty = row.getCell(col.quantity).value;
    const quantity = Number(rawQty);
    if (!isFinite(quantity) || quantity < 0) {
      errors.push({ row: rowNum, field: "cantidad", message: "Cantidad inválida." });
      return;
    }

    const dispatch_date = parseDateCell(row.getCell(col.dispatch_date).value);
    if (!dispatch_date) {
      errors.push({ row: rowNum, field: "fecha", message: "Fecha de despacho inválida o vacía." });
      return;
    }

    const variant_sku = col.variant_sku ? String(row.getCell(col.variant_sku).value ?? "").trim() : "";

    valid.push({ sap_code, variant_sku: variant_sku || undefined, quantity, dispatch_date });
  });

  if (valid.length === 0 && errors.length === 0) {
    errors.push({ row: 0, field: "datos", message: "No se encontraron filas de despachos." });
  }

  return { valid, errors };
}

// ════════════════════════════════════════════════════════════════
// Sell-Out reportado por Cadenas (Key Accounts) — layout conocido, a
// diferencia de despachos/pedidos pendientes: Nº cliente, Fecha Inicio,
// Fecha Fin, Volumen/Unidades, SKU (opcional).
// ════════════════════════════════════════════════════════════════

const SELL_OUT_REPORTADO_ALIASES: Record<keyof SellOutReportadoColumnMap, string[]> = {
  sap_code: ["ncliente", "nrocliente", "codigocliente", "codigosap", "cliente", "sapcode"],
  fecha_inicio: ["fechainicio", "fechadeinicio", "inicio"],
  fecha_fin: ["fechafin", "fechadefin", "fin"],
  volumen: ["volumen", "unidades", "volumenunidadessellout", "sellout", "volumensellout"],
  variant_sku: ["sku", "presentacion", "variante", "producto", "codigoproducto"],
};

interface SellOutReportadoColumnMap {
  sap_code: number;
  fecha_inicio: number;
  fecha_fin: number;
  volumen: number;
  variant_sku: number;
}

export async function parseSellOutReportadoExcel(buffer: ArrayBuffer): Promise<SellOutReportadoParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws) {
    return { valid: [], errors: [{ row: 0, field: "file", message: "El archivo no contiene hojas." }] };
  }

  let headerRowNum = -1;
  let columns: Partial<SellOutReportadoColumnMap> = {};
  for (let r = 1; r <= 10 && headerRowNum < 0; r++) {
    const row = ws.getRow(r);
    const found: Partial<SellOutReportadoColumnMap> = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const norm = normalizeHeader(String(cell.value ?? ""));
      for (const [field, aliases] of Object.entries(SELL_OUT_REPORTADO_ALIASES) as [
        keyof SellOutReportadoColumnMap,
        string[],
      ][]) {
        if (field in found) continue;
        if (aliases.includes(norm)) found[field] = col;
      }
    });
    if (found.sap_code && found.fecha_inicio && found.fecha_fin && found.volumen) {
      headerRowNum = r;
      columns = found;
    }
  }

  if (headerRowNum < 0 || !columns.sap_code || !columns.fecha_inicio || !columns.fecha_fin || !columns.volumen) {
    return {
      valid: [],
      errors: [
        {
          row: 0,
          field: "formato",
          message:
            'No se encontraron las columnas esperadas ("Nº cliente", "Fecha Inicio", "Fecha Fin", "Volumen/Unidades").',
        },
      ],
    };
  }

  const valid: ParsedSellOutReportadoRow[] = [];
  const errors: ParseError[] = [];
  const col = columns as SellOutReportadoColumnMap;

  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;

    const rawCode = row.getCell(col.sap_code).value;
    if (rawCode === null || rawCode === undefined) return;
    const sap_code = String(rawCode).trim();
    if (!sap_code) return;

    const fecha_inicio = parseDateCell(row.getCell(col.fecha_inicio).value);
    const fecha_fin = parseDateCell(row.getCell(col.fecha_fin).value);
    if (!fecha_inicio || !fecha_fin) {
      errors.push({ row: rowNum, field: "fechas", message: "Fecha Inicio/Fin inválida o vacía." });
      return;
    }

    const rawVol = row.getCell(col.volumen).value;
    const volumen = Number(rawVol);
    if (!isFinite(volumen) || volumen < 0) {
      errors.push({ row: rowNum, field: "volumen", message: "Volumen/Unidades inválido." });
      return;
    }

    const variant_sku = col.variant_sku ? String(row.getCell(col.variant_sku).value ?? "").trim() : "";

    valid.push({ sap_code, variant_sku: variant_sku || undefined, fecha_inicio, fecha_fin, volumen });
  });

  if (valid.length === 0 && errors.length === 0) {
    errors.push({ row: 0, field: "datos", message: "No se encontraron filas de Sell-Out reportado." });
  }

  return { valid, errors };
}
