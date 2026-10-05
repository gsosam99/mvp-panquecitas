import type { Metadata } from "next";
import { FacturadoHpmDropzone } from "@/components/admin/FacturadoHpmDropzone";

export const metadata: Metadata = { title: "Facturado Harina PAN — Panquecitas" };

export default function FacturadoHpmPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Facturado Harina PAN</h1>
        <p className="text-slate-500 mt-1">
          Reporte SAP Pedidos y Facturado (N7_V_SD83_WEB_001) corrido para Harina PAN. Se guarda aparte del facturado
          de Panquecitas y solo alimenta el botón &quot;Facturado&quot; del gráfico &quot;Rendimiento Diario vs.
          Baseline de Harina PAN&quot; de DIENN y sus tarjetas por tramo. Cada carga reemplaza los meses que trae el
          archivo, así que se puede subir mes por mes (mayo a septiembre) o todo junto.
        </p>
      </div>
      <FacturadoHpmDropzone />
    </div>
  );
}
