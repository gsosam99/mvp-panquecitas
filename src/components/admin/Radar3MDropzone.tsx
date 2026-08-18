"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ParsedSapRadarRow, ParseError } from "@/types";

// Carga del reporte "Radar últimos 3 Meses" (Harina PAN mayo–julio).
// Mismo formato y mismo parser que la Carga Radar, pero va a su propia tabla
// (radar_3m_records) y solo alimenta el gráfico de rendimiento diario de DIENN.
// Cada carga REEMPLAZA la anterior: el reporte se exporta completo.

type UploadState = "idle" | "parsing" | "previewing" | "uploading" | "done";

export function Radar3MDropzone() {
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<ParsedSapRadarRow[]>([]);
  const [errors, setErrors] = useState<ParseError[]>([]);
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
      const { isSapMhtml, parseSapRadarMhtml } = await import("@/lib/sap-mhtml-parser");
      if (!isSapMhtml(buffer)) {
        toast.error('Este archivo no parece un export de SAP ("Web Page, Single File").');
        setState("idle");
        return;
      }
      const result = parseSapRadarMhtml(buffer);
      setRows(result.valid);
      setErrors(result.errors);
      setState("previewing");
    } catch {
      toast.error("Error al leer el archivo.");
      setState("idle");
    }
  }, []);

  async function handleCommit() {
    if (!rows.length) return;
    setState("uploading");
    try {
      const res = await fetch("/api/radar-3m-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, batchId: crypto.randomUUID() }),
      });
      const data = (await res.json()) as {
        inserted?: number;
        reemplazadas?: number;
        clientes_fuera_cartera?: number;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        toast.error(data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Error al guardar"));
        setState("previewing");
        return;
      }
      setState("done");
      const fueraNote = data.clientes_fuera_cartera
        ? ` · ${data.clientes_fuera_cartera} filas de clientes fuera de la cartera (ignoradas)`
        : "";
      const reemplazoNote = data.reemplazadas ? ` · ${data.reemplazadas} filas de la carga anterior reemplazadas` : "";
      setDoneSummary(`${data.inserted} registros guardados${reemplazoNote}${fueraNote}`);
      toast.success("Carga completada");
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
      setState("previewing");
    }
  }

  function reset() {
    setState("idle");
    setRows([]);
    setErrors([]);
    setFileName("");
    setDoneSummary("");
  }

  if (state === "done") {
    return (
      <Alert>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <span className="font-medium">{fileName}</span> — {doneSummary}
          </span>
          <Button variant="outline" size="sm" onClick={reset}>
            Cargar otro
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (state === "previewing" || state === "uploading") {
    const panRows = rows.length;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-slate-900">{fileName}</span>
          <Badge variant="secondary">{panRows} filas</Badge>
          {errors.length > 0 && <Badge variant="destructive">{errors.length} errores</Badge>}
        </div>
        <Alert>
          <AlertDescription>
            Esta carga <span className="font-medium">reemplaza por completo</span> el reporte de 3 meses anterior. No
            toca la Carga Radar del piloto.
          </AlertDescription>
        </Alert>
        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="list-disc pl-4 text-xs">
                {errors.slice(0, 5).map((err, i) => (
                  <li key={i}>
                    Fila {err.row} · {err.field}: {err.message}
                  </li>
                ))}
                {errors.length > 5 && <li>…y {errors.length - 5} errores más.</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button onClick={handleCommit} disabled={state === "uploading" || panRows === 0}>
            {state === "uploading" ? "Guardando…" : "Confirmar carga"}
          </Button>
          <Button variant="outline" onClick={reset} disabled={state === "uploading"}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) parseFile(file);
      }}
      className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
        dragOver ? "border-slate-900 bg-slate-50" : "border-slate-200"
      }`}
    >
      <p className="text-4xl mb-2">📄</p>
      <p className="text-slate-600">
        {state === "parsing" ? "Leyendo el archivo…" : "Arrastra aquí el reporte Radar de los últimos 3 meses"}
      </p>
      <p className="text-xs text-slate-400 mt-1">Export de SAP en .xlsx / .xls (&quot;Web Page, Single File&quot;)</p>
      <label className="inline-block mt-4">
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) parseFile(file);
          }}
        />
        <span className="inline-flex items-center px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer hover:bg-slate-50">
          Seleccionar archivo
        </span>
      </label>
    </div>
  );
}
