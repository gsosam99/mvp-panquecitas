import type { Metadata } from "next";
import { SapUploadClient } from "@/components/admin/SapUploadClient";

export const metadata: Metadata = { title: "Carga Radar — Panquecitas" };

export default function SapUploadPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Carga Radar</h1>
        <p className="text-slate-500 mt-1">
          Importa el reporte Radar de SAP: lo real despachado a los clientes, acumulado en lo que va del mes.
          Aplica para Harina PAN y Panquecitas — define el universo de clientes reales (cruzado con la Cartera de
          Clientes).
        </p>
      </div>
      <SapUploadClient mode="radar" />
    </div>
  );
}
