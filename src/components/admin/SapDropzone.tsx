"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ParsedSapRow, SapParseResult } from "@/types";

interface SapDropzoneProps {
  onCommitSuccess: (batchId: string, count: number, locationsCount: number) => void;
}

type UploadState = "idle" | "parsing" | "previewing" | "uploading" | "done";

export function SapDropzone({ onCommitSuccess }: SapDropzoneProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [parseResult, setParseResult] = useState<SapParseResult | null>(null);
  const [fileName, setFileName] = useState("");

  const parseFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Solo se aceptan archivos .xlsx o .xls");
      return;
    }
    setState("parsing");
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const { parseSapExcel } = await import("@/lib/excel-parser");
      const result = await parseSapExcel(buffer);
      setParseResult(result);
      setState("previewing");
    } catch {
      toast.error("Error al leer el archivo Excel.");
      setState("idle");
    }
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  async function handleCommit() {
    if (!parseResult?.valid.length) return;
    setState("uploading");
    const batchId = crypto.randomUUID();
    try {
      const res = await fetch("/api/sap-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parseResult.valid, batchId }),
      });
      const data = await res.json() as { inserted?: number; locations_upserted?: number; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar");
        setState("previewing");
        return;
      }
      setState("done");
      onCommitSuccess(batchId, data.inserted ?? 0, data.locations_upserted ?? 0);
      toast.success(`${data.inserted} registros de sell-in cargados · ${data.locations_upserted} localidades actualizadas`);
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
      setState("previewing");
    }
  }

  function handleReset() {
    setState("idle");
    setParseResult(null);
    setFileName("");
  }

  // ── Stats helpers ────────────────────────────────────────────────────────────
  function getStats(rows: ParsedSapRow[]) {
    const uniqueClients = new Set(rows.map((r) => r.sap_code)).size;
    const totalKg = rows.reduce((s, r) => s + r.quantity_kg, 0);
    const months = [...new Set(rows.map((r) => r.date_of_sale.slice(0, 7)))].sort();
    return { uniqueClients, totalKg, months };
  }

  // ── Idle / Parsing ───────────────────────────────────────────────────────────
  if (state === "idle" || state === "parsing") {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        }`}
        onClick={() => document.getElementById("sap-file-input")?.click()}
      >
        <input
          id="sap-file-input"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileInput}
        />
        {state === "parsing" ? (
          <p className="text-slate-500 animate-pulse">Procesando {fileName}…</p>
        ) : (
          <>
            <div className="text-4xl mb-3">📂</div>
            <p className="font-medium text-slate-700">Arrastra el Excel SAP aquí</p>
            <p className="text-sm text-slate-400 mt-1">o haz clic para seleccionar (.xlsx, .xls)</p>
            <p className="text-xs text-slate-400 mt-2">Reporte: N7_V_SD88_WEB_001 · columna "Categoria de productos (N)"</p>
          </>
        )}
      </div>
    );
  }

  // ── Previewing / Uploading ───────────────────────────────────────────────────
  if ((state === "previewing" || state === "uploading") && parseResult) {
    const { uniqueClients, totalKg, months } = getStats(parseResult.valid);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{fileName}</h3>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge variant="default">{parseResult.valid.length} registros</Badge>
              <Badge variant="secondary">{uniqueClients} localidades</Badge>
              <Badge variant="secondary">{totalKg.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg totales</Badge>
              {months.length > 0 && (
                <Badge variant="outline">{months[0]} → {months[months.length - 1]}</Badge>
              )}
              {parseResult.errors.length > 0 && (
                <Badge variant="destructive">{parseResult.errors.length} errores</Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Cambiar archivo
          </Button>
        </div>

        {parseResult.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="space-y-1 text-sm">
                {parseResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err.field}: {err.message}</li>
                ))}
                {parseResult.errors.length > 5 && (
                  <li>…y {parseResult.errors.length - 5} errores más.</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {parseResult.valid.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cód. SAP</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Municipio</TableHead>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">KG</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parseResult.valid.slice(0, 100).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{row.sap_code}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{row.client_name}</TableCell>
                      <TableCell className="text-xs">{row.client_type}</TableCell>
                      <TableCell className="text-xs">{row.region}</TableCell>
                      <TableCell className="text-xs">{row.date_of_sale.slice(0, 7)}</TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {row.quantity_kg.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parseResult.valid.length > 100 && (
              <p className="text-xs text-slate-400 text-center py-2 border-t">
                Mostrando 100 de {parseResult.valid.length} registros
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleReset} disabled={state === "uploading"}>
            Cancelar
          </Button>
          <Button
            onClick={handleCommit}
            disabled={!parseResult.valid.length || state === "uploading"}
          >
            {state === "uploading"
              ? "Cargando…"
              : `Confirmar · ${uniqueClients} localidades · ${parseResult.valid.length} registros`}
          </Button>
        </div>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  return (
    <div className="text-center py-8">
      <div className="text-4xl mb-3">✅</div>
      <p className="font-medium text-slate-700">Carga completada</p>
      <Button variant="outline" className="mt-4" onClick={handleReset}>
        Cargar otro archivo
      </Button>
    </div>
  );
}
