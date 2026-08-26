import type { Metadata } from "next";
import { RadarCategoriaDropzone } from "@/components/admin/RadarCategoriaDropzone";

export const metadata: Metadata = { title: "Radar Mayonesa — Actual — Panquecitas" };

export default function RadarMayonesaActualPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Radar Mayonesa — Actual</h1>
        <p className="text-slate-500 mt-1">
          Reporte del mes vivo de Mayonesa (Mavesa), agosto en adelante. Alimenta SOLO el gráfico de barras de
          totales acumulados por ciudad. No toca ni Margarina ni el reporte &quot;Referencia&quot; de Mayonesa.
        </p>
      </div>
      <RadarCategoriaDropzone categoria="mayonesa" proposito="actual" />
    </div>
  );
}
