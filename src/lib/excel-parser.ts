import type {
  ParseError,
  ParsedCarteraRow,
  CarteraParseResult,
  ParsedDispatchRow,
  DispatchesParseResult,
  ParsedSellOutReportadoRow,
  SellOutReportadoParseResult,
  ParsedModeloRow,
  ModeloParseResult,
} from "@/types";

type LocationType = "SUPERMERCADO" | "ABASTO" | "BODEGA" | "OTRO";

// Exportada para reusarla en parseCarteraExcel() y en el parser MHTML de
// Radar/Pedido-Facturado — todos los reportes SAP usan los mismos valores
// crudos de "Tipo de Cliente".
export function mapLocationType(raw: string): LocationType {
  if (raw === "SUPERMERCADOS") return "SUPERMERCADO";
  if (raw === "ABASTOS") return "ABASTO";
  if (raw === "BODEGAS" || raw === "BODEGON/EXQUISITES") return "BODEGA";
  return "OTRO";
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

// Exportada para reusarla en sap-mhtml-parser.ts (mismo criterio de
// normalización de encabezados para el reporte SAP N7_V_SD83_WEB_001).
export function normalizeHeader(value: string): string {
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
  // Segmentación de cartera pedida por DIENN (punto 2, 18-08-2026). Solo se
  // aceptan las variantes con el "2": el archivo trae también "Segmento de
  // Clientes" (sin número) y, con el matching "primera columna que calza gana",
  // agregar ese alias haría que se guardara la columna equivocada — mismo
  // problema que ya pasó con "Ofic Ventas" vs "Oficina de ventas".
  segmento_cliente: ["segmentodeclientes2", "segmentodecliente2", "segmentoclientes2", "segmento2"],
  // OJO: NO agregar "oficventas" aquí — es la forma normalizada de "Ofic
  // Ventas" (columna de CÓDIGO, ej. "N007"), una columna distinta de
  // "Oficina de ventas" (el NOMBRE del sector, ej. "CUMANA"). Como "Ofic
  // Ventas" aparece antes en el archivo y el matching es "primera columna
  // que calza gana", agregar ese alias hacía que se guardara el código en
  // vez del nombre — y sectorGroup() nunca reconocía ningún PDV. Bug real
  // visto en producción: 358/358 filas "sin sector reconocido".
  oficina_venta: ["oficinadeventas", "oficinadeventa"],
  centro_poblado: ["centropoblado"],
  municipio: ["municipio"],
  // Igual razón: "Territorio de ventas" es el CÓDIGO (ej. "T12") y
  // aparece antes que "Territorio de ventas2", que es el nombre
  // descriptivo (ej. "Oriente Norte") que sí queremos en `region`.
  region: ["territoriodeventas2"],
  // Grupo vendedor de SAP (ej. U29, U30). Es el nivel de filtro más fino
  // del dashboard de Admin y no se puede derivar de la oficina: los dos
  // grupos del piloto viven dentro de CUMANA. Ver migración 006.
  grupo_vendedor: ["grupovendedor", "grupovendedores", "grupodevendedores", "gruponvendedor"],
  asesor_encargado: ["asesorencargado", "asesor"],
  fuente_sell_out: ["fuentesellout", "fuentedesellout"],
  // Modelo de atención — columna "Directo o Indirecto" de la cartera (valores
  // Directo / Indirecto / Mixto). Es la fuente autoritativa del modelo.
  esquema_atencion: ["directooindirect", "directooindirecto", "directoindirecto", "modelo", "esquema", "esquemadeatencion"],
  // Override opcional de la fecha de incorporación al piloto. Normalmente NO
  // viene en el archivo: la fecha se deriva de la regla por grupo vendedor
  // (ver src/lib/cohortes.ts). Existe para el cliente suelto que se incorpora
  // en una fecha propia y no encaja en ninguna tanda.
  fecha_incorporacion: [
    "fechaincorporacion",
    "fechadeincorporacion",
    "fechaingreso",
    "fechadeingreso",
    "fechaalta",
    "fechadealta",
  ],
};

interface CarteraColumnMap {
  sap_code: number;
  name: number;
  tipo_cliente: number;
  segmento_cliente: number;
  oficina_venta: number;
  centro_poblado: number;
  municipio: number;
  region: number;
  grupo_vendedor: number;
  asesor_encargado: number;
  fuente_sell_out: number;
  esquema_atencion: number;
  fecha_incorporacion: number;
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
      grupo_vendedor: String(col.grupo_vendedor ? row.getCell(col.grupo_vendedor).value ?? "" : "")
        .trim()
        .toUpperCase(),
      asesor_encargado: String(col.asesor_encargado ? row.getCell(col.asesor_encargado).value ?? "" : "").trim(),
      fuente_sell_out: fuenteRaw.includes("B2B") || fuenteRaw.includes("REPORTADO") ? "Reportado_B2B" : undefined,
      esquema_atencion: String(col.esquema_atencion ? row.getCell(col.esquema_atencion).value ?? "" : "").trim(),
      segmento_cliente: String(col.segmento_cliente ? row.getCell(col.segmento_cliente).value ?? "" : "").trim(),
      fecha_incorporacion: col.fecha_incorporacion
        ? parseDateCell(row.getCell(col.fecha_incorporacion).value)
        : null,
    });
  });

  if (valid.length === 0 && errors.length === 0) {
    errors.push({ row: 0, field: "datos", message: "No se encontraron filas de clientes." });
  }

  // Encabezados crudos de la fila de header, para poder decir POR QUÉ no se
  // reconoció una columna en vez de dejar el gráfico vacío sin explicación.
  const headers: string[] = [];
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell) => {
    const texto = String(cell.value ?? "").trim();
    if (texto) headers.push(texto);
  });

  return { valid, errors, headers, segmentoDetectado: col.segmento_cliente !== undefined };
}

function parseDateCell(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value.trim());
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
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

// ════════════════════════════════════════════════════════════════
// Modelo de Atención (indirectos) — maestro xlsx de la distribuidora. TODO el
// archivo es el canal INDIRECTO: el modelo es "Indirecto" por estar aquí (la
// columna "Esquema" del archivo es el esquema de precios, ej. "Estándar", NO
// el modelo). Se detecta "Deudor" (código SAP) y las columnas de día de la
// semana (Lunes..Domingo, "X" = programado) para el plan de visita.
// ════════════════════════════════════════════════════════════════

const MODELO_WEEKDAYS: [string, number][] = [
  ["lunes", 1],
  ["martes", 2],
  ["miercoles", 3],
  ["jueves", 4],
  ["viernes", 5],
  ["sabado", 6],
  ["domingo", 7],
];

export async function parseModeloIndirectoExcel(buffer: ArrayBuffer): Promise<ModeloParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ws = workbook.worksheets[0];
  if (!ws) {
    return { valid: [], errors: [{ row: 0, field: "file", message: "El archivo no contiene hojas." }] };
  }

  // La fila de encabezados es la que trae "Deudor" (+ los días de visita).
  let headerRowNum = -1;
  let deudorCol = -1;
  const diaCols: [number, number][] = [];
  ws.eachRow((row, rowNum) => {
    if (headerRowNum > 0) return;
    let dCol = -1;
    const dias: [number, number][] = [];
    row.eachCell((cell, colNum) => {
      const h = normalizeHeader(String(cell.value ?? ""));
      if (h === "deudor") dCol = colNum;
      for (const [kw, iso] of MODELO_WEEKDAYS) if (h === kw) dias.push([colNum, iso]);
    });
    if (dCol > 0) {
      headerRowNum = rowNum;
      deudorCol = dCol;
      diaCols.push(...dias);
    }
  });

  if (headerRowNum < 0) {
    return {
      valid: [],
      errors: [{ row: 0, field: "formato", message: 'No se encontró la columna "Deudor" en el archivo.' }],
    };
  }

  const errors: ParseError[] = [];
  const seen = new Set<string>();
  const valid: ParsedModeloRow[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;
    const rawCode = row.getCell(deudorCol).value;
    if (rawCode === null || rawCode === undefined) return;
    const sap_code = String(rawCode).trim();
    if (!sap_code) return;
    if (seen.has(sap_code)) return;
    seen.add(sap_code);
    const dias: number[] = [];
    for (const [col, iso] of diaCols) {
      if (String(row.getCell(col).value ?? "").trim().toUpperCase() === "X") dias.push(iso);
    }
    valid.push({ sap_code, esquema_atencion: "Indirecto", dias_visita: dias.sort((a, b) => a - b).join(",") });
  });

  if (valid.length === 0 && errors.length === 0) {
    errors.push({ row: 0, field: "datos", message: "No se encontraron filas con Deudor." });
  }

  return { valid, errors };
}
