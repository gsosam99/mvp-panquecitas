import type { Metadata } from "next";
import { SellOutReportadoUploadClient } from "@/components/admin/SellOutReportadoUploadClient";

export const metadata: Metadata = { title: "Sell-Out Cadenas — Panquecitas" };

export default function SellOutCadenasPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Sell-Out Reportado por Cadenas</h1>
        <p className="text-slate-500 mt-1">
          Carga el volumen de Sell-Out que reportan directamente las Cadenas (Key Accounts), en vez de
          calcularlo con la fórmula estándar.
        </p>
      </div>
      <SellOutReportadoUploadClient />
    </div>
  );
}
