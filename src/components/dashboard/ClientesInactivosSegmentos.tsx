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
//      de la cartera que todavía no compran Panquecitas, cuántos son de cada
//      uno, y cuántos venden Harina PAN. Lo de PAN es INFORMATIVO: no entra en
//      ningún descarte.
//
//   2. "Activación ajustada" — la activación sacando del denominador a los
//      inactivos de los segmentos donde no se puede vender alimentos.
//
// El criterio son DOS condiciones: inactivo + segmento en la lista. Nada más.
// Un cliente activo nunca se descarta —ya se le vendió— así que el ajuste solo
// achica el denominador y el numerador queda intacto.

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
  if (data.universo === 0) return null;

  const columnasExcel: ExcelColumn<InactivosSegmentoRow>[] = [
    { header: "Segmento", value: (r) => r.segmento, width: 26 },
    { header: "PDV en cartera", value: (r) => r.enCartera, width: 16 },
    { header: "Inactivos", value: (r) => r.inactivos, width: 12 },
    { header: "Inactivos que venden PAN", value: (r) => r.inactivosConPan, width: 24 },
    { header: "% de inactivos con PAN", value: (r) => r.inactivosConPanPct, width: 22 },
    { header: "Inactivos sin PAN", value: (r) => r.inactivosSinPan, width: 18 },
    { header: "Segmento no vendible", value: (r) => (r.sinAlimentos ? "Sí" : "No"), width: 20 },
    { header: "Descartados", value: (r) => r.descartados, width: 14 },
  ];

  return (
    <>
      {/* ── 1. Inactivos por segmento (informativo) ───────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div>
            <CardTitle>Clientes Inactivos por Segmento</CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              PDV de la cartera <span className="font-medium">sin una sola venta de Panquecitas</span> en Carga Radar,
              agrupados por su <span className="font-medium">Segmento de Clientes 2</span>, y cuántos de ellos compran
              Harina PAN. La columna de PAN es <span className="font-medium">informativa</span>: dice qué tan a mano
              está ese inactivo —quien ya compra PAN mueve alimentos— pero no interviene en ningún descarte.
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

      {/* ── 2. Activación ajustada ────────────────────────────────────── */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader>
          <CardTitle>Activación Ajustada — sin los PDV no vendibles</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            La activación se castiga con PDV donde no se puede vender alimentos. Acá se sacan del{" "}
            <span className="font-medium">denominador</span> —nunca del numerador— los inactivos de esos segmentos. El
            mismo criterio se puede superponer en el gráfico de efectividad con los botones{" "}
            <span className="font-medium">Cumaná a escala</span> y{" "}
            <span className="font-medium">Cabudare a escala</span>.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-5 text-xs text-slate-600">
            <p className="font-semibold text-slate-700 mb-1">Un PDV se descarta si cumple las dos:</p>
            <ol className="list-decimal ml-5 space-y-0.5">
              <li>
                Está <span className="font-medium">inactivo</span> — cero Radar de Panquecitas. Un cliente activo no se
                descarta nunca, esté en el segmento que esté.
              </li>
              <li>
                Su segmento es de los que <span className="font-medium">no venden alimentos</span>:{" "}
                {SEGMENTOS_SIN_ALIMENTOS.join(" · ")}.
              </li>
            </ol>
            <p className="mt-2 text-slate-500">
              Que el PDV compre Harina PAN o no <span className="font-medium">no influye</span> en el descarte — ese
              dato es informativo y vive en la tarjeta de arriba.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {porCiudad.map(({ label, data: d }) => (
              <div key={label} className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-teal-700">{pct(d.activacionAjustadaPct)}</span>
                  <span className="text-xs text-slate-400">ajustada</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {num(d.activos)} activos ÷ {num(d.universoAjustado)} PDV vendibles
                </p>
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-0.5">
                  <p>
                    Sin ajustar: <span className="font-medium text-slate-700">{pct(d.activacionPct)}</span> (
                    {num(d.activos)} ÷ {num(d.universo)})
                  </p>
                  <p>
                    Descartados: <span className="font-medium text-slate-700">{num(d.descartados)}</span> PDV ·{" "}
                    <span className="font-medium text-teal-700">
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
                  <TableHead className="text-right">En cartera</TableHead>
                  <TableHead className="text-right">Inactivos</TableHead>
                  <TableHead className="text-right">De ellos, venden PAN</TableHead>
                  <TableHead className="text-right">Descartados</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.porSegmento
                  .filter((r) => r.inactivos > 0)
                  .map((r) => (
                    <TableRow key={r.segmento} className={r.descartados > 0 ? "bg-teal-50/60" : undefined}>
                      <TableCell className="font-medium">
                        {r.segmento}
                        {r.sinAlimentos && (
                          <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                            no vendible
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-slate-500">{num(r.enCartera)}</TableCell>
                      <TableCell className="text-right">{num(r.inactivos)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{num(r.inactivosConPan)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {r.descartados > 0 ? num(r.descartados) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {r.sinAlimentos
                          ? "Segmento no vendible — se descartan todos sus inactivos"
                          : "Segmento vendible — no se descarta ninguno"}
                      </TableCell>
                    </TableRow>
                  ))}
                <TableRow className="bg-slate-50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{num(data.universo)}</TableCell>
                  <TableCell className="text-right">{num(data.inactivos)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{num(data.inactivosConPan)}</TableCell>
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
