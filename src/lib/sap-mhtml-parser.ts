import type { ParsedSapFacturacionRow, ParseError, SapFacturacionParseResult } from "@/types";
import { normalizeHeader } from "@/lib/excel-parser";

// ════════════════════════════════════════════════════════════════
// Reporte SAP N7_V_SD83_WEB_001 — Cantidad Pedido / Entregada / Facturada
// por cliente + material + Fecha de Pedido.
//
// El archivo que exporta SAP BW trae extensión ".xls" pero por dentro es
// MHTML ("Web Page, Single File" de Excel): un mensaje MIME multipart con
// una parte text/html (codificada quoted-printable) y a veces una imagen.
// No es un binario de Excel real, así que exceljs no puede abrirlo — hay
// que extraer y parsear el HTML manualmente.
//
// Encima de la fila de encabezados reales (fila con "Fecha de Pedido") hay
// otra fila con los nombres de los 9 ratios del reporte ("Cantidad
// Pedido", "Cantidad Facturada", etc.) — la fila de encabezados solo
// repite "KG" como unidad, así que para saber qué columna es cuál hay que
// mirar la fila de arriba. Todo se detecta por nombre de columna, no por
// posición fija, porque la cantidad de filas de metadata de filtros antes
// de la tabla puede variar.
// ════════════════════════════════════════════════════════════════

/** true si el buffer es un archivo MHTML (export "Web Page" de SAP/Excel) y no un .xlsx real. */
export function isSapMhtml(buffer: ArrayBuffer): boolean {
  const head = bytesToBinaryString(buffer.slice(0, 512));
  return /^\s*MIME-Version\s*:/i.test(head) || /Content-Type:\s*multipart\/related/i.test(head);
}

export function parseSapFacturacionMhtml(buffer: ArrayBuffer): SapFacturacionParseResult {
  const errors: ParseError[] = [];

  let html: string;
  try {
    html = extractHtmlFromMhtml(buffer);
  } catch (e) {
    return {
      valid: [],
      errors: [{ row: 0, field: "file", message: `No se pudo leer el archivo SAP: ${e instanceof Error ? e.message : String(e)}` }],
    };
  }

  const grid = parseHtmlTableGrid(html);
  if (grid.length === 0) {
    return { valid: [], errors: [{ row: 0, field: "file", message: "No se encontró ninguna tabla en el archivo." }] };
  }

  let headerRowIdx = -1;
  let cols: ColumnMap | null = null;
  for (let r = 0; r < grid.length; r++) {
    const found = findColumns(grid[r]);
    if (found) {
      headerRowIdx = r;
      cols = found;
      break;
    }
  }

  if (headerRowIdx < 0 || !cols) {
    return {
      valid: [],
      errors: [
        {
          row: 0,
          field: "formato",
          message:
            'No se encontraron las columnas esperadas ("Cliente (T)", "Material", "Fecha de Pedido", etc.). Verifica que sea el reporte SAP N7_V_SD83_WEB_001 (Cantidad Pedido/Entregada/Facturada).',
        },
      ],
    };
  }

  const ratios = headerRowIdx > 0 ? findRatioColumns(grid[headerRowIdx - 1]) : null;
  if (!ratios) {
    return {
      valid: [],
      errors: [{ row: 0, field: "formato", message: 'No se encontraron las columnas "Cantidad Pedido" / "Cantidad Facturada" sobre el encabezado.' }],
    };
  }

  const valid: ParsedSapFacturacionRow[] = [];
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const sapCode = (row[cols.clienteCodigo] ?? "").trim();
    if (!sapCode) continue;
    if (normalizeHeader(sapCode) === "resultadototal") break; // fila de totales: fin de los datos

    const fechaRaw = (row[cols.fecha] ?? "").trim();
    const fecha = parseSapDate(fechaRaw);
    if (!fecha) {
      errors.push({ row: r + 1, field: "fecha", message: `"Fecha de Pedido" inválida: "${fechaRaw}".` });
      continue;
    }

    valid.push({
      sap_code: sapCode,
      client_name: (row[cols.clienteNombre] ?? "").trim(),
      tipo_cliente: (row[cols.tipoCliente] ?? "").trim().toUpperCase(),
      esquema_atencion: (row[cols.esquemaAtencion] ?? "").trim(),
      grupo_vendedor: (row[cols.grupoVendedorCodigo] ?? "").trim().toUpperCase(),
      region: (row[cols.grupoVendedorNombre] ?? "").trim().toUpperCase(),
      oficina_venta: (row[cols.oficinaVenta] ?? "").trim().toUpperCase(),
      zona_venta: (row[cols.zonaVenta] ?? "").trim().toUpperCase(),
      material_code: (row[cols.materialCodigo] ?? "").trim(),
      material_name: (row[cols.materialNombre] ?? "").trim(),
      fecha,
      cantidad_pedido_kg: parseLatinNumber(row[ratios.pedido]),
      cantidad_facturada_kg: parseLatinNumber(row[ratios.facturada]),
    });
  }

  if (valid.length === 0 && errors.length === 0) {
    errors.push({ row: 0, field: "datos", message: "No se encontraron filas de datos en el reporte." });
  }

  return { valid, errors };
}

// ── MIME / quoted-printable ─────────────────────────────────────────────

function bytesToBinaryString(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return s;
}

function decodeQuotedPrintable(input: string): Uint8Array {
  const bytes: number[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === "=") {
      if (input[i + 1] === "\r" && input[i + 2] === "\n") { i += 3; continue; } // soft break CRLF
      if (input[i + 1] === "\n") { i += 2; continue; } // soft break LF
      const hex = input.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) { bytes.push(parseInt(hex, 16)); i += 3; continue; }
      bytes.push(0x3d); i += 1; continue; // '=' literal, no era escape válido
    }
    bytes.push(input.charCodeAt(i) & 0xff);
    i += 1;
  }
  return new Uint8Array(bytes);
}

function extractHtmlFromMhtml(buffer: ArrayBuffer): string {
  const raw = bytesToBinaryString(buffer);
  const headerEnd = raw.indexOf("\r\n\r\n");
  const headerBlock = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw.slice(0, 1000);
  const boundaryMatch = /boundary\s*=\s*"?([^";\r\n]+)"?/i.exec(headerBlock);
  if (!boundaryMatch) throw new Error("no se encontró el boundary MIME");
  const delimiter = `--${boundaryMatch[1]}`;
  const segments = raw.split(delimiter).slice(1); // descarta el preámbulo antes del primer boundary

  for (const segment of segments) {
    if (segment.startsWith("--")) continue; // delimitador final ("--BOUNDARY--")
    const bodyStart = segment.indexOf("\r\n\r\n");
    if (bodyStart < 0) continue;
    const partHeaders = segment.slice(0, bodyStart);
    if (!/Content-Type:\s*text\/html/i.test(partHeaders)) continue;

    const encodingMatch = /Content-Transfer-Encoding:\s*([^\r\n]+)/i.exec(partHeaders);
    const encoding = (encodingMatch?.[1] ?? "7bit").trim().toLowerCase();
    const body = segment.slice(bodyStart + 4).replace(/\r\n$/, "");
    const bytes =
      encoding === "quoted-printable"
        ? decodeQuotedPrintable(body)
        : Uint8Array.from(Array.from(body, (c) => c.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8").decode(bytes);
  }
  throw new Error('no se encontró la parte "text/html" del archivo');
}

// ── HTML → grilla rectangular (respeta colspan/rowspan) ─────────────────

interface RawCell {
  text: string;
  colspan: number;
  rowspan: number;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function tokenizeRawRows(html: string): RawCell[][] {
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*)?)\/?>/g;
  const rawRows: RawCell[][] = [];
  let curRow: RawCell[] | null = null;
  let cellText = "";
  let cellAttrs = "";
  let inCell = false;
  let tableDepth = 0;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(html)) !== null) {
    if (inCell) cellText += html.slice(lastIndex, m.index);
    lastIndex = tagRe.lastIndex;

    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? "";

    if (tag === "table") {
      tableDepth += closing ? -1 : 1;
      continue;
    }
    if (tableDepth <= 0) continue;

    if (tag === "tr") {
      if (!closing) curRow = [];
      else if (curRow) { rawRows.push(curRow); curRow = null; }
    } else if (tag === "td" || tag === "th") {
      if (!closing) {
        inCell = true;
        cellText = "";
        cellAttrs = attrs;
      } else if (inCell) {
        const colspan = Number(/colspan\s*=\s*"?(\d+)/i.exec(cellAttrs)?.[1] ?? "1") || 1;
        const rowspan = Number(/rowspan\s*=\s*"?(\d+)/i.exec(cellAttrs)?.[1] ?? "1") || 1;
        curRow?.push({ text: decodeHtmlEntities(cellText).replace(/\s+/g, " ").trim(), colspan, rowspan });
        inCell = false;
      }
    }
  }
  return rawRows;
}

function parseHtmlTableGrid(html: string): string[][] {
  const rawRows = tokenizeRawRows(html);
  const grid: string[][] = [];
  let pending: Record<number, { text: string; remaining: number }> = {};

  for (let r = 0; r < rawRows.length; r++) {
    const rowMap: Record<number, string> = {};
    const nextPending: Record<number, { text: string; remaining: number }> = {};

    for (const key of Object.keys(pending)) {
      const col = Number(key);
      const cell = pending[col];
      rowMap[col] = cell.text;
      if (cell.remaining > 1) nextPending[col] = { text: cell.text, remaining: cell.remaining - 1 };
    }

    let colIdx = 0;
    for (const cell of rawRows[r]) {
      while (colIdx in rowMap) colIdx++;
      for (let c = 0; c < cell.colspan; c++) {
        rowMap[colIdx + c] = cell.text;
        if (cell.rowspan > 1) nextPending[colIdx + c] = { text: cell.text, remaining: cell.rowspan - 1 };
      }
      colIdx += cell.colspan;
    }

    pending = nextPending;

    const usedCols = Object.keys(rowMap).map(Number);
    const maxCol = usedCols.length ? Math.max(...usedCols) : -1;
    const rowArr: string[] = [];
    for (let c = 0; c <= maxCol; c++) rowArr.push(rowMap[c] ?? "");
    grid.push(rowArr);
  }

  return grid;
}

// ── Detección de columnas por nombre de encabezado ───────────────────────

interface ColumnMap {
  clienteCodigo: number;
  clienteNombre: number;
  tipoCliente: number;
  esquemaAtencion: number;
  grupoVendedorCodigo: number;
  grupoVendedorNombre: number;
  materialCodigo: number;
  materialNombre: number;
  oficinaVenta: number;
  zonaVenta: number;
  fecha: number;
}

function indicesOf(normRow: string[], label: string): number[] {
  const out: number[] = [];
  normRow.forEach((v, i) => { if (v === label) out.push(i); });
  return out;
}

function findColumns(headerRow: string[]): ColumnMap | null {
  const norm = headerRow.map(normalizeHeader);
  // "Cliente (T)", "Grupo de Vendedores (N)" y "Material" aparecen dos
  // veces cada una (celda de encabezado combinada sobre código + nombre):
  // la primera ocurrencia es el código, la segunda el nombre.
  const cliente = indicesOf(norm, "clientet");
  const tipoCliente = indicesOf(norm, "tipodeclienten");
  const esquema = indicesOf(norm, "esquemadeatencionn");
  const grupoVendedores = indicesOf(norm, "grupodevendedoresn");
  const material = indicesOf(norm, "material");
  const oficinaVenta = indicesOf(norm, "areadeventasoficvtan");
  const zonaVenta = indicesOf(norm, "zonadeventasn");
  const fecha = indicesOf(norm, "fechadepedido");

  if (
    cliente.length < 2 ||
    tipoCliente.length < 1 ||
    esquema.length < 1 ||
    grupoVendedores.length < 2 ||
    material.length < 2 ||
    oficinaVenta.length < 1 ||
    zonaVenta.length < 1 ||
    fecha.length < 1
  ) {
    return null;
  }

  return {
    clienteCodigo: cliente[0],
    clienteNombre: cliente[1],
    tipoCliente: tipoCliente[0],
    esquemaAtencion: esquema[0],
    grupoVendedorCodigo: grupoVendedores[0],
    grupoVendedorNombre: grupoVendedores[1],
    materialCodigo: material[0],
    materialNombre: material[1],
    oficinaVenta: oficinaVenta[0],
    zonaVenta: zonaVenta[0],
    fecha: fecha[0],
  };
}

/** La fila de encabezados solo dice "KG" (unidad) en las columnas numéricas — el nombre de cada ratio vive en la fila de arriba. */
function findRatioColumns(ratioRow: string[]): { pedido: number; facturada: number } | null {
  const norm = ratioRow.map(normalizeHeader);
  const pedido = norm.indexOf("cantidadpedido");
  const facturada = norm.indexOf("cantidadfacturada");
  if (pedido < 0 || facturada < 0) return null;
  return { pedido, facturada };
}

// ── Parsing de valores ────────────────────────────────────────────────────

function parseSapDate(value: string): string | null {
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/** Números en formato latino: "2.054,40" (punto de miles, coma decimal). */
function parseLatinNumber(value: string | undefined): number {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
