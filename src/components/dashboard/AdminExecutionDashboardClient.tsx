"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { IndicatorTable, type IndicatorTableRow } from "@/components/dashboard/IndicatorTable";
import { ReportPrintButton } from "@/components/dashboard/ReportPrintButton";
import { ReportPrintHeader } from "@/components/dashboard/ReportPrintHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SECTOR_LABELS, type Sector } from "@/lib/sectors";
import {
  CARAS_FRONTALES_MINIMO,
  STOCK_OUT_UMBRAL_UNIDADES,
  clientesExhibicionDeficiente,
  clientesFaltaPorVisitar,
  clientesPrecioIncorrecto,
  clientesRiesgoStockOut,
  clientesSinMaterialPop,
  clientesSinVentaSap,
  computeAdminKpis,
  desviado400,
  desviado800,
  filterAdminRows,
  grupoVendedorOptions,
  oficinaLabel,
  unidadesTotales,
  type AdminPdvRow,
  type OficinaFilter,
} from "@/lib/admin-metrics";

const SECTOR_KEYS = Object.keys(SECTOR_LABELS) as Sector[];

function money(value: number | null): string {
  return value === null ? "s/d" : `$${value.toFixed(2)}`;
}

// Se formatea recortando el ISO en vez de con `new Date`: el servidor corre
// en UTC y el navegador en UTC-4, así que convertir la marca de tiempo daba
// días distintos en cada lado y React reportaba un error de hidratación.
function fecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function toRow(row: AdminPdvRow, extra?: React.ReactNode, extraText?: string): IndicatorTableRow {
  return {
    id: row.location.id,
    sapCode: row.location.sap_code,
    name: row.location.name,
    sector: oficinaLabel(row.location),
    tipoCliente: row.location.tipo_cliente ?? row.location.type,
    grupoVendedor: row.location.grupo_vendedor,
    extra,
    extraText,
  };
}

export function AdminExecutionDashboardClient({ rows }: { rows: AdminPdvRow[] }) {
  const [oficina, setOficina] = useState<OficinaFilter>("TOTAL");
  const [grupoVendedor, setGrupoVendedor] = useState("");

  const grupos = useMemo(() => grupoVendedorOptions(rows), [rows]);

  const filtered = useMemo(
    () => filterAdminRows(rows, { oficina, grupoVendedor }),
    [rows, oficina, grupoVendedor]
  );

  const kpis = useMemo(() => computeAdminKpis(filtered), [filtered]);

  const sinVenta = useMemo(() => clientesSinVentaSap(filtered), [filtered]);
  const precioIncorrecto = useMemo(() => clientesPrecioIncorrecto(filtered), [filtered]);
  const sinPop = useMemo(() => clientesSinMaterialPop(filtered), [filtered]);
  const riesgoStockOut = useMemo(() => clientesRiesgoStockOut(filtered), [filtered]);
  const exhibicion = useMemo(() => clientesExhibicionDeficiente(filtered), [filtered]);
  const faltaPorVisitar = useMemo(() => clientesFaltaPorVisitar(filtered), [filtered]);

  const oficinaTexto = oficina === "TOTAL" ? "Todas las oficinas" : SECTOR_LABELS[oficina];
  const grupoTexto = grupoVendedor || "Todos los grupos vendedores";

  return (
    <div className="print-root">
      <ReportPrintHeader
        title="Reporte de Ejecución en Punto de Venta"
        subtitle="Auditoría y control de ejecución — perfil Administrador"
        filtros={[oficinaTexto, grupoTexto]}
      />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard de Ejecución</h1>
          <p className="text-slate-500 mt-1">Auditoría y control de ejecución en punto de venta</p>
        </div>
        <ReportPrintButton />
      </div>

      {/* ── Filtros: Oficina de Venta y Grupo Vendedor ─────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-6 print:hidden">
        <button
          onClick={() => setOficina("TOTAL")}
          className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
            oficina === "TOTAL"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
          }`}
        >
          Todas las oficinas
        </button>
        {SECTOR_KEYS.map((sector) => (
          <button
            key={sector}
            onClick={() => setOficina(sector)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              oficina === sector
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {SECTOR_LABELS[sector]}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="grupo-vendedor" className="text-sm text-slate-500">
            Grupo vendedor
          </label>
          <select
            id="grupo-vendedor"
            value={grupoVendedor}
            onChange={(e) => setGrupoVendedor(e.target.value)}
            disabled={grupos.length === 0}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 disabled:opacity-60"
          >
            {grupos.length === 0 ? (
              <option value="">Sin grupo vendedor en la cartera</option>
            ) : (
              <>
                <option value="">Todos los grupos</option>
                {grupos.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      </div>

      {/* ── Tarjetas de KPI ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6 print-avoid-break">
        <KpiCard
          title="% Clientes que compraron"
          value={`${kpis.compraron.pct}%`}
          subtitle={`${kpis.compraron.count} de ${kpis.compraron.total} clientes de la cartera`}
        />
        <KpiCard
          title="% Precio correcto por zona"
          value={`${kpis.precioCorrecto.pct}%`}
          subtitle={`${kpis.precioCorrecto.count} de ${kpis.precioCorrecto.total} con precio observado`}
          critical={kpis.precioCorrecto.total > 0 && kpis.precioCorrecto.pct < 100}
        />
        <KpiCard
          title="% Clientes con material POP"
          value={`${kpis.materialPop.pct}%`}
          subtitle={`${kpis.materialPop.count} de ${kpis.materialPop.total} PDVs visitados`}
        />
        <KpiCard
          title="Clientes en riesgo de stock out"
          value={String(kpis.riesgoStockOut.count)}
          subtitle={`Menos de ${STOCK_OUT_UMBRAL_UNIDADES} unidades entre anaquel y depósito`}
          critical={kpis.riesgoStockOut.count > 0}
        />
        <KpiCard
          title="% Cobertura de mercaderista"
          value={`${kpis.coberturaMercaderista.pct}%`}
          subtitle={`${kpis.coberturaMercaderista.count} de ${kpis.coberturaMercaderista.total} PDVs visitados`}
        />
      </div>

      {/* ── Resumen de cantidades: solo en el PDF ──────────────────────
          En pantalla estas cifras ya se ven como el largo de cada lista;
          en la lámina las listas se ocultan y quedan solo las cantidades. */}
      <div className="hidden print:block print-avoid-break">
        <h2 className="text-base font-bold text-slate-900 mb-2">Incidencias detectadas</h2>
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: "Sin ventas en SAP", value: sinVenta.length },
            { label: "Precio incorrecto", value: precioIncorrecto.length },
            { label: "Sin material POP", value: sinPop.length },
            { label: "Riesgo de stock out", value: riesgoStockOut.length },
            { label: "Exhibición deficiente", value: exhibicion.length },
            { label: "Falta por visitar", value: faltaPorVisitar.length },
          ].map((item) => (
            <div key={item.label} className="border border-slate-300 rounded-lg px-3 py-2">
              <p className="text-2xl font-bold text-slate-900 leading-none">{item.value}</p>
              <p className="text-[10px] text-slate-500 mt-1 leading-tight">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          El detalle de clientes por incidencia se comparte aparte, en el archivo de Excel exportable desde el
          dashboard.
        </p>
      </div>

      <div className="print:hidden">
        <Separator className="mb-6" />

        {/* ══════════════════ BLOQUE 1: EJECUCIÓN ══════════════════ */}
        <h2 className="text-lg font-bold text-slate-900 mb-1">Bloque 1 · Ejecución</h2>
        <p className="text-sm text-slate-400 mb-4">
          Ventas, precio, material POP, inventario y exhibición en el punto de venta.
        </p>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>1. Clientes sin ventas en SAP</CardTitle>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={sinVenta.map((r) => toRow(r))}
              exportName="Clientes sin ventas en SAP"
              emptyMessage="Todos los clientes de la cartera registran venta de Panquecitas en SAP."
            />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>2. Clientes con precio incorrecto según su zona</CardTitle>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={precioIncorrecto.map((r) =>
                toRow(
                  r,
                  <div className="flex gap-1.5">
                    <Badge variant={desviado400(r) ? "destructive" : "outline"}>
                      400g: {money(r.price400)} (obj. {money(r.target400)})
                    </Badge>
                    <Badge variant={desviado800(r) ? "destructive" : "outline"}>
                      800g: {money(r.price800)} (obj. {money(r.target800)})
                    </Badge>
                  </div>,
                  `400g: ${money(r.price400)} (obj. ${money(r.target400)}) | 800g: ${money(r.price800)} (obj. ${money(
                    r.target800
                  )})`
                )
              )}
              extraLabel="Precios"
              exportName="Clientes con precio incorrecto"
              emptyMessage="Todos los precios observados coinciden con el objetivo de su zona."
            />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>3. Clientes sin material POP</CardTitle>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={sinPop.map((r) => toRow(r, <span className="text-slate-500">{fecha(r.ultimaVisita)}</span>, fecha(r.ultimaVisita)))}
              extraLabel="Última visita"
              exportName="Clientes sin material POP"
              emptyMessage="Todos los PDVs visitados tienen material POP."
            />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>4. Clientes en riesgo de stock out</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Menos de {STOCK_OUT_UMBRAL_UNIDADES} unidades sumando anaquel y depósito en la última visita.
            </p>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={riesgoStockOut.map((r) => {
                const detalle = `${r.unidadesAnaquel ?? 0} u. en anaquel + ${r.unidadesDeposito} u. en depósito${
                  r.depositAccess === false ? " (sin acceso al depósito)" : ""
                }`;
                return toRow(
                  r,
                  <Badge variant={unidadesTotales(r) === 0 ? "destructive" : "outline"}>{detalle}</Badge>,
                  detalle
                );
              })}
              extraLabel="Inventario"
              exportName="Clientes en riesgo de stock out"
              emptyMessage="Ningún PDV visitado está por debajo del umbral de inventario."
            />
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>5. Exhibición del producto</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Hipermercados, supermercados, distribuidores y mayoristas se evalúan por caras frontales (mínimo{" "}
              {CARAS_FRONTALES_MINIMO}); el resto de los formatos, por presencia del producto.
            </p>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={exhibicion.map(({ row, motivo }) => {
                const detalle =
                  motivo === "SIN_PRESENCIA"
                    ? "Sin presencia de producto"
                    : `${row.frontFaces ?? 0} caras (mín. ${CARAS_FRONTALES_MINIMO})`;
                return toRow(row, <Badge variant="destructive">{detalle}</Badge>, detalle);
              })}
              extraLabel="Motivo de alerta"
              exportName="Clientes con exhibición deficiente"
              emptyMessage="Ningún PDV visitado presenta problemas de exhibición."
            />
          </CardContent>
        </Card>

        <Separator className="mb-6" />

        {/* ══════════════════ BLOQUE 2: COBERTURA MERCADERISTA ══════════════════ */}
        <h2 className="text-lg font-bold text-slate-900 mb-1">Bloque 2 · % Cobertura Mercaderista</h2>
        <p className="text-sm text-slate-400 mb-4">
          {kpis.faltaPorVisitar.pct}% de la cartera falta por visitar ({kpis.faltaPorVisitar.count} de{" "}
          {kpis.faltaPorVisitar.total} puntos de venta).
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Puntos de venta que faltan por visitar</CardTitle>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={faltaPorVisitar.map((r) => toRow(r))}
              exportName="PDVs que faltan por visitar"
              emptyMessage="Todos los puntos de venta de la cartera han sido visitados."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
