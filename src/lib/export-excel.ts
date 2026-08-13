// Generación de archivos .xlsx descargables desde el navegador.
//
// Usa la misma dependencia (exceljs) que el importador de Excel, cargada de
// forma diferida para que no entre en el bundle inicial del dashboard: solo
// se descarga cuando alguien pulsa "Exportar a Excel".

import { colLetter, injectChartIntoXlsx, type ExcelChartSeriesType } from "@/lib/export-excel-chart";

export interface ExcelColumn<T> {
  header: string;
  width?: number;
  value: (row: T) => string | number | null;
}

/** Descripción de un gráfico nativo (editable) a incrustar junto a los datos. */
export interface ExcelChartConfig {
  /** Índice (0-based) de la columna que va en el eje X (categorías). */
  categoryCol: number;
  /** Series a graficar, por índice de columna, con su tipo (barra o línea). */
  series: { col: number; type: ExcelChartSeriesType; name?: string }[];
  title?: string;
}

interface ExportOptions<T> {
  /** Nombre del archivo, sin extensión ni fecha (ambas se agregan solas). */
  filename: string;
  sheetName?: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  /** Si se pasa, además de los datos se incrusta un gráfico nativo editable. */
  chart?: ExcelChartConfig;
}

// Excel rechaza estos caracteres en el nombre de una hoja y la corta a 31.
function sanitizeSheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Datos";
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function downloadExcel<T>({ filename, sheetName, columns, rows, chart }: ExportOptions<T>): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const safeSheetName = sanitizeSheetName(sheetName ?? filename);
  const sheet = workbook.addWorksheet(safeSheetName);
  sheet.columns = columns.map((c, i) => ({
    header: c.header,
    key: `c${i}`,
    width: c.width ?? 28,
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  for (const row of rows) {
    sheet.addRow(columns.map((c) => c.value(row) ?? ""));
  }

  let buffer: ArrayBuffer | Uint8Array = (await workbook.xlsx.writeBuffer()) as ArrayBuffer | Uint8Array;

  // Gráfico nativo editable: se incrusta parcheando el zip del .xlsx. Si algo
  // falla, se descarga el archivo solo con datos (no se pierde la exportación).
  if (chart && rows.length > 0) {
    try {
      buffer = await injectChartIntoXlsx(buffer, {
        sheetName: safeSheetName,
        nDataRows: rows.length,
        categoryColLetter: colLetter(chart.categoryCol),
        categories: rows.map((r) => String(columns[chart.categoryCol].value(r) ?? "")),
        series: chart.series.map((s) => ({
          name: s.name ?? columns[s.col].header,
          type: s.type,
          colLetter: colLetter(s.col),
          values: rows.map((r) => {
            const v = columns[s.col].value(r);
            const n = typeof v === "number" ? v : Number(v);
            return Number.isFinite(n) ? n : 0;
          }),
        })),
        title: chart.title,
      });
    } catch (error) {
      console.error("[downloadExcel] no se pudo incrustar el gráfico; se exporta solo datos.", error);
    }
  }

  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename} — ${todayStamp()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
