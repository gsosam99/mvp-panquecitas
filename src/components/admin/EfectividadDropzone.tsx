"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
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
import type { ParsedSapEfectividadRow, ParseError } from "@/types";

type UploadState = "idle" | "parsing" | "previewing" | "uploading" | "done";

export function EfectividadDropzone() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<{ valid: ParsedSapEfectividadRow[]; errors: ParseError[] } | null>(null);
  const [fileName, setFileName] = useState("");
  const [doneSummary, setDoneSummary] = useState("");

  const parseFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Solo se aceptan archivos .xlsx o .xls");
      return;
    }
    setState("parsing");
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const { isSapMhtml, parseSapEfectividadMhtml } = await import("@/lib/sap-mhtml-parser");
      if (!isSapMhtml(buffer)) {
        toast.error('Este archivo no parece un export de SAP ("Web Page, Single File").');
        setState("idle");
        return;
      }
      const result = parseSapEfectividadMhtml(buffer);
      setParsed({ valid: result.valid, errors: result.errors });
      setState("previewing");
    } catch {
      toast.error("Error al leer el archivo.");
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
    if (!parsed?.valid.length) return;
    setState("uploading");
    const batchId = crypto.randomUUID();
    try {
      const res = await fetch("/api/efectividad-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.valid, batchId }),
      });
      const data = (await res.json()) as {
        inserted?: number;
        no_activacion?: number;
        no_recompra?: number;
        venta_efectiva?: number;
        clientes_sin_cartera?: number;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        toast.error(data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Error al guardar"));
        setState("previewing");
        return;
      }
      const sinCarteraNote = data.clientes_sin_cartera
        ? ` · ${data.clientes_sin_cartera} sin cartera (sin ubicación)`
        : "";
      setDoneSummary(
        `${data.no_activacion ?? 0} No Activación · ${data.no_recompra ?? 0} No Recompra · ${data.venta_efectiva ?? 0} Venta Efectiva${sinCarteraNote}`
      );
      setState("done");
      toast.success("Carga completada");
      router.refresh(); // recarga las dos listas con los nuevos registros
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
      setState("previewing");
    }
  }

  function handleReset() {
    setState("idle");
    setParsed(null);
    setFileName("");
    setDoneSummary("");
  }

  // ── Idle / Parsing ──
  if (state === "idle" || state === "parsing") {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        }`}
        onClick={() => document.getElementById("efectividad-file-input")?.click()}
      >
        <input id="efectividad-file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
        {state === "parsing" ? (
          <p className="text-slate-500 animate-pulse">Procesando {fileName}…</p>
        ) : (
          <>
            <div className="text-4xl mb-3">📂</div>
            <p className="font-medium text-slate-700">Arrastra el reporte de Efectividad de Visita aquí</p>
            <p className="text-sm text-slate-400 mt-1">o haz clic para seleccionar (.xlsx, .xls)</p>
            <p className="text-xs text-slate-400 mt-2">Reporte SAP N7_V_SD85 (Efectividad de Visita / Motivos de No Venta) — export "Web Page, Single File"</p>
          </>
        )}
      </div>
    );
  }

  // ── Previewing / Uploading ──
  if ((state === "previewing" || state === "uploading") && parsed) {
    const uniqueClients = new Set(parsed.valid.map((r) => r.sap_code)).size;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{fileName}</h3>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge variant="default">{parsed.valid.length} registros</Badge>
              <Badge variant="secondary">{uniqueClients} clientes</Badge>
              {parsed.errors.length > 0 && <Badge variant="destructive">{parsed.errors.length} errores</Badge>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Cambiar archivo
          </Button>
        </div>

        <p className="text-xs text-amber-600">
          Al confirmar, esta carga <span className="font-medium">reemplaza por completo</span> el reporte
          anterior (no se acumula ni se duplica).
        </p>

        {parsed.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="space-y-1 text-sm">
                {parsed.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err.field}: {err.message}</li>
                ))}
                {parsed.errors.length > 5 && <li>…y {parsed.errors.length - 5} errores más.</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {parsed.valid.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cód. SAP</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Justificación</TableHead>
                    <TableHead className="text-right">% Visita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.valid.slice(0, 100).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{row.sap_code}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{row.client_name}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{row.material_name}</TableCell>
                      <TableCell className="text-xs">{row.justificacion}</TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {row.efectividad_visita.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsed.valid.length > 100 && (
              <p className="text-xs text-slate-400 text-center py-2 border-t">Mostrando 100 de {parsed.valid.length} registros</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleReset} disabled={state === "uploading"}>
            Cancelar
          </Button>
          <Button onClick={handleCommit} disabled={!parsed.valid.length || state === "uploading"}>
            {state === "uploading" ? "Cargando…" : `Confirmar · ${parsed.valid.length} registros`}
          </Button>
        </div>
      </div>
    );
  }

  // ── Done ──
  return (
    <div className="text-center py-8">
      <div className="text-4xl mb-3">✅</div>
      <p className="font-medium text-slate-700">Carga completada</p>
      {doneSummary && <p className="text-sm text-slate-500 mt-1">{doneSummary}</p>}
      <Button variant="outline" className="mt-4" onClick={handleReset}>
        Cargar otro archivo
      </Button>
    </div>
  );
}
