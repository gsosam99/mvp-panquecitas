import type { Metadata } from "next";
import { getKpiData, getWeeklySellIn } from "@/lib/kpi-queries";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SellInChart } from "@/components/dashboard/SellInChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Dashboard — Panquecitas" };
export const revalidate = 300; // revalidar cada 5 min

export default async function DashboardPage() {
  const [kpis, weeklyData] = await Promise.all([
    getKpiData(),
    getWeeklySellIn(8),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Desempeño acumulado del MVP</p>
      </div>

      {/* KPI Cards — fila principal */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="col-span-2 md:col-span-1 lg:col-span-2">
          <KpiCard
            title="% Relativo vs PAN"
            value={`${kpis.relativePct}%`}
            subtitle="Panquecitas / Harina PAN (Sell-in kg)"
            highlight
          />
        </div>
        <KpiCard
          title="Sell-in Panquecitas"
          value={`${kpis.panquecitasSellInKg.toLocaleString("es-VE")} kg`}
          subtitle="Total acumulado SAP"
        />
        <KpiCard
          title="Sell-in Harina PAN"
          value={`${kpis.panSellInKg.toLocaleString("es-VE")} kg`}
          subtitle="Benchmark SAP"
        />
        <KpiCard
          title="Inventario anaquel"
          value={`${kpis.panquecitasInventoryKg.toLocaleString("es-VE")} kg`}
          subtitle="Panquecitas en auditorías"
        />
        <KpiCard
          title="Tasa de conversión"
          value={`${kpis.conversionRate}%`}
          subtitle={`${kpis.promotoraConversions} de ${kpis.promotoraSamples} muestras`}
        />
      </div>

      <Separator className="mb-6" />

      {/* Gráfico de tendencia */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Sell-in semanal — Harina PAN vs Panquecitas</CardTitle>
        </CardHeader>
        <CardContent>
          {weeklyData.length > 0 ? (
            <SellInChart data={weeklyData} />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📊</p>
                <p>Sin datos de Sell-in aún. Carga el primer Excel SAP para ver la tendencia.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen de actividad promotoras */}
      <Card>
        <CardHeader>
          <CardTitle>Actividad Promotoras</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-slate-900">{kpis.promotoraSamples}</p>
              <p className="text-sm text-slate-400 mt-1">Muestras entregadas</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">{kpis.promotoraConversions}</p>
              <p className="text-sm text-slate-400 mt-1">Compras confirmadas</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-amber-600">{kpis.conversionRate}%</p>
              <p className="text-sm text-slate-400 mt-1">Tasa de conversión</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
