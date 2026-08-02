import type { Metadata } from "next";
import { DispatchesUploadClient } from "@/components/admin/DispatchesUploadClient";

export const metadata: Metadata = { title: "Despachos SAP — Panquecitas" };

export default function DespachosPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Despachos SAP</h1>
        <p className="text-slate-500 mt-1">
          Carga el reporte de despachos/facturas con fecha real por cliente. Distinto del reporte mensual de
          "Carga SAP" — este alimenta el motor de Sell-Out en DIENN.
        </p>
      </div>
      <DispatchesUploadClient />
    </div>
  );
}
