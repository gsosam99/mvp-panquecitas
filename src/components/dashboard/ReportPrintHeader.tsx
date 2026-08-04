"use client";

import { useEffect, useState } from "react";

// Encabezado que solo aparece en el PDF: identifica de qué dashboard salió
// la lámina, con qué filtros y en qué fecha, porque el reporte se envía por
// fuera de la app a quien tiene que corregir las incidencias.
export function ReportPrintHeader({
  title,
  subtitle,
  filtros,
}: {
  title: string;
  subtitle: string;
  filtros: string[];
}) {
  // La fecha se resuelve después de montar: el servidor renderiza en UTC y
  // el navegador en la zona local, y cerca de medianoche eso daba dos fechas
  // distintas (error de hidratación). Solo se imprime después de montar, así
  // que el hueco inicial no se ve nunca en el PDF.
  const [generado, setGenerado] = useState("");

  useEffect(() => {
    setGenerado(
      new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "long", year: "numeric" })
    );
  }, []);

  return (
    <div className="hidden print:block mb-4 pb-3 border-b-2 border-slate-900">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Panquecitas · Empresas Polar</p>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">{title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-500">{generado && `Generado el ${generado}`}</p>
          <p className="text-xs font-semibold text-slate-700 mt-0.5">{filtros.join(" · ")}</p>
        </div>
      </div>
    </div>
  );
}
