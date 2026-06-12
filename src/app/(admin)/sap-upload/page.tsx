import type { Metadata } from "next";
import { SapUploadClient } from "@/components/admin/SapUploadClient";

export const metadata: Metadata = { title: "Carga SAP — Panquecitas" };

export default function SapUploadPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Carga SAP</h1>
        <p className="text-slate-500 mt-1">
          Importa el reporte de Sell-in de SAP. Aplica para Harina PAN y Panquecitas.
        </p>
      </div>
      <SapUploadClient />
    </div>
  );
}
