"use client";

import { useState } from "react";

// Botón "Descargar reporte PDF": abre el diálogo de impresión, donde el
// destino "Guardar como PDF" genera el archivo. Los estilos de la lámina
// (A4 apaisado, qué se muestra y qué se oculta) están en globals.css y en
// las variantes `print:` de cada dashboard.
//
// Antes de imprimir se fija el ancho de la lámina en pantalla y se esperan
// dos frames: los gráficos de Recharts miden su contenedor con un
// ResizeObserver, así que necesitan un ciclo de layout para redibujarse al
// ancho de la hoja. Sin esta pausa salen recortados o con el ancho de la
// ventana del usuario.
export function ReportPrintButton({ label = "Descargar reporte PDF" }: { label?: string }) {
  const [preparing, setPreparing] = useState(false);

  async function handlePrint() {
    setPreparing(true);
    document.body.classList.add("preparing-print");

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    try {
      window.print();
    } finally {
      document.body.classList.remove("preparing-print");
      setPreparing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={preparing}
      className="shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors print:hidden"
    >
      <span aria-hidden>🖨️</span>
      {preparing ? "Preparando…" : label}
    </button>
  );
}
