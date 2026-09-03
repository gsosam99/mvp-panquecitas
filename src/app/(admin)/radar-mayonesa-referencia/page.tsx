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
          vs. Margarina/Mayonesa&quot;. El promedio es <strong>solo de los clientes de tu cartera</strong>: las filas
          de PDV que no están en la cartera del piloto se descartan al cargar, y el resumen de la carga te dice
          cuántos fueron. La suma de los 3 meses de esos clientes ÷ 63 días hábiles es el promedio. No toca ni Margarina ni el reporte &quot;Actual&quot; de Mayonesa.
        </p>
      </div>
      <RadarCategoriaDropzone categoria="mayonesa" proposito="referencia" />
    </div>
  );
}
