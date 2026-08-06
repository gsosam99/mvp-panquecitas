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
import type { ParsedSapRow, ParsedSapFacturacionRow, ParseError } from "@/types";

interface SapDropzoneProps {
  onCommitSuccess: (batchId: string, count: number, locationsCount: number) => void;
}

type UploadState = "idle" | "parsing" | "previewing" | "uploading" | "done";

type ParsedData =
  | { format: "monthly"; valid: ParsedSapRow[]; errors: ParseError[] }
  | { format: "facturacion"; valid: ParsedSapFacturacionRow[]; errors: ParseError[] };

export function SapDropzone({ onCommitSuccess }: SapDropzoneProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
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
      const { isSapMhtml, parseSapFacturacionMhtml } = await import("@/lib/sap-mhtml-parser");

      if (isSapMhtml(buffer)) {
        // Reporte N7_V_SD83_WEB_001 (Panquecitas): export "Web Page" de SAP,
        // MHTML con extensión .xls — no es un Excel real.
        const result = parseSapFacturacionMhtml(buffer);
        setParsed({ format: "facturacion", valid: result.valid, errors: result.errors });
      } else {
        // Reporte mensual N7_V_SD88_WEB_001 (Harina Pan): .xlsx real.
        const { parseSapExcel } = await import("@/lib/excel-parser");
        const result = await parseSapExcel(buffer);
        setParsed({ format: "monthly", valid: result.valid, errors: result.errors });
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
    const batchId = crypto.randomUUID();
    try {
      const res = await fetch("/api/sap-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: parsed.format, rows: parsed.valid, batchId }),
      });
      const data = (await res.json()) as {
        inserted?: number;
        ventas_inserted?: number;
        pendientes_inserted?: number;
        locations_upserted?: number;
        duplicates_skipped?: number;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar");
        setState("previewing");
        return;
      }
      setState("done");
      const duplicatesNote = data.duplicates_skipped ? ` · ${data.duplicates_skipped} duplicados omitidos (ya cargados)` : "";
      if (parsed.format === "facturacion") {
        const count = (data.ventas_inserted ?? 0) + (data.pendientes_inserted ?? 0);
        onCommitSuccess(batchId, count, data.locations_upserted ?? 0);
        setDoneSummary(
          `${data.ventas_inserted} registros de ventas · ${data.pendientes_inserted} pedidos pendientes · ${data.locations_upserted} localidades actualizadas${duplicatesNote}`
        );
        toast.success("Carga completada");
      } else {
        onCommitSuccess(batchId, data.inserted ?? 0, data.locations_upserted ?? 0);
        setDoneSummary(`${data.inserted} registros de sell-in cargados · ${data.locations_upserted} localidades actualizadas${duplicatesNote}`);
        toast.success(`${data.inserted} registros de sell-in cargados · ${data.locations_upserted} localidades actualizadas${duplicatesNote}`);
      }
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
            <p className="font-medium text-slate-700">Arrastra el archivo SAP aquí</p>
            <p className="text-sm text-slate-400 mt-1">o haz clic para seleccionar (.xlsx, .xls)</p>
            <p className="text-xs text-slate-400 mt-2">
              N7_V_SD88_WEB_001 (Harina Pan, .xlsx) · N7_V_SD83_WEB_001 (Panquecitas, .xls export SAP)
            </p>
          </>
        )}
      </div>
    );
  }

  // ── Previewing / Uploading ───────────────────────────────────────────────────
  if ((state === "previewing" || state === "uploading") && parsed) {
    const uniqueClients = new Set(parsed.valid.map((r) => r.sap_code)).size;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{fileName}</h3>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge variant="default">{parsed.valid.length} registros</Badge>
              <Badge variant="secondary">{uniqueClients} localidades</Badge>
              <Badge variant="outline">
                {parsed.format === "facturacion" ? "Reporte Pedido/Facturado (Panquecitas)" : "Reporte mensual (Harina Pan)"}
              </Badge>
              {parsed.errors.length > 0 && (
                <Badge variant="destructive">{parsed.errors.length} errores</Badge>
              )}
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
                {parsed.errors.length > 5 && (
                  <li>…y {parsed.errors.length - 5} errores más.</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {parsed.valid.length > 0 && parsed.format === "facturacion" && (
          <FacturacionPreviewTable rows={parsed.valid} />
        )}
        {parsed.valid.length > 0 && parsed.format === "monthly" && (
          <MonthlyPreviewTable rows={parsed.valid} />
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleReset} disabled={state === "uploading"}>
            Cancelar
          </Button>
          <Button
            onClick={handleCommit}
            disabled={!parsed.valid.length || state === "uploading"}
          >
            {state === "uploading"
              ? "Cargando…"
              : `Confirmar · ${uniqueClients} localidades · ${parsed.valid.length} registros`}
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
      {doneSummary && <p className="text-sm text-slate-500 mt-1">{doneSummary}</p>}
      <Button variant="outline" className="mt-4" onClick={handleReset}>
        Cargar otro archivo
      </Button>
    </div>
  );
}

function MonthlyPreviewTable({ rows }: { rows: ParsedSapRow[] }) {
  return (
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
            {rows.slice(0, 100).map((row, i) => (
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
      {rows.length > 100 && (
        <p className="text-xs text-slate-400 text-center py-2 border-t">Mostrando 100 de {rows.length} registros</p>
      )}
    </div>
  );
}

function FacturacionPreviewTable({ rows }: { rows: ParsedSapFacturacionRow[] }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="max-h-64 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cód. SAP</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Esquema</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Pedido KG</TableHead>
              <TableHead className="text-right">Facturado KG</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 100).map((row, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs">{row.sap_code}</TableCell>
                <TableCell className="text-xs max-w-[160px] truncate">{row.client_name}</TableCell>
                <TableCell className="text-xs">{row.tipo_cliente}</TableCell>
                <TableCell className="text-xs">{row.esquema_atencion}</TableCell>
                <TableCell className="text-xs max-w-[160px] truncate">{row.material_name}</TableCell>
                <TableCell className="text-xs">{row.fecha}</TableCell>
                <TableCell className="text-right text-xs font-medium">
                  {row.cantidad_pedido_kg.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
                </TableCell>
                <TableCell className="text-right text-xs font-medium">
                  {row.cantidad_facturada_kg.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > 100 && (
        <p className="text-xs text-slate-400 text-center py-2 border-t">Mostrando 100 de {rows.length} registros</p>
      )}
    </div>
  );
}
