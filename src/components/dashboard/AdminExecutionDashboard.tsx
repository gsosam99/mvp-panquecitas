import {
  getAgotadosDeposito,
  getCarasFrontalesBajas,
  getCoberturaMercaderista,
  getDesviacionPvp,
  getIndiceTiendaIdeal,
  getMaterialPopFaltante,
} from "@/lib/admin-queries";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { IndicatorTable, type IndicatorTableRow } from "@/components/dashboard/IndicatorTable";
import { DemoModeToggle } from "@/components/dashboard/DemoModeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Location } from "@/types";

function toRow(location: Location, extra?: React.ReactNode): IndicatorTableRow {
  return {
    id: location.id,
    sapCode: location.sap_code,
    name: location.name,
    centroPoblado: location.centro_poblado,
    tipoCliente: location.tipo_cliente ?? location.type,
    extra,
  };
}

// TODO(demo): quitar el prop demoMode (y su paso a las queries) cuando haya
// datos reales de SAP — ver src/lib/admin-queries.ts.
export async function AdminExecutionDashboard({ demoMode = false }: { demoMode?: boolean }) {
  const [cobertura, materialPop, agotados, carasFrontales, desviacionPvp, indiceTiendaIdeal] =
    await Promise.all([
      getCoberturaMercaderista(demoMode),
      getMaterialPopFaltante(demoMode),
      getAgotadosDeposito(demoMode),
      getCarasFrontalesBajas(demoMode),
      getDesviacionPvp(demoMode),
      getIndiceTiendaIdeal(demoMode),
    ]);

  const coberturaPct =
    cobertura.total > 0 ? Math.round((cobertura.visitados / cobertura.total) * 100 * 10) / 10 : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard de Ejecución</h1>
        <p className="text-slate-500 mt-1">
          Auditoría y control de ejecución en punto de venta
        </p>
      </div>

      <DemoModeToggle demoMode={demoMode} />

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Cobertura Mercaderista"
          value={`${coberturaPct}%`}
          subtitle={`${cobertura.visitados} de ${cobertura.total} PDVs visitados`}
        />
        <KpiCard
          title="Índice Tienda Ideal"
          value={`${indiceTiendaIdeal.pct}%`}
          subtitle={`${indiceTiendaIdeal.cumplen} de ${indiceTiendaIdeal.total} PDVs (clusters piloto)`}
        />
        <KpiCard
          title="Sin Material POP"
          value={String(materialPop.length)}
          subtitle="PDVs compradores sin POP"
        />
        <KpiCard
          title="Agotados en Depósito"
          value={String(agotados.length)}
          subtitle="Stock = 0 con acceso a depósito"
          critical={agotados.length > 0}
        />
      </div>

      <Separator className="mb-6" />

      {/* ── Cobertura ──────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Cobertura Mercaderista — Falta por visitar</CardTitle>
        </CardHeader>
        <CardContent>
          <IndicatorTable
            rows={cobertura.faltantes.map((l) => toRow(l))}
            emptyMessage="Todos los PDVs compradores han sido visitados."
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Material POP */}
        <Card>
          <CardHeader>
            <CardTitle>Material POP — Lista roja</CardTitle>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={materialPop.map((l) => toRow(l))}
              emptyMessage="Todos los PDVs compradores tienen material POP."
            />
          </CardContent>
        </Card>

        {/* Agotados */}
        <Card>
          <CardHeader>
            <CardTitle>Agotados en Depósito</CardTitle>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={agotados.map((l) => toRow(l))}
              emptyMessage="Sin PDVs agotados en depósito."
            />
          </CardContent>
        </Card>
      </div>

      {/* Caras frontales */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Caras Frontales bajas (&lt; 2)</CardTitle>
        </CardHeader>
        <CardContent>
          <IndicatorTable
            rows={carasFrontales.map((r) =>
              toRow(
                r.location,
                <Badge variant="destructive">{r.frontFaces} caras</Badge>
              )
            )}
            extraLabel="Caras frontales"
            emptyMessage="Ningún PDV comprador tiene menos de 2 caras frontales."
          />
        </CardContent>
      </Card>

      {/* Desviación PVP */}
      <Card>
        <CardHeader>
          <CardTitle>Desviación de PVP (400g / 800g)</CardTitle>
        </CardHeader>
        <CardContent>
          <IndicatorTable
            rows={desviacionPvp.map((r) =>
              toRow(
                r.location,
                <div className="flex gap-1.5">
                  <Badge variant={r.deviated04 ? "destructive" : "outline"}>
                    400g: {r.price04 !== null ? `$${r.price04.toFixed(2)}` : "s/d"} (obj. $
                    {r.target04.toFixed(2)})
                  </Badge>
                  <Badge variant={r.deviated08 ? "destructive" : "outline"}>
                    800g: {r.price08 !== null ? `$${r.price08.toFixed(2)}` : "s/d"} (obj. $
                    {r.target08.toFixed(2)})
                  </Badge>
                </div>
              )
            )}
            extraLabel="Precios"
            emptyMessage="Sin desviaciones de PVP en los clusters piloto."
          />
        </CardContent>
      </Card>
    </div>
  );
}
