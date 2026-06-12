import type { ParsedSapRow, ParseError, SapParseResult } from "@/types";

const REQUIRED_COLUMNS = ["sap_code", "variant_name", "quantity", "date_of_sale"];

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "string") {
    const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) return value;
    const dmyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    // Excel serial date
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  return null;
}

export async function parseSapExcel(buffer: ArrayBuffer): Promise<SapParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { valid: [], errors: [{ row: 0, field: "file", message: "El archivo no contiene hojas." }] };
  }

  // Map header names to column indices (1-based)
  const headers: Record<string, number> = {};
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value ?? "").trim().toLowerCase();
    if (val) headers[val] = colNumber;
  });

  if (worksheet.rowCount <= 1) {
    return { valid: [], errors: [{ row: 0, field: "file", message: "La hoja está vacía." }] };
  }

  const missingCols = REQUIRED_COLUMNS.filter((col) => !(col in headers));
  if (missingCols.length > 0) {
    return {
      valid: [],
      errors: [
        {
          row: 0,
          field: "columnas",
          message: `Columnas faltantes: ${missingCols.join(", ")}. Columnas requeridas: ${REQUIRED_COLUMNS.join(", ")}`,
        },
      ],
    };
  }

  const valid: ParsedSapRow[] = [];
  const errors: ParseError[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const rawSapCode = row.getCell(headers["sap_code"]).value;
    const rawVariantName = row.getCell(headers["variant_name"]).value;
    const rawQty = row.getCell(headers["quantity"]).value;
    const rawDate = row.getCell(headers["date_of_sale"]).value;

    const sap_code = String(rawSapCode ?? "").trim();
    const variant_name = String(rawVariantName ?? "").trim();
    const date_of_sale = normalizeDate(rawDate);

    if (!sap_code) {
      errors.push({ row: rowNumber, field: "sap_code", message: "Código SAP vacío." });
      return;
    }
    if (!variant_name) {
      errors.push({ row: rowNumber, field: "variant_name", message: "Nombre de variante vacío." });
      return;
    }
    const quantity = Number(rawQty);
    if (isNaN(quantity) || quantity <= 0) {
      errors.push({ row: rowNumber, field: "quantity", message: `Cantidad inválida: "${rawQty}".` });
      return;
    }
    if (!date_of_sale) {
      errors.push({ row: rowNumber, field: "date_of_sale", message: `Fecha inválida: "${rawDate}". Use YYYY-MM-DD o DD/MM/YYYY.` });
      return;
    }

    valid.push({ sap_code, variant_name, quantity, date_of_sale });
  });

  return { valid, errors };
}
