import type { Metadata } from "next";
import { RadarCategoriaDropzone } from "@/components/admin/RadarCategoriaDropzone";

export const metadata: Metadata = { title: "Radar Mayonesa — Referencia — Panquecitas" };

export default function RadarMayonesaReferenciaPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Radar Mayonesa — Referencia</h1>
        <p className="text-slate-500 mt-1">
          Reporte histórico de Mayonesa (Mavesa), mayo–julio. Alimenta SOLO el promedio del gráfico &quot;Rendimiento
          vs. Margarina/Mayonesa&quot;. No toca ni Margarina ni el reporte &quot;Actual&quot; de Mayonesa.
        </p>
      </div>
      <RadarCategoriaDropzone categoria="mayonesa" proposito="referencia" />
    </div>
  );
}
