import type { Metadata } from "next";
import { RadarCategoriaDropzone } from "@/components/admin/RadarCategoriaDropzone";

export const metadata: Metadata = { title: "Radar Margarina — Actual — Panquecitas" };

export default function RadarMargarinaActualPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Radar Margarina — Actual</h1>
        <p className="text-slate-500 mt-1">
          Reporte del mes vivo de Margarina (Mavesa), agosto en adelante. Alimenta SOLO el gráfico de barras de
          totales acumulados por ciudad. No toca ni Mayonesa ni el reporte &quot;Referencia&quot; de Margarina.
        </p>
      </div>
      <RadarCategoriaDropzone categoria="margarina" proposito="actual" />
    </div>
  );
}
