"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";
import type { MotivoNoVentaRow } from "@/lib/efectividad-queries";

const SIN_UBICACION = "(sin ubicación)";

interface MotivosNoVentaTableProps {
  title: string;
  description: string;
  /** Filas ya acotadas a un tipo (No Activación o No Recompra). */
  rows: MotivoNoVentaRow[];
  /** Nombre base del archivo .xlsx exportado. */
  exportName: string;
}

export function MotivosNoVentaTable({ title, description, rows, exportName }: MotivosNoVentaTableProps) {
  const [open, setOpen] = useState(true);
  const [ciudad, setCiudad] = useState("");
  const [motivo, setMotivo] = useState("");

  const ciudades = useMemo(
    () => Array.from(new Set(rows.map((r) => r.ciudad ?? SIN_UBICACION))).sort(),
    [rows]
  );
  const motivos = useMemo(() => Array.from(new Set(rows.map((r) => r.motivo))).sort(), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (ciudad && (r.ciudad ?? SIN_UBICACION) !== ciudad) return false;
      if (motivo && r.motivo !== motivo) return false;
      return true;
    });
  }, [rows, ciudad, motivo]);

  const hasFilters = ciudad || motivo;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <h3 className="font-semibold text-slate-900">
            {title} <span className="text-slate-400 font-normal">({rows.length})</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <span className="text-slate-400 text-sm shrink-0">{open ? "▲ Ocultar" : "▼ Mostrar"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="flex flex-col lg:flex-row gap-2 mb-3">
            <select
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Todas las ciudades</option>
              {ciudades.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Todos los motivos</option>
              {motivos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {/* Se exporta lo que quedó en pantalla tras aplicar los filtros. */}
            <ExportExcelButton
              filename={exportName}
              rows={filtered}
              className="lg:ml-auto"
              columns={[
                { header: "Código cliente", value: (r) => r.sapCode, width: 14 },
                { header: "Cliente", value: (r) => r.clientName ?? "", width: 40 },
                { header: "Ciudad", value: (r) => r.ciudad ?? "", width: 18 },
                { header: "Municipio", value: (r) => r.municipio ?? "", width: 18 },
                { header: "Región", value: (r) => r.region ?? "", width: 18 },
                { header: "Material", value: (r) => r.materialName ?? "", width: 40 },
                { header: "Motivo de no venta", value: (r) => r.motivo, width: 28 },
                { header: "% Efectividad visita", value: (r) => r.efectividadVisita ?? "", width: 16 },
              ]}
            />
          </div>

          {hasFilters && (
            <p className="text-xs text-slate-500 mb-2">
              Mostrando {filtered.length} de {rows.length}.{" "}
              <button
                type="button"
                onClick={() => {
                  setCiudad("");
                  setMotivo("");
                }}
                className="text-slate-700 underline hover:text-slate-900"
              >
                Limpiar filtros
              </button>
            </p>
          )}

          <div className="max-h-[360px] overflow-y-auto rounded-lg border border-slate-100">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">% Efectividad visita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">
                      <span className="font-medium text-slate-900">{r.sapCode}</span>{" "}
                      <span className="text-slate-500">— {r.clientName ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{r.ciudad ?? "—"}</TableCell>
                    <TableCell className="text-xs text-slate-500 max-w-[220px] truncate">{r.materialName ?? "—"}</TableCell>
                    <TableCell className="text-xs text-slate-700">{r.motivo}</TableCell>
                    <TableCell className="text-xs text-slate-700 text-right whitespace-nowrap">
                      {r.efectividadVisita == null
                        ? "—"
                        : `${r.efectividadVisita.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length === 0 && (
              <p className="text-sm text-slate-400 py-6 text-center">
                {rows.length === 0 ? "Aún no hay registros. Carga un reporte SAP arriba." : "Sin resultados con estos filtros."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
