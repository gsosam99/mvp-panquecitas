"use client";

import { useState } from "react";
import { toast } from "sonner";
import { downloadExcel, type ExcelColumn, type ExcelChartConfig } from "@/lib/export-excel";

interface ExportExcelButtonProps<T> {
  /** Nombre del archivo, sin extensión ni fecha. */
  filename: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  /** Por defecto muestra "Exportar a Excel (n)". */
  label?: string;
  className?: string;
  /** Si se pasa, el .xlsx incluye además un gráfico nativo editable. */
  chart?: ExcelChartConfig;
}

export function ExportExcelButton<T>({ filename, columns, rows, label, className, chart }: ExportExcelButtonProps<T>) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadExcel({ filename, sheetName: filename, columns, rows, chart });
    } catch (error) {
      console.error("[ExportExcelButton]", filename, error);
      toast.error("No se pudo generar el archivo de Excel.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={exporting || rows.length === 0}
      className={`shrink-0 px-3 py-2 text-sm font-semibold rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 disabled:hover:bg-emerald-50 transition-colors print:hidden ${
        className ?? ""
      }`}
    >
      {exporting ? "Generando…" : label ?? `Exportar a Excel (${rows.length})`}
    </button>
  );
}
