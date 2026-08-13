// Generación de archivos .xlsx descargables desde el navegador.
//
// Usa la misma dependencia (exceljs) que el importador de Excel, cargada de
// forma diferida para que no entre en el bundle inicial del dashboard: solo
// se descarga cuando alguien pulsa "Exportar a Excel".

import {
  colLetter,
  injectChartIntoXlsx,
  injectChartsIntoXlsx,
  type ExcelChartSeriesType,
  type InjectChartOptions,
} from "@/lib/export-excel-chart";

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

  triggerBrowserDownload(buffer, `${filename} — ${todayStamp()}.xlsx`);
}

function triggerBrowserDownload(buffer: ArrayBuffer | Uint8Array, downloadName: string): void {
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Una hoja del libro multi-hoja: sus datos y (opcional) su gráfico nativo. */
export interface ExcelSheetSpec<T> {
  sheetName: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  chart?: ExcelChartConfig;
}

/**
 * Descarga UN solo .xlsx con varias hojas (una por gráfico). Cada hoja lleva
 * sus datos y, si se especifica, su gráfico nativo editable. Si la inyección de
 * gráficos falla, se descarga el libro solo con datos (no se pierde nada).
 */
export async function downloadExcelWorkbook(filename: string, sheets: ExcelSheetSpec<unknown>[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const usedNames = new Set<string>();
  const built: { safeName: string; spec: ExcelSheetSpec<unknown> }[] = [];

  for (const spec of sheets) {
    // Excel no permite dos hojas con el mismo nombre (case-insensitive).
    const base = sanitizeSheetName(spec.sheetName);
    let name = base;
    let k = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = `${base.slice(0, 27)} (${k})`;
      k++;
    }
    usedNames.add(name.toLowerCase());

    const sheet = workbook.addWorksheet(name);
    sheet.columns = spec.columns.map((c, i) => ({ header: c.header, key: `c${i}`, width: c.width ?? 28 }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
    for (const row of spec.rows) sheet.addRow(spec.columns.map((c) => c.value(row) ?? ""));
    built.push({ safeName: name, spec });
  }

  let buffer: ArrayBuffer | Uint8Array = (await workbook.xlsx.writeBuffer()) as ArrayBuffer | Uint8Array;

  const chartEntries: InjectChartOptions[] = built
    .filter((b) => b.spec.chart && b.spec.rows.length > 0)
    .map(({ safeName, spec }) => {
      const chart = spec.chart!;
      return {
        sheetName: safeName,
        nDataRows: spec.rows.length,
        categoryColLetter: colLetter(chart.categoryCol),
        categories: spec.rows.map((r) => String(spec.columns[chart.categoryCol].value(r) ?? "")),
        series: chart.series.map((s) => ({
          name: s.name ?? spec.columns[s.col].header,
          type: s.type,
          colLetter: colLetter(s.col),
          values: spec.rows.map((r) => {
            const v = spec.columns[s.col].value(r);
            const n = typeof v === "number" ? v : Number(v);
            return Number.isFinite(n) ? n : 0;
          }),
        })),
        title: chart.title,
      };
    });

  if (chartEntries.length > 0) {
    try {
      buffer = await injectChartsIntoXlsx(buffer, chartEntries);
    } catch (error) {
      console.error("[downloadExcelWorkbook] no se pudieron incrustar los gráficos; se exporta solo datos.", error);
    }
  }

  triggerBrowserDownload(buffer, `${filename} — ${todayStamp()}.xlsx`);
}
