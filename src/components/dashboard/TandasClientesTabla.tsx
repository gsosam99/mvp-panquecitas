"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelColumn } from "@/lib/export-excel";
import type { CombinacionRow, CombinacionesTanda } from "@/lib/mavesa-queries";

// Activación, recompra, ratio y kilos POR TANDA de incorporación (DIENN,
// 17-09-2026).
//
// La cartera no entró toda el mismo día: 358 PDV el 03-08 y cuatro hitos más
// hasta los 2.110 de hoy. En una sola tabla, los PDV que llevan seis semanas
// vendiendo y los que llevan una quedan promediados y no se puede leer si una
// tanda arrancó bien o mal. El filtro de arriba cambia la tabla entera: cada
// tanda se mira con su propia población, sus activos y sus kilos.
//
// La RECOMPRA se mide sobre los ACTIVOS, no sobre la cartera: un PDV que nunca
// compró no pudo recomprar, y meterlo en el denominador convierte la tasa en
// otra medición de activación.

const num = (v: number) => v.toLocaleString("es-VE", { maximumFractionDigits: 0 });
const kg1 = (v: number) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
const pct = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;
/** Tasa en %, o "—" si el denominador es 0 (0 de 0 no es 0%, es nada que medir). */
const tasa = (parte: number, total: number) => (total > 0 ? pct(Math.round((parte / total) * 1000) / 10) : "—");

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}-${m}-${a}`;
};

export function TandasClientesTabla({ tandas }: { tandas: CombinacionesTanda[] }) {
  const [activa, setActiva] = useState(0);
  if (tandas.length === 0) return null;

  const tanda = tandas[Math.min(activa, tandas.length - 1)];
  const { resultado } = tanda;
  // Una tanda solo abrió ciertos grupos vendedores: las combinaciones sin un
  // PDV suyo se ocultan en vez de mostrar cuatro filas en cero, que es lo que
  // hacía parecer que la tanda no existía. En la cartera completa se muestran
  // las cuatro siempre.
  const filas = tanda.cohorte == null ? resultado.filas : resultado.filas.filter((f) => f.clientes > 0);
  const ocultas = resultado.filas.length - filas.length;

  const columnas: ExcelColumn<CombinacionRow>[] = [
    { header: "Combinación", value: (r) => r.nombre, width: 18 },
    { header: "Ciudad", value: (r) => r.ciudad, width: 20 },
    { header: "Comunicación", value: (r) => r.comunicacion, width: 16 },
    { header: "Grupos vendedores", value: (r) => r.gruposVendedores.join(", "), width: 22 },
    { header: "PDV en cartera", value: (r) => r.clientes, width: 16 },
    { header: "Activos (compraron)", value: (r) => r.activos, width: 20 },
    { header: "Activación (%)", value: (r) => (r.clientes > 0 ? Math.round((r.activos / r.clientes) * 1000) / 10 : null), width: 16 },
    { header: "Recompraron", value: (r) => r.conRecompra, width: 16 },
    {
      header: "Recompra sobre activos (%)",
      value: (r) => (r.activos > 0 ? Math.round((r.conRecompra / r.activos) * 1000) / 10 : null),
      width: 26,
    },
    { header: "Ratio vs Harina PAN (%)", value: (r) => r.ratioHarinaPan, width: 24 },
    { header: "Panquecitas (kg)", value: (r) => r.panquecitasKg, width: 20 },
    { header: "Panquecitas (kg/día hábil)", value: (r) => r.panquecitasKgDia, width: 26 },
    { header: "Harina PAN (kg/día)", value: (r) => r.harinaPanKgDia, width: 20 },
  ];

  const total = filas.reduce(
    (s, f) => ({
      clientes: s.clientes + f.clientes,
      activos: s.activos + f.activos,
      conRecompra: s.conRecompra + f.conRecompra,
      kg: s.kg + f.panquecitasKg,
    }),
    { clientes: 0, activos: 0, conRecompra: 0, kg: 0 }
  );

  return (
    <Card className="mb-6 print-avoid-break">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle>Clientes por tanda de incorporación</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            La cartera no entró toda el mismo día: arrancó con los 358 del plan original el 03-08-2026 y se amplió en
            cuatro hitos más. Elegí una tanda arriba y la tabla entera pasa a ser la de esos PDV — su activación, su
            recompra, su ratio y sus kilos, contados desde el día en que esa tanda entró a la cartera.
          </p>
        </div>
        <ExportExcelButton
          filename={`Tandas — ${tanda.etiqueta}`}
          rows={filas}
          columns={columnas}
          className="shrink-0"
        />
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4 print:hidden">
          {tandas.map((t, i) => (
            <button
              key={t.etiqueta}
              onClick={() => setActiva(i)}
              title={t.desde ? `PDV incorporados el ${fechaCorta(t.desde)}` : "Toda la cartera vigente"}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                i === activa
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {t.etiqueta}
              <span className={`ml-2 font-normal ${i === activa ? "text-slate-300" : "text-slate-400"}`}>
                {num(t.resultado.filas.reduce((s, f) => s + f.clientes, 0) + t.resultado.sinCombinacion)} PDV
              </span>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Combinación</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Comunicación</TableHead>
                <TableHead>Grupos</TableHead>
                <TableHead className="text-right">PDV</TableHead>
                <TableHead className="text-right">Activos</TableHead>
                <TableHead className="text-right">Activación</TableHead>
                <TableHead className="text-right">Recompraron</TableHead>
                <TableHead className="text-right">Recompra s/ activos</TableHead>
                <TableHead className="text-right">Ratio Harina PAN</TableHead>
                <TableHead className="text-right">Ventas kg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.numero}>
                  <TableCell className="font-medium whitespace-nowrap">{f.nombre}</TableCell>
                  <TableCell className="text-slate-500">{f.ciudad}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-normal ${
                        f.comunicacion === "Nutrición"
                          ? "border-emerald-300 text-emerald-700"
                          : "border-sky-300 text-sky-700"
                      }`}
                    >
                      {f.comunicacion}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                    {f.gruposVendedores.join(", ")}
                  </TableCell>
                  <TableCell className="text-right text-slate-500">{num(f.clientes)}</TableCell>
                  <TableCell className="text-right">{num(f.activos)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-700">
                    {tasa(f.activos, f.clientes)}
                  </TableCell>
                  <TableCell className="text-right">{num(f.conRecompra)}</TableCell>
                  <TableCell className="text-right font-semibold text-violet-700">
                    {tasa(f.conRecompra, f.activos)}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-blue-700">{pct(f.ratioHarinaPan)}</TableCell>
                  <TableCell className="text-right font-semibold">{kg1(f.panquecitasKg)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-slate-50 font-semibold">
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell className="text-right">{num(total.clientes)}</TableCell>
                <TableCell className="text-right">{num(total.activos)}</TableCell>
                <TableCell className="text-right">{tasa(total.activos, total.clientes)}</TableCell>
                <TableCell className="text-right">{num(total.conRecompra)}</TableCell>
                <TableCell className="text-right">{tasa(total.conRecompra, total.activos)}</TableCell>
                <TableCell className="text-right text-xs font-normal text-slate-400">los ratios no se suman</TableCell>
                <TableCell className="text-right">{kg1(total.kg)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-slate-400 mt-3">
          <span className="font-medium text-slate-600">Activos</span> son los PDV de la tanda que compraron Panquecitas
          al menos una vez desde el {resultado.desdePanquecitas}, y{" "}
          <span className="font-medium text-slate-600">Recompraron</span> los que compraron en 2 o más fechas distintas
          — una devolución no cuenta como compra. La tasa de recompra se mide{" "}
          <span className="font-medium text-slate-600">sobre los activos</span>, no sobre la cartera: quien nunca compró
          no pudo recomprar. El <span className="font-medium text-slate-600">Ratio Harina PAN</span> es el mismo de la
          tabla de combinaciones, pero medido en la ventana de ESTA tanda: Panquecitas de esos PDV desde el{" "}
          {resultado.desdePanquecitas} ÷ {resultado.diasPanquecitas} días hábiles transcurridos desde esa fecha, contra
          su Harina PAN de mayo–julio ÷ {resultado.diasReferencia} días hábiles.{" "}
          {tanda.desde && (
            <>
              Esta tanda se incorporó el <span className="font-medium text-slate-600">{fechaCorta(tanda.desde)}</span>:
              antes de esa fecha sus PDV no eran cartera y no podían vender, así que sus kilos y su divisor arrancan
              ahí. Con el divisor de todo el piloto el ratio salía a una fracción del real.{" "}
            </>
          )}
          {ocultas > 0 && (
            <>
              Se ocultan {ocultas} combinaciones sin PDV en esta tanda: solo se abrieron los grupos vendedores que se
              ven arriba.{" "}
            </>
          )}
          {resultado.sinCombinacion > 0 && (
            <>
              <span className="font-medium text-amber-700">
                {num(resultado.sinCombinacion)} PDV de esta tanda quedaron fuera de toda combinación
              </span>{" "}
              porque su grupo vendedor no está mapeado
              {resultado.gruposSinMapear.length > 0 && <> ({resultado.gruposSinMapear.join(", ")})</>}: no suman en las
              filas de arriba.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
