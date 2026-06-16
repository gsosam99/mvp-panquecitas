import type { Metadata } from "next";
import {
  getKpiData,
  getMonthlySellIn,
  getPriceTrend,
  getPromotoraDailyActivity,
  getConversionByLocation,
} from "@/lib/kpi-queries";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SellInChart } from "@/components/dashboard/SellInChart";
import { PriceTrendChart } from "@/components/dashboard/PriceTrendChart";
import { PromotoraActivityChart } from "@/components/dashboard/PromotoraActivityChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Dashboard — Panquecitas" };
export const revalidate = 300;

export default async function DashboardPage() {
  const [kpis, monthlyData, priceTrend, promotoraDaily, conversionByLoc] =
    await Promise.all([
      getKpiData(),
      getMonthlySellIn(12),
      getPriceTrend(30),
      getPromotoraDailyActivity(30),
      getConversionByLocation(),
    ]);

  const maxConvRate = Math.max(...conversionByLoc.map((l) => l.rate), 1);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Desempeño acumulado del MVP</p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard
          title="% Relativo vs PAN"
          value={`${kpis.relativePct}%`}
          subtitle="Panquecitas / Harina PAN (Sell-in kg)"
          product="both"
        />
        <KpiCard
          title="Sell-in Panquecitas"
          value={`${kpis.panquecitasSellInKg.toLocaleString("es-VE")} kg`}
          subtitle="Total acumulado SAP"
          product="panquecitas"
        />
        <KpiCard
          title="Sell-in Harina PAN"
          value={`${kpis.panSellInKg.toLocaleString("es-VE")} kg`}
          subtitle="Benchmark SAP"
          product="pan"
        />
        <KpiCard
          title="Inventario anaquel"
          value={`${kpis.panquecitasInventoryKg.toLocaleString("es-VE")} kg`}
          subtitle="Panquecitas auditado"
          product="panquecitas"
        />
        <KpiCard
          title="Tasa de conversión"
          value={`${kpis.conversionRate}%`}
          subtitle={`${kpis.promotoraConversions} de ${kpis.promotoraSamples} muestras`}
          product="panquecitas"
        />
      </div>

      <Separator className="mb-6" />

      {/* ── Sell-in tendencia ──────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Sell-in mensual — Harina PAN vs Panquecitas</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData.length > 0 ? (
            <SellInChart data={monthlyData} />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📊</p>
                <p>Sin datos de Sell-in. Carga el primer Excel SAP.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="mb-6" />

      {/* ── Mercaderistas ──────────────────────────────────────────────── */}
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-slate-900">Mercaderistas — Auditorías de campo</h2>
        <p className="text-sm text-slate-400 mt-0.5">Últimos 30 días</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Precio promedio en anaquel (USD)</CardTitle>
        </CardHeader>
        <CardContent>
          {priceTrend.length > 0 ? (
            <PriceTrendChart data={priceTrend} />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">🏷️</p>
                <p>Sin auditorías de anaquel aún.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="mb-6" />

      {/* ── Promotoras ─────────────────────────────────────────────────── */}
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-slate-900">Promotoras — Actividad promocional</h2>
        <p className="text-sm text-slate-400 mt-0.5">Últimos 30 días</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Daily activity chart */}
        <Card>
          <CardHeader>
            <CardTitle>Muestras vs Compras por día</CardTitle>
          </CardHeader>
          <CardContent>
            {promotoraDaily.length > 0 ? (
              <PromotoraActivityChart data={promotoraDaily} />
            ) : (
              <div className="h-[260px] flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <p className="text-4xl mb-2">🥞</p>
                  <p>Sin actividad promocional aún.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion by location */}
        <Card>
          <CardHeader>
            <CardTitle>Conversión por localidad</CardTitle>
          </CardHeader>
          <CardContent>
            {conversionByLoc.length > 0 ? (
              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {conversionByLoc.map((loc) => (
                  <div key={loc.location}>
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm text-slate-700 font-medium truncate max-w-[65%]">
                        {loc.location}
                      </p>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-slate-900">
                          {loc.rate}%
                        </span>
                        <span className="text-xs text-slate-400 ml-1">
                          ({loc.conversions}/{loc.samples})
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-panquecitas rounded-full transition-all"
                        style={{ width: `${(loc.rate / maxConvRate) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <p className="text-4xl mb-2">📍</p>
                  <p>Sin datos de conversión por localidad.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Promotoras totals */}
      <Card>
        <CardHeader>
          <CardTitle>Totales acumulados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-slate-900">
                {kpis.promotoraSamples.toLocaleString("es-VE")}
              </p>
              <p className="text-sm text-slate-400 mt-1">Muestras entregadas</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">
                {kpis.promotoraConversions.toLocaleString("es-VE")}
              </p>
              <p className="text-sm text-slate-400 mt-1">Compras confirmadas</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-panquecitas">{kpis.conversionRate}%</p>
              <p className="text-sm text-slate-400 mt-1">Tasa de conversión</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
