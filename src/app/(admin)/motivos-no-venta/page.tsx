import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EfectividadDropzone } from "@/components/admin/EfectividadDropzone";
import { MotivosNoVentaTable } from "@/components/admin/MotivosNoVentaTable";
import { getMotivosNoVenta } from "@/lib/efectividad-queries";

export const metadata: Metadata = { title: "Motivos de No Venta — Panquecitas" };

export default async function MotivosNoVentaPage() {
  const rows = await getMotivosNoVenta();
  const noActivacion = rows.filter((r) => r.tipo === "NO_ACTIVACION");
  const noRecompra = rows.filter((r) => r.tipo === "NO_RECOMPRA");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Motivos de No Venta</h1>
        <p className="text-slate-500 mt-1">
          Carga el reporte SAP de Efectividad de Visita (N7_V_SD85) y analiza los motivos de no venta,
          diferenciando entre clientes por activar (nunca han facturado) y clientes por recomprar (ya
          facturaron antes). El cruce con la Cartera de Clientes aporta la ubicación geográfica.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cargar reporte de Efectividad de Visita (SAP)</CardTitle>
        </CardHeader>
        <CardContent>
          <EfectividadDropzone />
        </CardContent>
      </Card>

      <MotivosNoVentaTable
        title="Motivos de No Activación"
        description="Clientes que nunca han facturado y no compraron en esta visita."
        rows={noActivacion}
        exportName="Motivos No Activación"
      />

      <MotivosNoVentaTable
        title="Motivos de No Recompra"
        description="Clientes que ya facturaron antes pero no compraron en esta visita."
        rows={noRecompra}
        exportName="Motivos No Recompra"
      />
    </div>
  );
}
