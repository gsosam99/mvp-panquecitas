"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";
import { SEGMENTOS_SIN_ALIMENTOS } from "@/lib/segmentos";
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
//      inactivos a los que no es realista llegar, con el detalle completo del
//      criterio de descarte para que se pueda auditar sin abrir el código.

const num = (v: number) => v.toLocaleString("es-VE", { maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;

export function ClientesInactivosSegmentos({
  data,
  porCiudad,
  filtroTexto,
}: {
  /** Corte activo (pestañas de arriba) — alimenta la tabla por segmento. */
  data: ActivacionAjustadaResult;
  /** Total + cada ciudad, para la activación ajustada comparada. */
  porCiudad: { label: string; data: ActivacionAjustadaResult }[];
  filtroTexto: string;
}) {
  if (data.universo === 0) return null;

  const columnasExcel: ExcelColumn<InactivosSegmentoRow>[] = [
    { header: "Segmento", value: (r: InactivosSegmentoRow) => r.segmento, width: 26 },
    { header: "PDV en cartera", value: (r: InactivosSegmentoRow) => r.enCartera, width: 16 },
    { header: "Inactivos", value: (r: InactivosSegmentoRow) => r.inactivos, width: 12 },
    { header: "Inactivos que venden PAN", value: (r: InactivosSegmentoRow) => r.inactivosConPan, width: 24 },
    { header: "% de inactivos con PAN", value: (r: InactivosSegmentoRow) => r.inactivosConPanPct, width: 22 },
    { header: "Inactivos sin PAN", value: (r: InactivosSegmentoRow) => r.inactivosSinPan, width: 18 },
    { header: "Segmento sin alimentos", value: (r: InactivosSegmentoRow) => (r.sinAlimentos ? "Sí" : "No"), width: 22 },
    { header: "Descartados", value: (r: InactivosSegmentoRow) => r.descartados, width: 14 },
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
              <span className="font-medium">Venden Harina PAN</span> es la que dice si son alcanzables: un PDV que
              compra PAN mueve alimentos, así que la Panquecita le puede entrar. El que no compra PAN, casi seguro no.
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
            <Resumen titulo="Inactivos" valor={num(data.inactivos)} nota={pct(100 - data.activacionPct)} />
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
                      <TableCell className="font-medium">
                        {r.segmento}
                        {r.sinAlimentos && (
                          <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                            sin alimentos
                          </Badge>
                        )}
                      </TableCell>
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

      {/* ── 2. Activación ajustada ────────────────────────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader>
          <CardTitle>Activación Ajustada — sin los PDV no alcanzables</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            La activación se castiga con PDV donde la Panquecita nunca va a entrar. Acá se sacan del{" "}
            <span className="font-medium">denominador</span> —nunca del numerador— los inactivos que cumplen las{" "}
            <span className="font-medium">tres</span> condiciones a la vez. El detalle de abajo dice exactamente
            cuántos se descartaron y de qué segmento.
          </p>
        </CardHeader>
        <CardContent>
          {/* Criterio, en palabras, antes de los números. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-5 text-xs text-slate-600">
            <p className="font-semibold text-slate-700 mb-1">Un PDV se descarta solo si cumple las tres:</p>
            <ol className="list-decimal ml-5 space-y-0.5">
              <li>
                Está <span className="font-medium">inactivo</span> — cero Radar de Panquecitas.
              </li>
              <li>
                <span className="font-medium">No vende Harina PAN</span> — si vende PAN mueve alimentos, así que se
                queda en el denominador aunque su segmento esté en la lista.
              </li>
              <li>
                Su segmento es de los que <span className="font-medium">no venden alimentos</span>:{" "}
                {SEGMENTOS_SIN_ALIMENTOS.join(" · ")}.
              </li>
            </ol>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {porCiudad.map(({ label, data: d }) => (
              <div key={label} className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-emerald-700">{pct(d.activacionAjustadaPct)}</span>
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
                      +{pct(Math.round((d.activacionAjustadaPct - d.activacionPct) * 10) / 10)}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Detalle del descarte — {filtroTexto}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segmento</TableHead>
                  <TableHead className="text-right">Inactivos</TableHead>
                  <TableHead className="text-right">Venden PAN (se quedan)</TableHead>
                  <TableHead className="text-right">Sin PAN</TableHead>
                  <TableHead className="text-right">Descartados</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.porSegmento
                  .filter((r) => r.inactivos > 0)
                  .map((r) => (
                    <TableRow key={r.segmento} className={r.descartados > 0 ? "bg-amber-50/50" : undefined}>
                      <TableCell className="font-medium">{r.segmento}</TableCell>
                      <TableCell className="text-right">{num(r.inactivos)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{num(r.inactivosConPan)}</TableCell>
                      <TableCell className="text-right text-slate-500">{num(r.inactivosSinPan)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {r.descartados > 0 ? num(r.descartados) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {r.sinAlimentos
                          ? r.descartados > 0
                            ? `Segmento sin alimentos; ${num(r.inactivosConPan)} se salvan por vender PAN`
                            : "Segmento sin alimentos, pero todos sus inactivos venden PAN"
                          : "Segmento con alimentos — no se descarta ninguno"}
                      </TableCell>
                    </TableRow>
                  ))}
                <TableRow className="bg-slate-50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{num(data.inactivos)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{num(data.inactivosConPan)}</TableCell>
                  <TableCell className="text-right">{num(data.inactivos - data.inactivosConPan)}</TableCell>
                  <TableCell className="text-right">{num(data.descartados)}</TableCell>
                  <TableCell />
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
