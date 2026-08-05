"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { IndicatorTable, type IndicatorTableRow } from "@/components/dashboard/IndicatorTable";
import { ClientesActivadosChart } from "@/components/dashboard/ClientesActivadosChart";
import { EjecucionSemanalChart } from "@/components/dashboard/EjecucionSemanalChart";
import { RiesgoStockOutSemanalChart } from "@/components/dashboard/RiesgoStockOutSemanalChart";
import { RoundLegend } from "@/components/dashboard/RoundLegend";
import { ReportPrintButton } from "@/components/dashboard/ReportPrintButton";
import { ReportPrintHeader } from "@/components/dashboard/ReportPrintHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SECTOR_LABELS, type Sector } from "@/lib/sectors";
import type { Location } from "@/types";
import {
  CARAS_FRONTALES_MINIMO,
  STOCK_OUT_UMBRAL_UNIDADES,
  clientesConVentaSap,
  clientesExhibicionDeficiente,
  clientesFaltaPorVisitar,
  clientesPrecioIncorrecto,
  clientesRiesgoStockOut,
  clientesSinMaterialPop,
  clientesSinVentaSap,
  computeActivacionSemanal,
  computeAdminKpis,
  computeEjecucionSemanal,
  computeRiesgoStockOutSemanal,
  desviado400,
  desviado800,
  filterAdminRows,
  grupoVendedorOptions,
  oficinaLabel,
  tipoClienteOptions,
  unidadesTotales,
  type AdminPdvRow,
  type AdminVisitSnapshot,
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

export function AdminExecutionDashboardClient({
  rows,
  visits,
}: {
  rows: AdminPdvRow[];
  visits: AdminVisitSnapshot[];
}) {
  const [oficina, setOficina] = useState<OficinaFilter>("TOTAL");
  const [grupoVendedor, setGrupoVendedor] = useState("");
  const [tipoClienteFilter, setTipoClienteFilter] = useState("");

  const grupos = useMemo(() => grupoVendedorOptions(rows), [rows]);

  const filtered = useMemo(
    () => filterAdminRows(rows, { oficina, grupoVendedor }),
    [rows, oficina, grupoVendedor]
  );

  const kpis = useMemo(() => computeAdminKpis(filtered), [filtered]);
  const activacion = useMemo(() => computeActivacionSemanal(filtered), [filtered]);

  // Mapas de apoyo para los gráficos semanales (S2/S4/S6/S8): se derivan de
  // `rows` completo (universo entero, no `filtered`) porque el recorte por
  // Oficina/Grupo Vendedor se aplica aparte, vía el set de IDs permitidos.
  const locationsById = useMemo(() => {
    const map = new Map<string, Location>();
    for (const r of rows) map.set(r.location.id, r.location);
    return map;
  }, [rows]);
  const targetsByLocation = useMemo(() => {
    const map = new Map<string, { target400: number | null; target800: number | null }>();
    for (const r of rows) map.set(r.location.id, { target400: r.target400, target800: r.target800 });
    return map;
  }, [rows]);
  const allowedLocationIds = useMemo(() => new Set(filtered.map((r) => r.location.id)), [filtered]);

  const ejecucionSemanal = useMemo(
    () => computeEjecucionSemanal(visits, locationsById, targetsByLocation, allowedLocationIds),
    [visits, locationsById, targetsByLocation, allowedLocationIds]
  );
  const riesgoStockOutSemanal = useMemo(
    () => computeRiesgoStockOutSemanal(visits, allowedLocationIds),
    [visits, allowedLocationIds]
  );

  const sinVenta = useMemo(() => clientesSinVentaSap(filtered), [filtered]);
  const conVentaBase = useMemo(() => clientesConVentaSap(filtered), [filtered]);
  // Opciones del <select> de tipo de cliente: se derivan de `rows` (sin
  // filtrar por Oficina/Grupo Vendedor) para que la lista no salte al
  // cambiar esos otros filtros — mismo criterio que `grupos` arriba.
  const tiposCliente = useMemo(() => tipoClienteOptions(clientesConVentaSap(rows)), [rows]);
  const conVenta = useMemo(
    () =>
      tipoClienteFilter
        ? conVentaBase.filter((r) => r.location.tipo_cliente?.trim() === tipoClienteFilter)
        : conVentaBase,
    [conVentaBase, tipoClienteFilter]
  );
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
          subtitle={`${kpis.compraron.count} de ${kpis.compraron.total} con pedido o factura en SAP`}
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

      {/* ── Gráfico: activación de clientes en el tiempo ──────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader>
          <CardTitle>Activación de clientes en el tiempo</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            % acumulado de la cartera (según los filtros vigentes) con al menos una venta facturada en SAP, semana a
            semana.
          </p>
        </CardHeader>
        <CardContent>
          {activacion.length > 0 ? (
            <ClientesActivadosChart data={activacion} />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📈</p>
                <p>Sin ventas facturadas de Panquecitas todavía. Carga el reporte SAP.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Gráfico: % Material POP y % Precio correcto por semana ────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader>
          <CardTitle>Ejecución por semana de auditoría (POP y Precio)</CardTitle>
          <p className="text-xs text-slate-400 mt-1 mb-2">
            % de clientes visitados esa semana con material POP y con precio correcto según su zona.
          </p>
          <RoundLegend />
        </CardHeader>
        <CardContent>
          {ejecucionSemanal.length > 0 ? (
            <EjecucionSemanalChart data={ejecucionSemanal} />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📊</p>
                <p>Sin visitas registradas todavía en ninguna semana de auditoría (S2/S4/S6/S8).</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Gráfico: riesgo de stock-out en el tiempo ──────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader>
          <CardTitle>Riesgo de stock-out en el tiempo</CardTitle>
          <p className="text-xs text-slate-400 mt-1 mb-2">
            Clientes con menos de {STOCK_OUT_UMBRAL_UNIDADES} unidades entre anaquel y depósito, al cierre de cada
            semana de auditoría (acumulado: usa la última visita conocida de cada PDV hasta esa fecha).
          </p>
          <RoundLegend />
        </CardHeader>
        <CardContent>
          {riesgoStockOutSemanal.length > 0 ? (
            <RiesgoStockOutSemanalChart data={riesgoStockOutSemanal} />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-2">📉</p>
                <p>Sin visitas registradas todavía en ninguna semana de auditoría (S2/S4/S6/S8).</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
            <p className="text-xs text-slate-400 mt-1">
              Cartera inicial sin pedido ni factura de Panquecitas cargados en SAP.
            </p>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={sinVenta.map((r) => toRow(r))}
              exportName="Clientes sin ventas en SAP"
              emptyMessage="Todos los clientes de la cartera tienen pedido o factura de Panquecitas en SAP."
            />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>2. Clientes con ventas en SAP</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                Incluye quienes armaron un pedido y quienes ya tienen factura.
              </p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <label htmlFor="tipo-cliente" className="text-sm text-slate-500">
                Tipo de cliente
              </label>
              <select
                id="tipo-cliente"
                value={tipoClienteFilter}
                onChange={(e) => setTipoClienteFilter(e.target.value)}
                disabled={tiposCliente.length === 0}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 disabled:opacity-60"
              >
                {tiposCliente.length === 0 ? (
                  <option value="">Sin tipo de cliente en la cartera</option>
                ) : (
                  <>
                    <option value="">Todos los tipos</option>
                    {tiposCliente.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <IndicatorTable
              rows={conVenta.map((r) => toRow(r))}
              exportName="Clientes con ventas en SAP"
              emptyMessage="Ningún cliente de la cartera tiene pedido ni factura de Panquecitas en SAP."
            />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>3. Clientes con precio incorrecto según su zona</CardTitle>
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
            <CardTitle>4. Clientes sin material POP</CardTitle>
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
            <CardTitle>5. Clientes en riesgo de stock out</CardTitle>
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
            <CardTitle>6. Exhibición del producto</CardTitle>
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
