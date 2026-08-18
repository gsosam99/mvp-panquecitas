import type { Metadata } from "next";
import { Radar3MDropzone } from "@/components/admin/Radar3MDropzone";

export const metadata: Metadata = { title: "Radar últimos 3 Meses — Panquecitas" };

export default function Radar3MPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Radar últimos 3 Meses</h1>
        <p className="text-slate-500 mt-1">
          Reporte Radar histórico de Harina PAN (mayo–julio). Se guarda aparte de la Carga Radar del piloto y solo
          alimenta el gráfico &quot;Rendimiento Diario vs. Promedio Histórico&quot; de DIENN: de aquí sale el promedio
          de ventas diarias de PAN contra el que se compara la venta de Panquecitas.
        </p>
      </div>
      <Radar3MDropzone />
    </div>
  );
}
