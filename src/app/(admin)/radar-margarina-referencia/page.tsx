import type { Metadata } from "next";
import { RadarCategoriaDropzone } from "@/components/admin/RadarCategoriaDropzone";

export const metadata: Metadata = { title: "Radar Margarina — Referencia — Panquecitas" };

export default function RadarMargarinaReferenciaPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Radar Margarina — Referencia</h1>
        <p className="text-slate-500 mt-1">
          Reporte histórico de Margarina (Mavesa), mayo–julio. Alimenta SOLO el promedio del gráfico &quot;Rendimiento
          vs. Margarina/Mayonesa&quot; — el promedio usa el UNIVERSO completo del reporte, no solo los clientes de tu
          cartera del piloto. No toca ni Mayonesa ni el reporte &quot;Actual&quot; de Margarina.
        </p>
      </div>
      <RadarCategoriaDropzone categoria="margarina" proposito="referencia" />
    </div>
  );
}
