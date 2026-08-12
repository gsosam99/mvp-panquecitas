import type { Metadata } from "next";
import { ModeloUploadClient } from "@/components/admin/ModeloUploadClient";

export const metadata: Metadata = { title: "Plan de Visita — Panquecitas" };

export default function ModeloAtencionPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Plan de Visita</h1>
        <p className="text-slate-500 mt-1">
          Carga el plan de visita (qué días de la semana toca visitar a cada cliente) desde el maestro SAP N7_V_SD56
          (.xls MHTML) y/o el maestro de indirectos de la distribuidora (.xlsx), cruzando por código SAP. Es el
          denominador de la tasa de efectividad. El modelo (Directo / Indirecto / Mixto) viene de la Cartera de Clientes.
        </p>
      </div>
      <ModeloUploadClient />
    </div>
  );
}
