import type { ParsedSapRow, ParseError, SapParseResult } from "@/types";

const MONTH_ES: Record<string, string> = {
  ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
  JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12",
};

type LocationType = "SUPERMERCADO" | "ABASTO" | "BODEGA" | "OTRO";

function mapLocationType(raw: string): LocationType {
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
