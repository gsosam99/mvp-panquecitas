"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";

export interface IndicatorTableRow {
  id: string;
  sapCode: string;
  name: string;
  sector: string | null;
  tipoCliente: string | null;
  grupoVendedor?: string | null;
  extra?: ReactNode;
  /** Versión en texto plano de `extra`, para la exportación a Excel. */
  extraText?: string;
}

interface IndicatorTableProps {
  rows: IndicatorTableRow[];
  extraLabel?: string;
  emptyMessage: string;
  /** Nombre del archivo .xlsx. Sin esto no se muestra el botón de exportar. */
  exportName?: string;
}

export function IndicatorTable({ rows, extraLabel, emptyMessage, exportName }: IndicatorTableProps) {
  const [query, setQuery] = useState("");
  const [tipoCliente, setTipoCliente] = useState("");

  const tipos = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.tipoCliente) set.add(r.tipoCliente);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tipoCliente && r.tipoCliente !== tipoCliente) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.sapCode.toLowerCase().includes(q);
    });
  }, [rows, query, tipoCliente]);

  if (rows.length === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          type="search"
          placeholder="Buscar por nombre o código…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        {tipos.length > 0 && (
          <select
            value={tipoCliente}
            onChange={(e) => setTipoCliente(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {/* Se exporta lo que el usuario tiene en pantalla (con su búsqueda y
            su filtro de tipo aplicados), no la lista completa. */}
        {exportName && (
          <ExportExcelButton
            filename={exportName}
            rows={filtered}
            columns={[
              { header: "Código cliente", value: (r) => r.sapCode, width: 16 },
              { header: "Cliente", value: (r) => r.name, width: 44 },
              { header: "Oficina de venta", value: (r) => r.sector, width: 20 },
              { header: "Grupo vendedor", value: (r) => r.grupoVendedor ?? "", width: 16 },
              { header: "Tipo de cliente", value: (r) => r.tipoCliente, width: 24 },
              ...(extraLabel
                ? [{ header: extraLabel, value: (r: IndicatorTableRow) => r.extraText ?? "", width: 34 }]
                : []),
            ]}
          />
        )}
      </div>

      <div className="max-h-[320px] overflow-y-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PDV</TableHead>
              <TableHead>Sector</TableHead>
              {extraLabel && <TableHead>{extraLabel}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <span className="font-medium text-slate-900">{r.sapCode}</span>{" "}
                  <span className="text-slate-500">— {r.name}</span>
                </TableCell>
                <TableCell className="text-slate-500">{r.sector ?? "—"}</TableCell>
                {extraLabel && <TableCell>{r.extra}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <p className="text-sm text-slate-400 py-6 text-center">Sin resultados.</p>
        )}
      </div>
    </div>
  );
}
