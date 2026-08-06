import type { Metadata } from "next";
import { SapUploadClient } from "@/components/admin/SapUploadClient";

export const metadata: Metadata = { title: "Pedidos y Facturado — Panquecitas" };

export default function PedidosPendientesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pedidos y Facturado</h1>
        <p className="text-slate-500 mt-1">
          Carga el reporte de pedidos y facturación de Panquecitas (clientes que hicieron pedidos y a nombre de
          quién se facturó). Alimenta los volúmenes facturado/pedido — no determina el universo de clientes
          reales (eso lo define Carga Radar cruzado con la Cartera de Clientes), porque este reporte incluye
          distribuidoras intermediarias que no son puntos de venta finales.
        </p>
      </div>
      <SapUploadClient mode="facturacion" />
    </div>
  );
}
