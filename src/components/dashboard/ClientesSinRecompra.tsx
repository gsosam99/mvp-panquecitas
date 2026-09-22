"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportExcelMultiButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelSheetSpec } from "@/lib/export-excel";
import type { Sector } from "@/lib/sectors";
import {
  DIAS_SIN_RECOMPRA,
  type ClienteAlertaRow,
  type ClientesSinRecompraResult,
  type MotivoAlerta,
} from "@/lib/clientes-sin-recompra-utils";

// Clientes que compraron Panquecitas pero no se consolidan: una sola compra
// hace 14+ días, o 2+ compras con la última hace 14+ días. Quien compró hace
// menos de 14 días no es alerta. Query/criterio en clientes-sin-recompra.ts.

const MOTIVOS: MotivoAlerta[] = ["UNA_COMPRA", "SIN_RECOMPRA"];

const MOTIVO_LABELS: Record<MotivoAlerta, string> = {
  UNA_COMPRA: "Solo 1 compra",
  SIN_RECOMPRA: "+2 semanas sin pedir",
  AMBOS: "Ambos", // deprecado — ya no se asigna
};

const MOTIVO_NOTAS: Record<MotivoAlerta, string> = {
  UNA_COMPRA: `1 compra, hace ${DIAS_SIN_RECOMPRA}+ días`,
  SIN_RECOMPRA: `2+ compras, la última hace ${DIAS_SIN_RECOMPRA}+ días`,
  AMBOS: `1 compra, hace ${DIAS_SIN_RECOMPRA}+ días`,
};

const MOTIVO_BADGES: Record<MotivoAlerta, string> = {
  UNA_COMPRA: "border-sky-300 text-sky-700 bg-sky-50",
  SIN_RECOMPRA: "border-amber-300 text-amber-700 bg-amber-50",
  AMBOS: "border-rose-300 text-rose-700 bg-rose-50",
};

const num = (v: number) => v.toLocaleString("es-VE", { maximumFractionDigits: 1 });
const pct = (parte: number, total: number) =>
  total > 0 ? `${((parte / total) * 100).toLocaleString("es-VE", { maximumFractionDigits: 1 })}%` : "—";
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

interface Conteo {
  total: number;
  UNA_COMPRA: number;
  SIN_RECOMPRA: number;
  AMBOS: number;
}

function contar(rows: ClienteAlertaRow[]): Conteo {
  const c: Conteo = { total: rows.length, UNA_COMPRA: 0, SIN_RECOMPRA: 0, AMBOS: 0 };
  for (const r of rows) c[r.motivo] += 1;
  return c;
}

export function ClientesSinRecompra({
  data,
  sector,
  filtroTexto,
  sectorLabels,
}: {
  data: ClientesSinRecompraResult;
  /** Pestaña activa del dashboard: acota segmentos y lista. */
  sector: "TOTAL" | Sector;
  filtroTexto: string;
  sectorLabels: Record<Sector, string>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoAlerta | "TODOS">("TODOS");
  const [segmento, setSegmento] = useState("");

  const sectores = useMemo(() => Object.keys(sectorLabels) as Sector[], [sectorLabels]);

  const porCiudad = useMemo(() => {
    const filas = sectores.map((s) => ({
      label: sectorLabels[s],
      compradores: data.compradores[s],
      ...contar(data.clientes.filter((c) => c.sector === s)),
    }));
    return [
      ...filas,
      {
        label: "Total",
        compradores: sectores.reduce((acc, s) => acc + data.compradores[s], 0),
        ...contar(data.clientes),
      },
    ];
  }, [data, sectores, sectorLabels]);

  const delCorte = useMemo(
    () => (sector === "TOTAL" ? data.clientes : data.clientes.filter((c) => c.sector === sector)),
    [data.clientes, sector]
  );

  const porSegmento = useMemo(() => {
    const grupos = new Map<string, ClienteAlertaRow[]>();
    for (const c of delCorte) {
      const lista = grupos.get(c.segmento) ?? [];
      lista.push(c);
      grupos.set(c.segmento, lista);
    }
    return [...grupos.entries()]
      .map(([seg, rows]) => ({ segmento: seg, ...contar(rows) }))
      .sort((a, b) => b.total - a.total || a.segmento.localeCompare(b.segmento));
  }, [delCorte]);

  const lista = useMemo(
    () =>
      delCorte.filter(
        (c) => (motivo === "TODOS" || c.motivo === motivo) && (!segmento || c.segmento === segmento)
      ),
    [delCorte, motivo, segmento]
  );

  if (!data.fechaCorte) return null;

  const totalCorte = contar(delCorte);
  const compradoresCorte =
    sector === "TOTAL" ? porCiudad[porCiudad.length - 1].compradores : data.compradores[sector];

  const abrirLista = (seg: string, m: MotivoAlerta | "TODOS" = "TODOS") => {
    setSegmento(seg);
    setMotivo(m);
    setAbierto(true);
  };

  const hojas: ExcelSheetSpec<unknown>[] = [
    {
      sheetName: "Por ciudad",
      rows: porCiudad,
      columns: [
        { header: "Ciudad", value: (r) => (r as (typeof porCiudad)[number]).label, width: 22 },
        { header: "Clientes con compra", value: (r) => (r as (typeof porCiudad)[number]).compradores, width: 18 },
        { header: "Total", value: (r) => (r as (typeof porCiudad)[number]).total, width: 12 },
        { header: "Solo 1 compra", value: (r) => (r as (typeof porCiudad)[number]).UNA_COMPRA, width: 14 },
        {
          header: "% Solo 1 compra",
          value: (r) => {
            const row = r as (typeof porCiudad)[number];
            return pct(row.UNA_COMPRA, row.compradores);
          },
          width: 14,
        },
        { header: "+2 semanas sin pedir", value: (r) => (r as (typeof porCiudad)[number]).SIN_RECOMPRA, width: 20 },
        {
          header: "% +2 semanas sin pedir",
          value: (r) => {
            const row = r as (typeof porCiudad)[number];
            return pct(row.SIN_RECOMPRA, row.compradores);
          },
          width: 18,
        },
      ],
    },
    {
      sheetName: "Por segmento",
      rows: porSegmento,
      columns: [
        { header: "Segmento", value: (r) => (r as (typeof porSegmento)[number]).segmento, width: 26 },
        { header: "Total", value: (r) => (r as (typeof porSegmento)[number]).total, width: 12 },
        { header: "Solo 1 compra", value: (r) => (r as (typeof porSegmento)[number]).UNA_COMPRA, width: 14 },
        {
          header: "% Solo 1 compra",
          value: (r) => pct((r as (typeof porSegmento)[number]).UNA_COMPRA, compradoresCorte),
          width: 14,
        },
        { header: "+2 semanas sin pedir", value: (r) => (r as (typeof porSegmento)[number]).SIN_RECOMPRA, width: 20 },
        {
          header: "% +2 semanas sin pedir",
          value: (r) => pct((r as (typeof porSegmento)[number]).SIN_RECOMPRA, compradoresCorte),
          width: 18,
        },
      ],
    },
    {
      sheetName: "Clientes",
      rows: delCorte,
      columns: [
        { header: "Código SAP", value: (r) => (r as ClienteAlertaRow).sapCode, width: 14 },
        { header: "Cliente", value: (r) => (r as ClienteAlertaRow).nombre, width: 34 },
        { header: "Ciudad", value: (r) => sectorLabels[(r as ClienteAlertaRow).sector], width: 20 },
        { header: "Municipio", value: (r) => (r as ClienteAlertaRow).municipio ?? "", width: 18 },
        { header: "Segmento", value: (r) => (r as ClienteAlertaRow).segmento, width: 24 },
        { header: "Motivo", value: (r) => MOTIVO_LABELS[(r as ClienteAlertaRow).motivo], width: 20 },
        { header: "Compras", value: (r) => (r as ClienteAlertaRow).compras, width: 10 },
        { header: "Primera compra", value: (r) => (r as ClienteAlertaRow).primeraCompra, width: 14 },
        { header: "Última compra", value: (r) => (r as ClienteAlertaRow).ultimaCompra, width: 14 },
        { header: "Días sin pedir", value: (r) => (r as ClienteAlertaRow).diasSinPedir, width: 14 },
        { header: "Radar acumulado (kg)", value: (r) => (r as ClienteAlertaRow).kgAcumulado, width: 18 },
      ],
    },
  ];

  return (
    <Card className="mb-6 print-avoid-break">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle>Clientes sin Recompra</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            PDV de la cartera que <span className="font-medium">ya compraron Panquecitas</span> y llevan{" "}
            <span className="font-medium">{DIAS_SIN_RECOMPRA} días o más sin pedir</span> (respecto de la última
            fecha del Radar: <span className="font-medium">{fechaCorta(data.fechaCorte)}</span>).{" "}
            <span className="font-medium">Solo 1 compra</span> = una sola fecha Radar hace {DIAS_SIN_RECOMPRA}+ días.{" "}
            <span className="font-medium">+2 semanas sin pedir</span> = 2 o más fechas, la última hace{" "}
            {DIAS_SIN_RECOMPRA}+ días. Quien compró hace menos de {DIAS_SIN_RECOMPRA} días no cuenta como alerta.
          </p>
        </div>
        <ExportExcelMultiButton filename={`Clientes sin recompra — ${filtroTexto}`} sheets={hojas} />
      </CardHeader>
      <CardContent>
        {/* ── Indicadores del corte ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <Resumen
            titulo="Total"
            valor={num(totalCorte.total)}
            nota={`${pct(totalCorte.total, compradoresCorte)} de ${num(compradoresCorte)} con compra`}
          />
          {MOTIVOS.map((m) => (
            <Resumen
              key={m}
              titulo={MOTIVO_LABELS[m]}
              valor={num(totalCorte[m])}
              nota={`${pct(totalCorte[m], compradoresCorte)} de ${num(compradoresCorte)} con compra · ${MOTIVO_NOTAS[m]}`}
              clase={MOTIVO_BADGES[m]}
            />
          ))}
        </div>

        {/* ── Por ciudad ─────────────────────────────────────────────── */}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Por ciudad</p>
        <div className="overflow-x-auto mb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ciudad</TableHead>
                <TableHead className="text-right">Con compra</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">% total</TableHead>
                {MOTIVOS.map((m) => (
                  <TableHead key={m} className="text-right">
                    {MOTIVO_LABELS[m]}
                  </TableHead>
                ))}
                {MOTIVOS.map((m) => (
                  <TableHead key={`${m}-pct`} className="text-right">
                    % {MOTIVO_LABELS[m]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {porCiudad.map((f) => (
                <TableRow key={f.label} className={f.label === "Total" ? "bg-slate-50 font-semibold" : undefined}>
                  <TableCell className="font-medium">{f.label}</TableCell>
                  <TableCell className="text-right text-slate-500">{num(f.compradores)}</TableCell>
                  <TableCell className="text-right font-semibold">{num(f.total)}</TableCell>
                  <TableCell className="text-right text-slate-500">{pct(f.total, f.compradores)}</TableCell>
                  {MOTIVOS.map((m) => (
                    <TableCell key={m} className="text-right">
                      {num(f[m])}
                    </TableCell>
                  ))}
                  {MOTIVOS.map((m) => (
                    <TableCell key={`${m}-pct`} className="text-right text-slate-500">
                      {pct(f[m], f.compradores)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* ── Por segmento (corte activo) ────────────────────────────── */}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Por segmento — {filtroTexto}
          <span className="normal-case font-normal tracking-normal ml-2">(clic en un número para ver esos clientes)</span>
        </p>
        <div className="overflow-x-auto mb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segmento</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {MOTIVOS.map((m) => (
                  <TableHead key={m} className="text-right">
                    {MOTIVO_LABELS[m]}
                  </TableHead>
                ))}
                {MOTIVOS.map((m) => (
                  <TableHead key={`${m}-pct`} className="text-right">
                    % {MOTIVO_LABELS[m]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {porSegmento.map((f) => (
                <TableRow key={f.segmento}>
                  <TableCell className="font-medium">{f.segmento}</TableCell>
                  <TableCell className="text-right font-semibold">
                    <Numero valor={f.total} onClick={() => abrirLista(f.segmento)} />
                  </TableCell>
                  {MOTIVOS.map((m) => (
                    <TableCell key={m} className="text-right">
                      <Numero valor={f[m]} onClick={() => abrirLista(f.segmento, m)} />
                    </TableCell>
                  ))}
                  {MOTIVOS.map((m) => (
                    <TableCell key={`${m}-pct`} className="text-right text-slate-500">
                      {pct(f[m], compradoresCorte)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              <TableRow className="bg-slate-50 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  <Numero valor={totalCorte.total} onClick={() => abrirLista("")} />
                </TableCell>
                {MOTIVOS.map((m) => (
                  <TableCell key={m} className="text-right">
                    <Numero valor={totalCorte[m]} onClick={() => abrirLista("", m)} />
                  </TableCell>
                ))}
                {MOTIVOS.map((m) => (
                  <TableCell key={`${m}-pct`} className="text-right text-slate-500">
                    {pct(totalCorte[m], compradoresCorte)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* ── Lista desplegable ──────────────────────────────────────── */}
        <button
          onClick={() => setAbierto((v) => !v)}
          className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 print:hidden"
        >
          <span>
            {abierto ? "Ocultar" : "Ver"} lista de clientes ({num(lista.length)})
          </span>
          <span className="text-slate-400">{abierto ? "▲" : "▼"}</span>
        </button>

        {abierto && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {(["TODOS", ...MOTIVOS] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMotivo(m)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    motivo === m
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {m === "TODOS" ? "Todos" : MOTIVO_LABELS[m]}
                </button>
              ))}
              <select
                value={segmento}
                onChange={(e) => setSegmento(e.target.value)}
                className="ml-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600"
              >
                <option value="">Todos los segmentos</option>
                {porSegmento.map((f) => (
                  <option key={f.segmento} value={f.segmento}>
                    {f.segmento}
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto max-h-[560px] overflow-y-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Segmento</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Compras</TableHead>
                    <TableHead className="text-right">Última compra</TableHead>
                    <TableHead className="text-right">Días sin pedir</TableHead>
                    <TableHead className="text-right">Radar (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((c) => (
                    <TableRow key={c.locationId}>
                      <TableCell>
                        <p className="font-medium">{c.nombre}</p>
                        <p className="text-[11px] text-slate-400">{c.sapCode}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {sectorLabels[c.sector]}
                        {c.municipio && <p className="text-[11px] text-slate-400">{c.municipio}</p>}
                      </TableCell>
                      <TableCell className="text-xs">{c.segmento}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] font-normal ${MOTIVO_BADGES[c.motivo]}`}>
                          {MOTIVO_LABELS[c.motivo]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{c.compras}</TableCell>
                      <TableCell className="text-right text-xs">{fechaCorta(c.ultimaCompra)}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          c.diasSinPedir >= DIAS_SIN_RECOMPRA ? "text-rose-700" : "text-slate-600"
                        }`}
                      >
                        {c.diasSinPedir}
                      </TableCell>
                      <TableCell className="text-right text-slate-500">{num(c.kgAcumulado)}</TableCell>
                    </TableRow>
                  ))}
                  {lista.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-slate-400 py-6">
                        Ningún cliente con estos filtros.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Numero({ valor, onClick }: { valor: number; onClick: () => void }) {
  if (valor === 0) return <span className="text-slate-300">0</span>;
  return (
    <button onClick={onClick} className="underline decoration-dotted underline-offset-2 hover:text-sky-700">
      {num(valor)}
    </button>
  );
}

function Resumen({ titulo, valor, nota, clase }: { titulo: string; valor: string; nota: string; clase?: string }) {
  return (
    <div className={`rounded-lg border p-3 ${clase ?? "border-slate-200"}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-70 leading-tight">{titulo}</p>
      <p className="text-2xl font-bold mt-1">{valor}</p>
      <p className="text-xs opacity-70 mt-0.5">{nota}</p>
    </div>
  );
}
