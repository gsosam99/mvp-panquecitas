import type { Metadata } from "next";
import { Radar3MDropzone } from "@/components/admin/Radar3MDropzone";

export const metadata: Metadata = { title: "Radar últimos 3 Meses — Panquecitas" };

export default function Radar3MPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Radar últimos 3 Meses</h1>
        <p className="text-slate-500 mt-1">
          Reportes Radar de Harina PAN de referencia: mayo–julio y agosto–septiembre. Se guardan aparte de la Carga
          Radar del piloto y solo alimentan los promedios de PAN de DIENN: mayo–julio para los gráficos de rendimiento
          diario, y los tres baselines (May–Jul, Ago–Sep y Jul–Sep) del gráfico &quot;Rendimiento Diario vs. Baseline
          de Harina PAN&quot;. Cada carga reemplaza solo los meses que trae el archivo.
        </p>
      </div>
      <Radar3MDropzone />
    </div>
  );
}
