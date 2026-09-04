"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";
import { esTipoSinAlimentosPorDefecto, foldSegmento } from "@/lib/segmentos";
import type { ExcelColumn } from "@/lib/export-excel";
import type { ActivacionAjustadaResult, InactivosSegmentoRow } from "@/lib/dienn-queries";

// Dos tarjetas al cierre del dashboard (DIENN, 03-09-2026):
//
//   1. "Clientes inactivos por segmento" — a qué segmentos pertenecen los PDV
//      de la cartera que todavía no compran Panquecitas, y cuántos de ellos
//      venden Harina PAN. Vender PAN es la señal de que el PDV mueve
//      alimentos: un inactivo que vende PAN es alcanzable, uno que no, casi
//      seguro no lo es.
//
//   2. "Activación ajustada" — la activación sacando del denominador los
//      inactivos a los que no es realista llegar.
//
// El descarte es SELECCIONABLE por tipo de cliente, no una lista fija en el
// código. La razón es concreta: el criterio todavía se está cerrando con
// ventas y a nivel de segmento no se puede expresar (en Barquisimeto los
// segmentos sin alimentos llegan a 147 PDV y ventas reporta al menos 224),
// pero esa lista de ventas no está disponible. Antes que fijar una regla que
// cuadre por casualidad, se deja marcar y desmarcar tipos con el conteo al
// lado y el resultado recalculándose en el momento.
//
// Todo el ajuste es aritmética aditiva sobre conteos que ya vienen del
// servidor, así que se recalcula en el cliente sin volver a pedir datos.

const num = (v: number) => v.toLocaleString("es-VE", { maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;

export function ClientesInactivosSegmentos({
  data,
  porCiudad,
  filtroTexto,
}: {
  /** Corte activo (pestañas de arriba) — alimenta las tablas de detalle. */
  data: ActivacionAjustadaResult;
  /** Total + cada ciudad, para comparar la activación ajustada de los tres. */
  porCiudad: { label: string; data: ActivacionAjustadaResult }[];
  filtroTexto: string;
}) {
  // Los tipos marcados se guardan NORMALIZADOS (foldSegmento) para que la
  // comparación no dependa de tildes ni de mayúsculas: los valores salen de un
  // Excel y llegan con variaciones.
  const defaultExcluidos = useMemo(() => {
    const set = new Set<string>();
    for (const { data: d } of porCiudad) {
      for (const t of d.porTipo) {
        if (esTipoSinAlimentosPorDefecto(t.tipo)) set.add(foldSegmento(t.tipo));
      }
    }
    return set;
  }, [porCiudad]);

  const [tiposExcluidos, setTiposExcluidos] = useState<Set<string>>(defaultExcluidos);

  function toggleTipo(key: string) {
    setTiposExcluidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(key)) siguiente.delete(key);
      else siguiente.add(key);
      return siguiente;
    });
  }

  // Recálculo del ajuste con la selección vigente. Los descartados salen
  // SIEMPRE de los inactivos sin PAN, así que nunca se puede comer un cliente
  // que sí compró: el numerador no se toca.
  const ajustadaPorCiudad = useMemo(
    () =>
      porCiudad.map(({ label, data: d }) => {
        const descartados = d.porTipo
          .filter((t) => tiposExcluidos.has(foldSegmento(t.tipo)))
          .reduce((s, t) => s + t.inactivosSinPan, 0);
        const universoAjustado = d.universo - descartados;
        return {
          label,
          universo: d.universo,
          activos: d.activos,
          activacionPct: d.activacionPct,
          descartados,
          universoAjustado,
          ajustadaPct: universoAjustado > 0 ? Math.round((d.activos / universoAjustado) * 1000) / 10 : 0,
        };
      }),
    [porCiudad, tiposExcluidos]
  );

  const descartadosCorte = useMemo(
    () =>
      data.porTipo
        .filter((t) => tiposExcluidos.has(foldSegmento(t.tipo)))
        .reduce((s, t) => s + t.inactivosSinPan, 0),
    [data, tiposExcluidos]
  );

  if (data.universo === 0) return null;

  const columnasExcel: ExcelColumn<InactivosSegmentoRow>[] = [
    { header: "Segmento", value: (r) => r.segmento, width: 26 },
    { header: "PDV en cartera", value: (r) => r.enCartera, width: 16 },
    { header: "Inactivos", value: (r) => r.inactivos, width: 12 },
    { header: "Inactivos que venden PAN", value: (r) => r.inactivosConPan, width: 24 },
    { header: "% de inactivos con PAN", value: (r) => r.inactivosConPanPct, width: 22 },
    { header: "Inactivos sin PAN", value: (r) => r.inactivosSinPan, width: 18 },
  ];

  return (
    <>
      {/* ── 1. Inactivos por segmento ─────────────────────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div>
            <CardTitle>Clientes Inactivos por Segmento</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              PDV de la cartera <span className="font-medium">sin una sola venta de Panquecitas</span> en Carga Radar,
              agrupados por su <span className="font-medium">Segmento de Clientes 2</span>. La columna{" "}
              <span className="font-medium">Venden PAN</span> es la que dice si son alcanzables: un PDV que compra
              Harina PAN mueve alimentos, así que la Panquecita le puede entrar. El que no compra PAN, casi seguro no.
            </p>
          </div>
          <ExportExcelButton
            filename={`Inactivos por segmento — ${filtroTexto}`}
            rows={data.porSegmento}
            columns={columnasExcel}
          />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Resumen titulo="Cartera del corte" valor={num(data.universo)} />
            <Resumen titulo="Activos" valor={num(data.activos)} nota={pct(data.activacionPct)} tono="verde" />
            <Resumen
              titulo="Inactivos"
              valor={num(data.inactivos)}
              nota={pct(Math.round((100 - data.activacionPct) * 10) / 10)}
            />
            <Resumen
              titulo="Inactivos que venden PAN"
              valor={num(data.inactivosConPan)}
              nota={`${pct(data.inactivosConPanPct)} de los inactivos`}
              tono="ambar"
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segmento</TableHead>
                  <TableHead className="text-right">En cartera</TableHead>
                  <TableHead className="text-right">Inactivos</TableHead>
                  <TableHead className="text-right">Venden PAN</TableHead>
                  <TableHead className="text-right">% con PAN</TableHead>
                  <TableHead className="text-right">Sin PAN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.porSegmento
                  .filter((r) => r.inactivos > 0)
                  .map((r) => (
                    <TableRow key={r.segmento}>
                      <TableCell className="font-medium">{r.segmento}</TableCell>
                      <TableCell className="text-right text-slate-500">{num(r.enCartera)}</TableCell>
                      <TableCell className="text-right font-semibold">{num(r.inactivos)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{num(r.inactivosConPan)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{pct(r.inactivosConPanPct)}</TableCell>
                      <TableCell className="text-right text-slate-500">{num(r.inactivosSinPan)}</TableCell>
                    </TableRow>
                  ))}
                <TableRow className="bg-slate-50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{num(data.universo)}</TableCell>
                  <TableCell className="text-right">{num(data.inactivos)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{num(data.inactivosConPan)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{pct(data.inactivosConPanPct)}</TableCell>
                  <TableCell className="text-right">{num(data.inactivos - data.inactivosConPan)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Activación ajustada, con el descarte SELECCIONABLE ─────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader>
          <CardTitle>Activación Ajustada — sin los PDV no alcanzables</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            La activación se castiga con PDV donde la Panquecita nunca va a entrar. Acá se sacan del{" "}
            <span className="font-medium">denominador</span> —nunca del numerador— los inactivos que cumplen las tres
            condiciones. <span className="font-medium">Los tipos de cliente se eligen abajo</span>: marca y desmarca, y
            los tres números de arriba se recalculan al instante.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-5 text-xs text-slate-600">
            <p className="font-semibold text-slate-700 mb-1">Un PDV se descarta solo si cumple las tres:</p>
            <ol className="list-decimal ml-5 space-y-0.5">
              <li>
                Está <span className="font-medium">inactivo</span> — cero Radar de Panquecitas.
              </li>
              <li>
                <span className="font-medium">No vende Harina PAN</span> — si vende PAN mueve alimentos, así que se
                queda en el denominador aunque su tipo esté marcado.
              </li>
              <li>
                Su <span className="font-medium">tipo de cliente</span> está marcado abajo como no vendible.
              </li>
            </ol>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {ajustadaPorCiudad.map((d) => (
              <div key={d.label} className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{d.label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-emerald-700">{pct(d.ajustadaPct)}</span>
                  <span className="text-xs text-slate-400">ajustada</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {num(d.activos)} activos ÷ {num(d.universoAjustado)} PDV alcanzables
                </p>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-0.5">
                  <p>
                    Sin ajustar: <span className="font-medium text-slate-700">{pct(d.activacionPct)}</span> (
                    {num(d.activos)} ÷ {num(d.universo)})
                  </p>
                  <p>
                    Descartados: <span className="font-medium text-slate-700">{num(d.descartados)}</span> PDV ·{" "}
                    <span className="font-medium text-emerald-700">
                      +{pct(Math.round((d.ajustadaPct - d.activacionPct) * 10) / 10)}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Selector de tipos no vendibles. */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Tipos de cliente marcados como no vendibles
            </p>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={() => setTiposExcluidos(new Set(data.porTipo.map((t) => foldSegmento(t.tipo))))}
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50"
              >
                Marcar todos
              </button>
              <button
                onClick={() => setTiposExcluidos(new Set())}
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50"
              >
                Ninguno
              </button>
              <button
                onClick={() => setTiposExcluidos(new Set(defaultExcluidos))}
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50"
              >
                Volver al sugerido
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            El número entre paréntesis es cuántos PDV descartaría ese tipo en el corte activo: inactivos que además no
            venden Harina PAN. Los tipos que no descartarían a nadie no se muestran.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-5 print:hidden">
            {data.porTipo
              .filter((t) => t.inactivosSinPan > 0)
              .map((t) => {
                const key = foldSegmento(t.tipo);
                const marcado = tiposExcluidos.has(key);
                return (
                  <button
                    key={t.tipo}
                    onClick={() => toggleTipo(key)}
                    className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                      marcado
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {t.tipo} <span className="font-semibold">({t.inactivosSinPan})</span>
                  </button>
                );
              })}
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Detalle del descarte — {filtroTexto}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de cliente</TableHead>
                  <TableHead className="text-right">En cartera</TableHead>
                  <TableHead className="text-right">Inactivos</TableHead>
                  <TableHead className="text-right">Venden PAN (se quedan)</TableHead>
                  <TableHead className="text-right">Sin PAN</TableHead>
                  <TableHead className="text-right">Descartados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.porTipo
                  .filter((t) => t.inactivos > 0)
                  .map((t) => {
                    const marcado = tiposExcluidos.has(foldSegmento(t.tipo));
                    return (
                      <TableRow key={t.tipo} className={marcado ? "bg-amber-50/50" : undefined}>
                        <TableCell className="font-medium">
                          {t.tipo}
                          {marcado && (
                            <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                              no vendible
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-slate-500">{num(t.enCartera)}</TableCell>
                        <TableCell className="text-right">{num(t.inactivos)}</TableCell>
                        <TableCell className="text-right text-emerald-700">{num(t.inactivosConPan)}</TableCell>
                        <TableCell className="text-right text-slate-500">{num(t.inactivosSinPan)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {marcado ? num(t.inactivosSinPan) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                <TableRow className="bg-slate-50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{num(data.universo)}</TableCell>
                  <TableCell className="text-right">{num(data.inactivos)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{num(data.inactivosConPan)}</TableCell>
                  <TableCell className="text-right">{num(data.inactivos - data.inactivosConPan)}</TableCell>
                  <TableCell className="text-right">{num(descartadosCorte)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Resumen({
  titulo,
  valor,
  nota,
  tono,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  tono?: "verde" | "ambar";
}) {
  const color = tono === "verde" ? "text-emerald-700" : tono === "ambar" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 leading-tight">{titulo}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{valor}</p>
      {nota && <p className="text-xs text-slate-400 mt-0.5">{nota}</p>}
    </div>
  );
}
