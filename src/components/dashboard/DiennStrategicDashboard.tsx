import {
  getConversionDegustaciones,
  getModeloEscalamiento,
  getPedidoPromedioPorSegmento,
  getPenetracionMercado,
  getTiempoPromedioRecompra,
  getVolumenVendidoPorCluster,
} from "@/lib/dienn-queries";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PedidoPromedioChart } from "@/components/dashboard/PedidoPromedioChart";
import { VolumenClusterChart } from "@/components/dashboard/VolumenClusterChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function ClusterBar({
  label,
  compradores,
  universo,
  pct,
}: {
  label: string;
  compradores: number;
  universo: number;
  pct: number;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <p className="text-sm text-slate-700 font-medium">{label}</p>
        <div className="text-right">
          <span className="text-sm font-bold text-slate-900">{pct}%</span>
          <span className="text-xs text-slate-400 ml-1">
            ({compradores}/{universo})
          </span>
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-panquecitas rounded-full transition-all"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export async function DiennStrategicDashboard() {
  const [penetracion, pedidoPromedio, recompraDias, volumenCluster, degustaciones, escalamiento] =
    await Promise.all([
      getPenetracionMercado(),
      getPedidoPromedioPorSegmento(),
      getTiempoPromedioRecompra(),
      getVolumenVendidoPorCluster(),
      getConversionDegustaciones(),
      getModeloEscalamiento(),
    ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Estratégico — DIENN</h1>
        <p className="text-slate-500 mt-1">
          Penetración, rotación y modelo de escalamiento nacional
        </p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <KpiCard
          title="Penetración de Mercado"
          value={`${penetracion.pct}%`}
          subtitle={`${penetracion.compradores} de ${penetracion.universo} PDVs del universo`}
          product="panquecitas"
        />
        <KpiCard
          title="Tiempo Promedio de Recompra"
          value={`${recompraDias} días`}
          subtitle="Entre 1er pedido y recompras"
          product="panquecitas"
        />
        <KpiCard
          title="Tasa de Conversión — Degustaciones"
          value={`${degustaciones.rate}%`}
          subtitle={`${degustaciones.conversions} de ${degustaciones.samples} muestras`}
          product="panquecitas"
        />
      </div>

      <Separator className="mb-6" />

      {/* ── Modelo de Escalamiento ─────────────────────────────────────── */}
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-slate-900">
          Modelo de Escalamiento — Panquecitas vs HMP
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Universo de PDVs en clusters piloto (Cumaná/Marigüitar/Güirintal y Cabudare)
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Panquecitas / HMP Universo"
          value={`${escalamiento.panquecitasUniverseKg.toLocaleString("es-VE")} / ${escalamiento.hmpUniverseKg.toLocaleString("es-VE")} kg`}
          subtitle="Volumen capturado vs categoría total"
          product="both"
        />
        <KpiCard
          title="Volumen HMP No Convertido"
          value={`${escalamiento.volumenOportunidadKg.toLocaleString("es-VE")} kg`}
          subtitle={`${escalamiento.pctOportunidadHmp}% del universo HMP`}
          critical={escalamiento.pctOportunidadHmp > 50}
        />
        <KpiCard
          title="% Penetración Real de Volumen"
          value={`${escalamiento.pctPenetracionReal}%`}
          subtitle="Panquecitas sobre HMP del universo"
          product="panquecitas"
        />
        <KpiCard
          title="% Eficiencia de Cobertura"
          value={`${escalamiento.pctEficienciaPdvs}%`}
          subtitle={`${escalamiento.compradores} de ${escalamiento.totalUniverso} PDVs con compra`}
          product="panquecitas"
        />
      </div>

      {/* Penetración por cluster */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Penetración por cluster</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ClusterBar
            label="Cumaná / Marigüitar / Güirintal"
            compradores={penetracion.cumana.compradores}
            universo={penetracion.cumana.universo}
            pct={penetracion.cumana.pct}
          />
          <ClusterBar
            label="Cabudare"
            compradores={penetracion.cabudare.compradores}
            universo={penetracion.cabudare.universo}
            pct={penetracion.cabudare.pct}
          />
        </CardContent>
      </Card>

      <Separator className="mb-6" />

      {/* ── Sell-in y ticket promedio ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Volumen vendido (Sell-In) por cluster</CardTitle>
          </CardHeader>
          <CardContent>
            {volumenCluster.length > 0 ? (
              <VolumenClusterChart data={volumenCluster} />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <p className="text-4xl mb-2">📊</p>
                  <p>Sin datos de Sell-in. Carga el reporte SAP.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pedido promedio por segmento</CardTitle>
          </CardHeader>
          <CardContent>
            {pedidoPromedio.length > 0 ? (
              <PedidoPromedioChart data={pedidoPromedio} />
            ) : (
              <div className="h-[260px] flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <p className="text-4xl mb-2">🧾</p>
                  <p>Sin pedidos de Panquecitas registrados aún.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
