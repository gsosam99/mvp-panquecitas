import {
  getAgotadosDeposito,
  getCarasFrontalesBajas,
  getCoberturaMaterialPop,
  getCoberturaMercaderista,
  getDesviacionPvp,
  getIndiceTiendaPerfecta,
} from "@/lib/admin-queries";
import { sectorGroup, SECTOR_LABELS } from "@/lib/universe";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { IndicatorTable, type IndicatorTableRow } from "@/components/dashboard/IndicatorTable";
import { DemoModeToggle } from "@/components/dashboard/DemoModeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Location } from "@/types";

function sectorLabel(location: Location): string | null {
  const sector = sectorGroup(location.oficina_venta);
  return sector ? SECTOR_LABELS[sector] : location.oficina_venta;
}

function toRow(location: Location, extra?: React.ReactNode): IndicatorTableRow {
  return {
    id: location.id,
    sapCode: location.sap_code,
    name: location.name,
    sector: sectorLabel(location),
    tipoCliente: location.tipo_cliente ?? location.type,
    extra,
  };
}

// TODO(demo): quitar el prop demoMode (y su paso a las queries) cuando haya
// datos reales de SAP — ver src/lib/admin-queries.ts.
export async function AdminExecutionDashboard({ demoMode = false }: { demoMode?: boolean }) {
  const [cobertura, materialPop, agotados, carasFrontales, desviacionPvp, tiendaPerfecta] = await Promise.all([
    getCoberturaMercaderista(demoMode),
    getCoberturaMaterialPop(demoMode),
    getAgotadosDeposito(demoMode),
    getCarasFrontalesBajas(demoMode),
    getDesviacionPvp(demoMode),
    getIndiceTiendaPerfecta(demoMode),
  ]);

  const coberturaPct =
    cobertura.total > 0 ? Math.round((cobertura.visitados / cobertura.total) * 100 * 10) / 10 : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard de Ejecución</h1>
        <p className="text-slate-500 mt-1">Auditoría y control de ejecución en punto de venta</p>
      </div>

      <DemoModeToggle demoMode={demoMode} />

      {/* ── KPI Cards (resumen de los bloques) ───────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Índice Tienda Perfecta"
          value={`${tiendaPerfecta.pct}%`}
          subtitle={`${tiendaPerfecta.cumplen} de ${tiendaPerfecta.total} PDVs (sectores piloto)`}
        />
        <KpiCard
          title="% Cobertura Material POP"
          value={`${materialPop.pct}%`}
          subtitle={`${materialPop.conPop} de ${materialPop.total} PDVs visitados`}
        />
        <KpiCard
          title="Cobertura Mercaderista"
          value={`${coberturaPct}%`}
          subtitle={`${cobertura.visitados} de ${cobertura.total} PDVs visitados`}
        />
        <KpiCard
          title="Agotados en Depósito"
          value={String(agotados.length)}
          subtitle="Stock = 0 con acceso a depósito"
          critical={agotados.length > 0}
        />
      </div>

      <Separator className="mb-6" />

      {/* ══════════════════ BLOQUE 1: EJECUCIÓN ══════════════════ */}
      <h2 className="text-lg font-bold text-slate-900 mb-1">Bloque 1 · Ejecución</h2>
      <p className="text-sm text-slate-400 mb-4">Precio, material POP, caras frontales e inventario en PDV.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Material POP sin preciador con precio marcado</CardTitle>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={materialPop.incidencias.map((l) => toRow(l))}
              emptyMessage="Todos los PDV con material POP tienen el preciador con precio marcado."
            />
          </CardContent>
        </Card>

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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Caras Frontales insuficientes</CardTitle>
        </CardHeader>
        <CardContent>
          <IndicatorTable
            rows={carasFrontales.map((r) =>
              toRow(
                r.location,
                r.motivo === "SIN_PRESENCIA" ? (
                  <Badge variant="destructive">Sin presencia de producto</Badge>
                ) : (
                  <Badge variant="destructive">{r.frontFaces} caras (mín. 4)</Badge>
                )
              )
            )}
            extraLabel="Motivo de alerta"
            emptyMessage="Ningún PDV comprador está por debajo del umbral de caras frontales."
          />
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Precio: Desviación de PVP (400g / 800g)</CardTitle>
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
            emptyMessage="Sin desviaciones de PVP en los sectores piloto."
          />
        </CardContent>
      </Card>

      <Separator className="mb-6" />

      {/* ══════════════════ BLOQUE 2: COBERTURA MERCADERISTA ══════════════════ */}
      <h2 className="text-lg font-bold text-slate-900 mb-1">Bloque 2 · % Cobertura Mercaderista</h2>
      <p className="text-sm text-slate-400 mb-4">PDVs compradores que faltan por visitar.</p>

      <Card>
        <CardHeader>
          <CardTitle>Falta por visitar</CardTitle>
        </CardHeader>
        <CardContent>
          <IndicatorTable
            rows={cobertura.faltantes.map((l) => toRow(l))}
            emptyMessage="Todos los PDVs compradores han sido visitados."
          />
        </CardContent>
      </Card>
    </div>
  );
}
