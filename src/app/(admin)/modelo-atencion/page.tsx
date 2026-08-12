import type { Metadata } from "next";
import { ModeloUploadClient } from "@/components/admin/ModeloUploadClient";

export const metadata: Metadata = { title: "Modelo de Atención — Panquecitas" };

export default function ModeloAtencionPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Modelo de Atención</h1>
        <p className="text-slate-500 mt-1">
          Asigna Directo / Indirecto a cada cliente de la cartera (cruzando por código SAP) desde el maestro SAP
          N7_V_SD56 (.xls MHTML) y/o el maestro de indirectos de la distribuidora (.xlsx). Alimenta los gráficos de
          cartera por ciudad y modelo, y el umbral de Stock Out.
        </p>
      </div>
      <ModeloUploadClient />
    </div>
  );
}
