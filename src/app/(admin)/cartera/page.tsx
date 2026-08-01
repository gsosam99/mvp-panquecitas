import type { Metadata } from "next";
import { CarteraUploadClient } from "@/components/admin/CarteraUploadClient";

export const metadata: Metadata = { title: "Cartera de Clientes — Panquecitas" };

export default function CarteraPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Cartera de Clientes</h1>
        <p className="text-slate-500 mt-1">
          Importa/actualiza la maestra de clientes (Oficina de Ventas, Tipo de Cliente, Centro
          Poblado). Se usa para clasificar los PDV en los 2 sectores (Barquisimeto Este / Cumaná)
          y para las alertas del dashboard de Administrador.
        </p>
      </div>
      <CarteraUploadClient />
    </div>
  );
}
