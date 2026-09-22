"use client";

import { Fragment, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportExcelMultiButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelColumn, ExcelSheetSpec } from "@/lib/export-excel";
import { PVP_TARGETS } from "@/data/pvp-thresholds";
import type { Sector } from "@/lib/sectors";
import { SEGMENTO_SIN_DATO } from "@/lib/segmentos";
import type { EstadoPdv, ReporteMercaderistasResult, ReporteVisitaRow } from "@/lib/reporte-mercaderistas";
import {
  ESTADO_PDV_LABELS,
  ESTADO_PRECIO_LABELS,
  POP_MATERIAL_LABELS,
  POP_MENSAJE_LABELS,
  filtrarReporte,
  resumirGlobal,
  resumirPorMercaderista,
  type Conteo,
  type FiltroReporte,
  type PdvConPeriodo,
  type ResumenMercaderista,
} from "@/lib/reporte-mercaderistas-utils";

// Reporte de Mercaderistas: qué encontraron en los PDV del piloto (presencia
// de producto, POP, precio y ubicación en el anaquel), primero global y
// después PDV por PDV. La query y las decisiones están en
// src/lib/reporte-mercaderistas.ts; la agregación, en -utils.ts.

const ESTADOS: [EstadoPdv | "TODOS", string][] = [
  ["TODOS", "Todos"],
  ["NO_VISITADO", "No visitados"],
  ["VISITADO_SIN_COMPRA", "Visitados sin compra"],
  ["VISITADO_CON_COMPRA", "Visitados con compra"],
];

const ESTADO_BADGES: Record<EstadoPdv, string> = {
  NO_VISITADO: "border-slate-300 text-slate-500 bg-white",
  VISITADO_SIN_COMPRA: "border-amber-300 text-amber-700 bg-amber-50",
  VISITADO_CON_COMPRA: "border-emerald-300 text-emerald-700 bg-emerald-50",
};

/** PDV listados en la tabla antes de tener que afinar los filtros. */
const TOPE_TABLA = 300;

const pct = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;
const usd = (v: number | null) =>
  v == null ? "—" : `$${v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: number | null) => (v == null ? "—" : v.toLocaleString("es-VE", { maximumFractionDigits: 1 }));
const si = (v: boolean | null) => (v == null ? "—" : v ? "sí" : "no");
const fechaCorta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "—");
const materialesDe = (v: ReporteVisitaRow) =>
  v.popMateriales.map((m) => (m === "OTRO" ? v.popMaterialesOtro?.trim() || "Otro" : POP_MATERIAL_LABELS[m])).join(", ");
const mensajeDe = (v: ReporteVisitaRow) => (v.popMensaje ? POP_MENSAJE_LABELS[v.popMensaje] : "");

/** Barras de distribución (POP, materiales, ubicación) sin dependencias de gráficos. */
function Distribucion({ titulo, nota, datos }: { titulo: string; nota: string; datos: Conteo[] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="text-[11px] text-slate-400 mb-2">{nota}</p>
      {datos.length === 0 ? (
        <p className="text-sm text-slate-400">Sin datos en este corte.</p>
      ) : (
        <div className="space-y-1.5">
          {datos.slice(0, 8).map((d) => (
            <div key={d.clave}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-slate-600 truncate" title={d.label}>
                  {d.label}
                </span>
                <span className="shrink-0 font-semibold text-slate-800">
                  {pct(d.pct)} <span className="font-normal text-slate-400">({d.visitas})</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-slate-400" style={{ width: `${Math.min(d.pct, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="text-xl font-bold text-slate-900">{valor}</p>
      <p className="text-xs text-slate-400">{detalle}</p>
    </div>
  );
}

/** Historial del PDV, desplegado al hacer clic en su fila. */
function HistorialPdv({ fila, colSpan }: { fila: PdvConPeriodo; colSpan: number }) {
  // Sin visitas en el período filtrado se muestra igual la última conocida,
  // para no dejar la fila abierta en blanco.
  const delPeriodo = fila.visitasPeriodo.length > 0;
  const visitas = delPeriodo ? fila.visitasPeriodo : fila.ultima ? [fila.ultima] : [];

  return (
    <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
      <TableCell colSpan={colSpan} className="p-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">
          Historial de visitas — {fila.cliente} ·{" "}
          {delPeriodo
            ? `${visitas.length} en el período, ${fila.visitas} en total`
            : `última visita conocida (fuera del período) · ${fila.visitas} en total`}
        </p>
        {visitas.length === 0 ? (
          <p className="text-sm text-slate-400">Este PDV todavía no ha sido visitado.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Mercaderista</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>POP</TableHead>
                  <TableHead className="text-right">400g</TableHead>
                  <TableHead className="text-right">800g</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="text-right">Anaquel</TableHead>
                  <TableHead className="text-right">Depósito</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitas.map((v) => (
                  <TableRow key={v.visitId}>
                    <TableCell className="whitespace-nowrap">{fechaCorta(v.dia)}</TableCell>
                    <TableCell>{v.mercaderista}</TableCell>
                    <TableCell>
                      {si(v.productPresent)}
                      {v.productPresent && (
                        <span className="text-slate-400">
                          {" "}
                          · {v.disponible400 ? "400g" : ""}
                          {v.disponible400 && v.disponible800 ? " y " : ""}
                          {v.disponible800 ? "800g" : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {si(v.popPresent)}
                      {v.popPresent && (
                        <span className="text-slate-400">
                          {" "}
                          · {mensajeDe(v) || "sin mensaje"}
                          {v.popPreciador === true ? " · con preciador" : ""}
                          {materialesDe(v) ? ` · ${materialesDe(v)}` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {usd(v.precio400)}
                      {v.estado400 && v.estado400 !== "CORRECTO" && (
                        <span className="text-amber-600"> ({ESTADO_PRECIO_LABELS[v.estado400].toLowerCase()})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {usd(v.precio800)}
                      {v.estado800 && v.estado800 !== "CORRECTO" && (
                        <span className="text-amber-600"> ({ESTADO_PRECIO_LABELS[v.estado800].toLowerCase()})</span>
                      )}
                    </TableCell>
                    <TableCell>{v.ubicaciones.join(", ") || "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {num(v.unidadesAnaquel)} un.
                      {v.carasFrontales != null && (
                        <span className="text-slate-400"> · {v.carasFrontales} caras</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {v.accesoDeposito ? `${num(v.unidadesDeposito)} un.` : "sin acceso"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export function ReporteMercaderistas({
  data,
  sector,
  filtroTexto,
  sectorLabels,
}: {
  data: ReporteMercaderistasResult;
  /** Corte de ciudad activo del dashboard. */
  sector: "TOTAL" | Sector;
  filtroTexto: string;
  sectorLabels: Record<Sector, string>;
}) {
  const [mercaderista, setMercaderista] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<EstadoPdv | "TODOS">("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [incluirFueraDeCartera, setIncluirFueraDeCartera] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const fueraDeCartera = useMemo(
    () => data.pdv.filter((p) => !p.enCartera && (sector === "TOTAL" || p.sector === sector)).length,
    [data.pdv, sector]
  );

  const filtro: FiltroReporte = {
    sector,
    mercaderista,
    desde: desde || null,
    hasta: hasta || null,
    estado,
    busqueda,
    incluirFueraDeCartera,
  };

  // `filas` = universo filtrado (base de los indicadores); `visibles` = lo que
  // además pasa el filtro de estado y se lista en la tabla. Ver filtrarReporte.
  const { filas, visibles, visitasPeriodo } = useMemo(
    () => filtrarReporte(data.pdv, data.visitas, filtro),
    // El objeto `filtro` se arma en cada render; las dependencias son sus campos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.pdv, data.visitas, sector, mercaderista, desde, hasta, estado, busqueda, incluirFueraDeCartera]
  );

  const resumen = useMemo(() => resumirGlobal(filas, visitasPeriodo), [filas, visitasPeriodo]);
  const porMercaderista = useMemo(() => resumirPorMercaderista(visitasPeriodo), [visitasPeriodo]);

  const pdvPorId = useMemo(() => new Map(filas.map((f) => [f.locationId, f])), [filas]);

  const ciudad = (s: Sector) => sectorLabels[s];
  const rangoTexto = desde || hasta ? `${desde || "inicio"} a ${hasta || "hoy"}` : "todo el piloto";

  // ── Hojas del Excel ───────────────────────────────────────────────
  const hojas = useMemo<ExcelSheetSpec<unknown>[]>(() => {
    const filaResumen = (indicador: string, valor: string | number, detalle = "") => ({ indicador, valor, detalle });
    const colResumen: ExcelColumn<{ indicador: string; valor: string | number; detalle: string }>[] = [
      { header: "Indicador", value: (r) => r.indicador, width: 34 },
      { header: "Valor", value: (r) => r.valor, width: 16 },
      { header: "Detalle", value: (r) => r.detalle, width: 46 },
    ];

    const resumenRows = [
      filaResumen("Ciudad", filtroTexto),
      filaResumen("Período", rangoTexto),
      filaResumen("Mercaderista", mercaderista ?? "Todos"),
      filaResumen("PDV del universo", resumen.pdvUniverso, incluirFueraDeCartera ? "incluye fuera de cartera" : "solo cartera del piloto"),
      filaResumen("PDV visitados", resumen.visitados, `${pct(resumen.pctCobertura)} de cobertura`),
      filaResumen("PDV sin visitar", resumen.noVisitados, ""),
      filaResumen("Visitas registradas", resumen.visitasTotales, `${porMercaderista.length} mercaderistas`),
      filaResumen("Visitados sin compra (Radar = 0)", resumen.visitadosSinCompra, pct(resumen.pctVisitadosSinCompra)),
      filaResumen("Visitados con compra", resumen.visitadosConCompra, ""),
      filaResumen("% con producto en anaquel", resumen.pctProducto ?? "", `${resumen.conProducto} de ${resumen.visitas} visitas`),
      filaResumen("% que maneja 400g", resumen.pctDisponible400 ?? "", "sobre los PDV con producto"),
      filaResumen("% que maneja 800g", resumen.pctDisponible800 ?? "", "sobre los PDV con producto"),
      filaResumen("% con material POP", resumen.pctPop ?? "", `${resumen.conPop} de ${resumen.visitas} visitas`),
      filaResumen("% con preciador", resumen.pctPreciador ?? "", "sobre los PDV con POP"),
      filaResumen("% en pasillo de harina de trigo", resumen.pctHarinaTrigo ?? "", "sobre los PDV con producto"),
      filaResumen("Precio 400g correcto", resumen.precio400.pctCorrecto ?? "", `${resumen.precio400.correcto} de ${resumen.precio400.observadas} observados`),
      filaResumen("Precio 400g promedio (USD)", resumen.precio400.promedio ?? "", `mín ${usd(resumen.precio400.minimo)} · máx ${usd(resumen.precio400.maximo)}`),
      filaResumen("Precio 800g correcto", resumen.precio800.pctCorrecto ?? "", `${resumen.precio800.correcto} de ${resumen.precio800.observadas} observados`),
      filaResumen("Precio 800g promedio (USD)", resumen.precio800.promedio ?? "", `mín ${usd(resumen.precio800.minimo)} · máx ${usd(resumen.precio800.maximo)}`),
      filaResumen("Unidades en anaquel (promedio)", resumen.unidadesAnaquelProm ?? "", "sobre los PDV con producto"),
      filaResumen("Caras frontales (promedio)", resumen.carasFrontalesProm ?? "", "sobre los PDV con producto"),
      filaResumen("% con acceso a depósito", resumen.pctAccesoDeposito ?? "", `${num(resumen.unidadesDepositoProm)} unidades en promedio`),
      ...resumen.mensajes.map((d) => filaResumen(`Mensaje POP · ${d.label}`, d.pct, `${d.visitas} PDV con POP`)),
      ...resumen.materiales.map((d) => filaResumen(`Material POP · ${d.label}`, d.pct, `${d.visitas} PDV con POP`)),
      ...resumen.ubicaciones.map((d) => filaResumen(`Ubicación · ${d.label}`, d.pct, `${d.visitas} PDV con producto`)),
    ];

    const colPdv: ExcelColumn<PdvConPeriodo>[] = [
      { header: "Código SAP", value: (r) => r.sapCode, width: 14 },
      { header: "Cliente", value: (r) => r.cliente, width: 38 },
      { header: "Ciudad", value: (r) => ciudad(r.sector), width: 16 },
      { header: "Centro poblado", value: (r) => r.centroPoblado ?? "", width: 18 },
      { header: "Municipio", value: (r) => r.municipio ?? "", width: 18 },
      { header: "Tipo de cliente", value: (r) => r.tipoCliente ?? "", width: 20 },
      { header: "Segmento", value: (r) => r.segmento ?? SEGMENTO_SIN_DATO, width: 22 },
      { header: "Modelo", value: (r) => r.modelo ?? "", width: 12 },
      { header: "Zona", value: (r) => r.zona ?? "", width: 12 },
      { header: "Asesor", value: (r) => r.asesor ?? "", width: 22 },
      { header: "Grupo vendedor", value: (r) => r.grupoVendedor ?? "", width: 14 },
      { header: "Tanda", value: (r) => r.cohorte ?? "", width: 18 },
      { header: "Estado", value: (r) => ESTADO_PDV_LABELS[r.estadoPeriodo], width: 20 },
      { header: "Visitas en el período", value: (r) => r.visitasPeriodo.length, width: 16 },
      { header: "Visitas históricas", value: (r) => r.visitas, width: 14 },
      { header: "Última visita", value: (r) => r.ultimaPeriodo?.dia ?? "", width: 14 },
      { header: "Mercaderista", value: (r) => r.ultimaPeriodo?.mercaderista ?? "", width: 24 },
      { header: "Producto presente", value: (r) => (r.ultimaPeriodo ? si(r.ultimaPeriodo.productPresent) : ""), width: 16 },
      { header: "Maneja 400g", value: (r) => (r.ultimaPeriodo ? si(r.ultimaPeriodo.disponible400) : ""), width: 12 },
      { header: "Maneja 800g", value: (r) => (r.ultimaPeriodo ? si(r.ultimaPeriodo.disponible800) : ""), width: 12 },
      { header: "Material POP", value: (r) => (r.ultimaPeriodo ? si(r.ultimaPeriodo.popPresent) : ""), width: 12 },
      { header: "Preciador", value: (r) => (r.ultimaPeriodo ? si(r.ultimaPeriodo.popPreciador) : ""), width: 12 },
      { header: "Mensaje POP", value: (r) => (r.ultimaPeriodo ? mensajeDe(r.ultimaPeriodo) : ""), width: 18 },
      { header: "Materiales POP", value: (r) => (r.ultimaPeriodo ? materialesDe(r.ultimaPeriodo) : ""), width: 28 },
      { header: "Precio 400g (USD)", value: (r) => r.ultimaPeriodo?.precio400 ?? "", width: 16 },
      { header: "Estado 400g", value: (r) => (r.ultimaPeriodo?.estado400 ? ESTADO_PRECIO_LABELS[r.ultimaPeriodo.estado400] : ""), width: 14 },
      { header: "Precio 800g (USD)", value: (r) => r.ultimaPeriodo?.precio800 ?? "", width: 16 },
      { header: "Estado 800g", value: (r) => (r.ultimaPeriodo?.estado800 ? ESTADO_PRECIO_LABELS[r.ultimaPeriodo.estado800] : ""), width: 14 },
      { header: "Ubicación en anaquel", value: (r) => r.ultimaPeriodo?.ubicaciones.join(", ") ?? "", width: 30 },
      { header: "Unidades en anaquel", value: (r) => r.ultimaPeriodo?.unidadesAnaquel ?? "", width: 16 },
      { header: "Unid. 400g", value: (r) => r.ultimaPeriodo?.unidades400 ?? "", width: 12 },
      { header: "Unid. 800g", value: (r) => r.ultimaPeriodo?.unidades800 ?? "", width: 12 },
      { header: "Caras frontales", value: (r) => r.ultimaPeriodo?.carasFrontales ?? "", width: 14 },
      { header: "Acceso a depósito", value: (r) => (r.ultimaPeriodo ? si(r.ultimaPeriodo.accesoDeposito) : ""), width: 14 },
      { header: "Unidades en depósito", value: (r) => r.ultimaPeriodo?.unidadesDeposito ?? "", width: 16 },
      { header: "Radar acumulado (kg)", value: (r) => r.radarKg, width: 18 },
      { header: "En cartera", value: (r) => (r.enCartera ? "sí" : "no (fuera de cartera)"), width: 18 },
    ];

    const colVisitas: ExcelColumn<ReporteVisitaRow>[] = [
      { header: "Fecha", value: (r) => r.dia, width: 14 },
      { header: "Código SAP", value: (r) => pdvPorId.get(r.locationId)?.sapCode ?? "", width: 14 },
      { header: "Cliente", value: (r) => pdvPorId.get(r.locationId)?.cliente ?? "", width: 38 },
      {
        header: "Ciudad",
        value: (r) => {
          const p = pdvPorId.get(r.locationId);
          return p ? ciudad(p.sector) : "";
        },
        width: 16,
      },
      { header: "Segmento", value: (r) => pdvPorId.get(r.locationId)?.segmento ?? SEGMENTO_SIN_DATO, width: 22 },
      { header: "Mercaderista", value: (r) => r.mercaderista, width: 24 },
      { header: "Cédula", value: (r) => r.cedula, width: 14 },
      { header: "Producto presente", value: (r) => si(r.productPresent), width: 16 },
      { header: "Maneja 400g", value: (r) => si(r.disponible400), width: 12 },
      { header: "Maneja 800g", value: (r) => si(r.disponible800), width: 12 },
      { header: "Material POP", value: (r) => si(r.popPresent), width: 12 },
      { header: "Preciador", value: (r) => si(r.popPreciador), width: 12 },
      { header: "Mensaje POP", value: (r) => mensajeDe(r), width: 18 },
      { header: "Materiales POP", value: (r) => materialesDe(r), width: 28 },
      { header: "Precio 400g (USD)", value: (r) => r.precio400 ?? "", width: 16 },
      { header: "Estado 400g", value: (r) => (r.estado400 ? ESTADO_PRECIO_LABELS[r.estado400] : ""), width: 14 },
      { header: "Precio 800g (USD)", value: (r) => r.precio800 ?? "", width: 16 },
      { header: "Estado 800g", value: (r) => (r.estado800 ? ESTADO_PRECIO_LABELS[r.estado800] : ""), width: 14 },
      { header: "Ubicación en anaquel", value: (r) => r.ubicaciones.join(", "), width: 30 },
      { header: "Unidades en anaquel", value: (r) => r.unidadesAnaquel ?? "", width: 16 },
      { header: "Unid. 400g", value: (r) => r.unidades400 ?? "", width: 12 },
      { header: "Unid. 800g", value: (r) => r.unidades800 ?? "", width: 12 },
      { header: "Caras frontales", value: (r) => r.carasFrontales ?? "", width: 14 },
      { header: "Acceso a depósito", value: (r) => si(r.accesoDeposito), width: 14 },
      { header: "Unidades en depósito", value: (r) => r.unidadesDeposito, width: 16 },
    ];

    const colMercaderistas: ExcelColumn<ResumenMercaderista>[] = [
      { header: "Mercaderista", value: (r) => r.mercaderista, width: 26 },
      { header: "Visitas", value: (r) => r.visitas, width: 10 },
      { header: "PDV visitados", value: (r) => r.pdv, width: 14 },
      { header: "Última visita", value: (r) => r.ultimaVisita?.slice(0, 10) ?? "", width: 14 },
      { header: "% con producto", value: (r) => r.pctProducto ?? "", width: 14 },
      { header: "% con POP", value: (r) => r.pctPop ?? "", width: 12 },
      { header: "% con preciador", value: (r) => r.pctPreciador ?? "", width: 14 },
      { header: "% precio 400g correcto", value: (r) => r.precio400.pctCorrecto ?? "", width: 18 },
      { header: "% precio 800g correcto", value: (r) => r.precio800.pctCorrecto ?? "", width: 18 },
      { header: "% en pasillo de harina", value: (r) => r.pctHarinaTrigo ?? "", width: 18 },
      { header: "Unid. anaquel (prom.)", value: (r) => r.unidadesAnaquelProm ?? "", width: 18 },
      { header: "Caras frontales (prom.)", value: (r) => r.carasFrontalesProm ?? "", width: 18 },
    ];

    // Cada hoja tiene su propia forma de fila; el botón multi-hoja las trata
    // como `unknown` internamente (ver ExportExcelMultiButton).
    return [
      { sheetName: "Resumen", columns: colResumen, rows: resumenRows },
      { sheetName: "Detalle por PDV", columns: colPdv, rows: visibles },
      { sheetName: "Todas las visitas", columns: colVisitas, rows: visitasPeriodo },
      { sheetName: "Por mercaderista", columns: colMercaderistas, rows: porMercaderista },
    ] as unknown as ExcelSheetSpec<unknown>[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visibles,
    visitasPeriodo,
    porMercaderista,
    resumen,
    pdvPorId,
    sectorLabels,
    filtroTexto,
    rangoTexto,
    mercaderista,
    incluirFueraDeCartera,
  ]);

  const COLUMNAS_TABLA = 11;
  const enTabla = visibles.slice(0, TOPE_TABLA);

  return (
    <Card className="mb-6 print-avoid-break">
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between space-y-0">
        <div>
          <CardTitle>Reporte de Mercaderistas — presencia, POP, precio y ubicación</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Lo que reportaron los mercaderistas en los PDV del plan piloto. Los porcentajes se miden sobre la{" "}
            <span className="font-medium">última visita de cada PDV</span> en el período; el corte por mercaderista usa
            todas sus visitas. El universo es toda la cartera del piloto, así que también se ve quién{" "}
            <span className="font-medium">no ha sido visitado</span> y quién fue visitado pero{" "}
            <span className="font-medium">no ha comprado Panquecitas</span> (Radar acumulado = 0). Objetivo de PVP:{" "}
            {sectorLabels.cumana} ${PVP_TARGETS.cumana.p400}/${PVP_TARGETS.cumana.p800} ·{" "}
            {sectorLabels.barquisimeto_este} ${PVP_TARGETS.barquisimeto_este.p400}/$
            {PVP_TARGETS.barquisimeto_este.p800}. {filtroTexto} · {rangoTexto}.
          </p>
        </div>
        <ExportExcelMultiButton
          filename={`Reporte de mercaderistas — ${filtroTexto}${mercaderista ? ` — ${mercaderista}` : ""}`}
          sheets={hojas}
          label={`Descargar reporte (${visibles.length} PDV)`}
        />
      </CardHeader>
      <CardContent>
        {/* ── Filtros ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-3 mb-4 print:hidden">
          <label className="text-xs text-slate-500">
            Mercaderista
            <select
              value={mercaderista ?? ""}
              onChange={(e) => setMercaderista(e.target.value || null)}
              className="block mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 bg-white"
            >
              <option value="">Todos ({data.mercaderistas.length})</option>
              {data.mercaderistas.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="block mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 bg-white"
            />
          </label>
          <label className="text-xs text-slate-500">
            Hasta
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="block mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 bg-white"
            />
          </label>
          <label className="text-xs text-slate-500 grow max-w-xs">
            Buscar PDV
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Código SAP o nombre del cliente"
              className="block w-full mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 bg-white"
            />
          </label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {ESTADOS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setEstado(key)}
                className={`px-3 py-1.5 transition-colors ${
                  estado === key ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {(desde || hasta || mercaderista || busqueda || estado !== "TODOS") && (
            <button
              onClick={() => {
                setDesde("");
                setHasta("");
                setMercaderista(null);
                setBusqueda("");
                setEstado("TODOS");
              }}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              limpiar filtros
            </button>
          )}
          {fueraDeCartera > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={incluirFueraDeCartera}
                onChange={(e) => setIncluirFueraDeCartera(e.target.checked)}
              />
              Incluir {fueraDeCartera} PDV fuera de cartera
            </label>
          )}
        </div>

        {/* ── Vista global ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Kpi
            titulo="Cobertura de visitas"
            valor={pct(resumen.pctCobertura)}
            detalle={`${resumen.visitados} de ${resumen.pdvUniverso} PDV · ${resumen.visitasTotales} visitas`}
          />
          <Kpi
            titulo="Con producto en anaquel"
            valor={pct(resumen.pctProducto)}
            detalle={`${resumen.conProducto} de ${resumen.visitas} PDV visitados`}
          />
          <Kpi
            titulo="Con material POP"
            valor={pct(resumen.pctPop)}
            detalle={`${pct(resumen.pctPreciador)} de ellos con preciador`}
          />
          <Kpi
            titulo="Visitados sin comprar"
            valor={String(resumen.visitadosSinCompra)}
            detalle={`${pct(resumen.pctVisitadosSinCompra)} de los visitados · ${resumen.noVisitados} sin visitar`}
          />
          <Kpi
            titulo="Precio 400g correcto"
            valor={pct(resumen.precio400.pctCorrecto)}
            detalle={`prom. ${usd(resumen.precio400.promedio)} · ${resumen.precio400.observadas} observados`}
          />
          <Kpi
            titulo="Precio 800g correcto"
            valor={pct(resumen.precio800.pctCorrecto)}
            detalle={`prom. ${usd(resumen.precio800.promedio)} · ${resumen.precio800.observadas} observados`}
          />
          <Kpi
            titulo="En pasillo de harina de trigo"
            valor={pct(resumen.pctHarinaTrigo)}
            detalle={`${num(resumen.unidadesAnaquelProm)} unidades y ${num(
              resumen.carasFrontalesProm
            )} caras en promedio`}
          />
          <Kpi
            titulo="Presentaciones que maneja"
            valor={`${pct(resumen.pctDisponible400)} / ${pct(resumen.pctDisponible800)}`}
            detalle={`400g / 800g · ${pct(resumen.pctAccesoDeposito)} con acceso a depósito`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
          <Distribucion titulo="Mensaje del POP" nota="sobre los PDV con material POP" datos={resumen.mensajes} />
          <Distribucion titulo="Materiales POP" nota="sobre los PDV con material POP" datos={resumen.materiales} />
          <Distribucion
            titulo="Ubicación en el anaquel"
            nota="sobre los PDV con producto"
            datos={resumen.ubicaciones}
          />
        </div>

        {/* ── Por mercaderista ─────────────────────────────────────── */}
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          Por mercaderista (todas sus visitas del período)
        </p>
        {porMercaderista.length === 0 ? (
          <p className="text-sm text-slate-400 mb-5">Sin visitas registradas en este corte.</p>
        ) : (
          <div className="max-h-[320px] overflow-y-auto mb-5 border border-slate-100 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mercaderista</TableHead>
                  <TableHead className="text-right">Visitas</TableHead>
                  <TableHead className="text-right">PDV</TableHead>
                  <TableHead className="text-right">Última</TableHead>
                  <TableHead className="text-right">Producto</TableHead>
                  <TableHead className="text-right">POP</TableHead>
                  <TableHead className="text-right">Preciador</TableHead>
                  <TableHead className="text-right">Precio ok 400g</TableHead>
                  <TableHead className="text-right">Precio ok 800g</TableHead>
                  <TableHead className="text-right">Pasillo harina</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porMercaderista.map((m) => (
                  <TableRow
                    key={m.mercaderista}
                    onClick={() => setMercaderista(mercaderista === m.mercaderista ? null : m.mercaderista)}
                    className={`cursor-pointer ${mercaderista === m.mercaderista ? "bg-slate-100" : ""}`}
                  >
                    <TableCell className="font-medium">{m.mercaderista}</TableCell>
                    <TableCell className="text-right">{m.visitas}</TableCell>
                    <TableCell className="text-right">{m.pdv}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {fechaCorta(m.ultimaVisita?.slice(0, 10) ?? null)}
                    </TableCell>
                    <TableCell className="text-right">{pct(m.pctProducto)}</TableCell>
                    <TableCell className="text-right">{pct(m.pctPop)}</TableCell>
                    <TableCell className="text-right">{pct(m.pctPreciador)}</TableCell>
                    <TableCell className="text-right">{pct(m.precio400.pctCorrecto)}</TableCell>
                    <TableCell className="text-right">{pct(m.precio800.pctCorrecto)}</TableCell>
                    <TableCell className="text-right">{pct(m.pctHarinaTrigo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ── PDV por PDV ──────────────────────────────────────────── */}
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            PDV del piloto ({visibles.length})
          </p>
          <p className="text-[11px] text-slate-400 print:hidden">
            clic en un PDV para ver su historial de visitas
            {visibles.length > TOPE_TABLA ? ` · se listan los primeros ${TOPE_TABLA}` : ""}
          </p>
        </div>
        {visibles.length === 0 ? (
          <div className="h-[160px] flex items-center justify-center text-slate-400">
            <div className="text-center">
              <p className="text-4xl mb-2">🛒</p>
              <p>Ningún PDV cumple estos filtros.</p>
            </div>
          </div>
        ) : (
          <div className="max-h-[560px] overflow-auto border border-slate-100 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PDV</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Última visita</TableHead>
                  <TableHead>Mercaderista</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>POP</TableHead>
                  <TableHead className="text-right">400g</TableHead>
                  <TableHead className="text-right">800g</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="text-right">Anaquel</TableHead>
                  <TableHead className="text-right">Radar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enTabla.map((f) => {
                  const v = f.ultimaPeriodo;
                  const abierto = expandido === f.locationId;
                  return (
                    <Fragment key={f.locationId}>
                      <TableRow
                        onClick={() => setExpandido(abierto ? null : f.locationId)}
                        className={`cursor-pointer ${abierto ? "bg-slate-100" : ""}`}
                      >
                        <TableCell className="font-medium">
                          {f.cliente}
                          <p className="text-[11px] font-normal text-slate-400">
                            {f.sapCode} · {ciudad(f.sector)} · {f.segmento ?? SEGMENTO_SIN_DATO}
                            {!f.enCartera && " · fuera de cartera"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[11px] font-normal whitespace-nowrap ${ESTADO_BADGES[f.estadoPeriodo]}`}
                          >
                            {ESTADO_PDV_LABELS[f.estadoPeriodo]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {fechaCorta(v?.dia ?? null)}
                          {f.visitasPeriodo.length > 1 && (
                            <p className="text-[11px] text-slate-400">{f.visitasPeriodo.length} visitas</p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{v?.mercaderista ?? "—"}</TableCell>
                        <TableCell>
                          {v ? si(v.productPresent) : "—"}
                          {v?.productPresent && (
                            <p className="text-[11px] text-slate-400">
                              {v.disponible400 ? "400g" : ""}
                              {v.disponible400 && v.disponible800 ? " y " : ""}
                              {v.disponible800 ? "800g" : ""}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {v ? si(v.popPresent) : "—"}
                          {v?.popPresent && (
                            <p className="text-[11px] text-slate-400">
                              {v.popPreciador === true ? "con preciador" : "sin preciador"}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {usd(v?.precio400 ?? null)}
                          {v?.estado400 && v.estado400 !== "CORRECTO" && (
                            <p className="text-[11px] text-amber-600">{ESTADO_PRECIO_LABELS[v.estado400]}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {usd(v?.precio800 ?? null)}
                          {v?.estado800 && v.estado800 !== "CORRECTO" && (
                            <p className="text-[11px] text-amber-600">{ESTADO_PRECIO_LABELS[v.estado800]}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{v?.ubicaciones.join(", ") || "—"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {v ? `${num(v.unidadesAnaquel)} un.` : "—"}
                          {v?.carasFrontales != null && (
                            <p className="text-[11px] text-slate-400">{v.carasFrontales} caras</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{num(f.radarKg)} kg</TableCell>
                      </TableRow>
                      {abierto && <HistorialPdv fila={f} colSpan={COLUMNAS_TABLA} />}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-[11px] text-slate-400 mt-3">
          Notas: el precio se compara contra el PVP objetivo de la ciudad con tolerancia de ±$0,01 (los precios
          cargados en Bs se convierten con la tasa BCV del día de la visita). &quot;Maneja 400g/800g&quot; sale de la
          casilla &quot;no disponible&quot; del formulario, el único dato por presentación que se captura hoy. El Radar
          es el acumulado del piloto, no el del período filtrado. Con un mercaderista o un rango de fechas activo,
          &quot;no visitado&quot; significa &quot;sin visitas de esa selección&quot;. El formulario no registra fotos
          ni precios de la competencia.
        </p>
      </CardContent>
    </Card>
  );
}
