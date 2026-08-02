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
import type { DispatchesParseResult } from "@/types";

interface Props {
  onCommitSuccess: (count: number, unmatched: string[]) => void;
}

type UploadState = "idle" | "parsing" | "previewing" | "uploading" | "done";

export function DispatchesDropzone({ onCommitSuccess }: Props) {
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [parseResult, setParseResult] = useState<DispatchesParseResult | null>(null);
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
      const { parseDispatchesExcel } = await import("@/lib/excel-parser");
      const result = await parseDispatchesExcel(buffer);
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
    try {
      const res = await fetch("/api/dispatches-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parseResult.valid }),
      });
      const data = (await res.json()) as { inserted?: number; unmatched_sap_codes?: string[]; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar");
        setState("previewing");
        return;
      }
      setState("done");
      onCommitSuccess(data.inserted ?? 0, data.unmatched_sap_codes ?? []);
      if (data.unmatched_sap_codes?.length) {
        toast.warning(`${data.inserted} despachos cargados · ${data.unmatched_sap_codes.length} códigos SAP sin PDV asociado`);
      } else {
        toast.success(`${data.inserted} despachos cargados`);
      }
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

  if (state === "idle" || state === "parsing") {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        }`}
        onClick={() => document.getElementById("dispatches-file-input")?.click()}
      >
        <input id="dispatches-file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
        {state === "parsing" ? (
          <p className="text-slate-500 animate-pulse">Procesando {fileName}…</p>
        ) : (
          <>
            <div className="text-4xl mb-3">🚚</div>
            <p className="font-medium text-slate-700">Arrastra el Excel de despachos aquí</p>
            <p className="text-sm text-slate-400 mt-1">o haz clic para seleccionar (.xlsx, .xls)</p>
            <p className="text-xs text-amber-600 mt-2">
              Formato aún no confirmado por SAP — el parser busca "Nº cliente", "Cantidad", "Fecha" (y opcional
              "SKU"/presentación) por nombre.
            </p>
          </>
        )}
      </div>
    );
  }

  if ((state === "previewing" || state === "uploading") && parseResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{fileName}</h3>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge variant="default">{parseResult.valid.length} despachos</Badge>
              {parseResult.errors.length > 0 && <Badge variant="destructive">{parseResult.errors.length} errores</Badge>}
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
                  <li key={i}>
                    {err.field}: {err.message}
                  </li>
                ))}
                {parseResult.errors.length > 5 && <li>…y {parseResult.errors.length - 5} errores más.</li>}
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
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parseResult.valid.slice(0, 100).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{row.sap_code}</TableCell>
                      <TableCell className="text-xs">{row.variant_sku ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{row.quantity}</TableCell>
                      <TableCell className="text-xs">{row.dispatch_date}</TableCell>
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
          <Button onClick={handleCommit} disabled={!parseResult.valid.length || state === "uploading"}>
            {state === "uploading" ? "Cargando…" : `Confirmar · ${parseResult.valid.length} despachos`}
          </Button>
        </div>
      </div>
    );
  }

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
