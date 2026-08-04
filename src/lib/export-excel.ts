// Generación de archivos .xlsx descargables desde el navegador.
//
// Usa la misma dependencia (exceljs) que el importador de Excel, cargada de
// forma diferida para que no entre en el bundle inicial del dashboard: solo
// se descarga cuando alguien pulsa "Exportar a Excel".

export interface ExcelColumn<T> {
  header: string;
  width?: number;
  value: (row: T) => string | number | null;
}

interface ExportOptions<T> {
  /** Nombre del archivo, sin extensión ni fecha (ambas se agregan solas). */
  filename: string;
  sheetName?: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

// Excel rechaza estos caracteres en el nombre de una hoja y la corta a 31.
function sanitizeSheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Datos";
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function downloadExcel<T>({ filename, sheetName, columns, rows }: ExportOptions<T>): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sanitizeSheetName(sheetName ?? filename));
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

  const buffer = await workbook.xlsx.writeBuffer();
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
