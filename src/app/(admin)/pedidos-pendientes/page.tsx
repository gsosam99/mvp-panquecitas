import type { Metadata } from "next";
import { PendingOrdersUploadClient } from "@/components/admin/PendingOrdersUploadClient";

export const metadata: Metadata = { title: "Pedidos Pendientes — Panquecitas" };

export default function PedidosPendientesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pedidos Pendientes por Entregar</h1>
        <p className="text-slate-500 mt-1">
          Carga el reporte SAP de pedidos pendientes. Se muestra en el dashboard DIENN (PDV, ubicación y
          cantidad).
        </p>
      </div>
      <PendingOrdersUploadClient />
    </div>
  );
}
