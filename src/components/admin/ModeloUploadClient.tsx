"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ParsedModeloRow, ParseError } from "@/types";

type UploadState = "idle" | "parsing" | "previewing" | "uploading" | "done";

export function ModeloUploadClient() {
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<{ valid: ParsedModeloRow[]; errors: ParseError[] } | null>(null);
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
      const { isSapMhtml, parseSapClientesModeloMhtml } = await import("@/lib/sap-mhtml-parser");
      // MHTML (.xls export de SAP, ej. N7_V_SD56) vs .xlsx real (maestro Inney).
      if (isSapMhtml(buffer)) {
        const result = parseSapClientesModeloMhtml(buffer);
        setParsed(result);
      } else {
        const { parseModeloIndirectoExcel } = await import("@/lib/excel-parser");
        const result = await parseModeloIndirectoExcel(buffer);
        setParsed(result);
      }
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
    try {
      const res = await fetch("/api/modelo-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.valid }),
      });
      const data = (await res.json()) as {
        updated?: number;
        clientes_sin_cartera?: number;
        esquemas?: string[];
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        toast.error(data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Error al guardar"));
        setState("previewing");
        return;
      }
      const sinCartera = data.clientes_sin_cartera
        ? ` · ${data.clientes_sin_cartera} códigos sin cartera (ignorados)`
        : "";
      const esquemas = data.esquemas?.length ? ` · Esquemas: ${data.esquemas.join(", ")}` : "";
      setDoneSummary(`${data.updated ?? 0} clientes actualizados${esquemas}${sinCartera}`);
      setState("done");
      toast.success("Modelo de atención actualizado");
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Importar modelo de atención</CardTitle>
          </CardHeader>
          <CardContent>
            {(state === "idle" || state === "parsing") && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
                  dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                }`}
                onClick={() => document.getElementById("modelo-file-input")?.click()}
              >
                <input id="modelo-file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
                {state === "parsing" ? (
                  <p className="text-slate-500 animate-pulse">Procesando {fileName}…</p>
                ) : (
                  <>
                    <div className="text-4xl mb-3">📂</div>
                    <p className="font-medium text-slate-700">Arrastra el maestro de clientes aquí</p>
                    <p className="text-sm text-slate-400 mt-1">o haz clic para seleccionar (.xlsx, .xls)</p>
                    <p className="text-xs text-slate-400 mt-2">
                      N7_V_SD56 (SAP, .xls MHTML) o el maestro de indirectos de la distribuidora (.xlsx)
                    </p>
                  </>
                )}
              </div>
            )}

            {(state === "previewing" || state === "uploading") && parsed && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{fileName}</h3>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge variant="default">{parsed.valid.length} clientes</Badge>
                      {parsed.errors.length > 0 && <Badge variant="destructive">{parsed.errors.length} errores</Badge>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    Cambiar archivo
                  </Button>
                </div>

                {parsed.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <ul className="space-y-1 text-sm">
                        {parsed.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err.field}: {err.message}</li>
                        ))}
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
                            <TableHead>Código SAP</TableHead>
                            <TableHead>Esquema de Atención</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsed.valid.slice(0, 100).map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{row.sap_code}</TableCell>
                              <TableCell className="text-xs">{row.esquema_atencion}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {parsed.valid.length > 100 && (
                      <p className="text-xs text-slate-400 text-center py-2 border-t">Mostrando 100 de {parsed.valid.length}</p>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handleReset} disabled={state === "uploading"}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCommit} disabled={!parsed.valid.length || state === "uploading"}>
                    {state === "uploading" ? "Cargando…" : `Confirmar · ${parsed.valid.length} clientes`}
                  </Button>
                </div>
              </div>
            )}

            {state === "done" && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">✅</div>
                <p className="font-medium text-slate-700">Modelo de atención actualizado</p>
                {doneSummary && <p className="text-sm text-slate-500 mt-1">{doneSummary}</p>}
                <Button variant="outline" className="mt-4" onClick={handleReset}>
                  Cargar otro archivo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle>Para qué sirve</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-2">
            <p>
              Asigna el <span className="font-medium">modelo de atención</span> (Directo / Indirecto) a cada cliente de
              la cartera, cruzando por código SAP. Alimenta los gráficos de cartera por ciudad y modelo en DIENN.
            </p>
            <p className="text-xs text-slate-400">
              El <span className="font-mono">N7_V_SD56</span> trae el maestro completo (mayormente Directo); el maestro
              de la distribuidora (.xlsx) trae los Indirectos. Se pueden cargar ambos, uno tras otro.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
