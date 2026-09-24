"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ParseError } from "@/types";

// Carga del Radar de Harina PAN de 3 meses de Barquisimeto completo.
// Mismo parser que "Radar 3 Meses"; va a su propia tabla (bqto_3m_ventas) y
// solo alimenta la página /bqto-completo. Cada carga REEMPLAZA la anterior.

type UploadState = "idle" | "parsing" | "previewing" | "uploading" | "done";

/** Lo que viaja al servidor: solo las columnas que se guardan. */
interface FilaCarga {
  sap_code: string;
  client_name: string;
  tipo_cliente: string;
  esquema_atencion: string;
  oficina_venta: string;
  material_code: string;
  fecha: string;
  quantity_kg: number;
}

// Vercel rechaza cuerpos de más de ~4,5 MB: ~30.000 filas se parten en
// tandas. Aquí no se colapsa nada en el servidor, así que se puede partir por
// fila sin cuidar que un cliente quede entero en una tanda.
const FILAS_POR_TANDA = 3000;

const kg = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 0 });

export function Bqto3MDropzone() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<FilaCarga[]>([]);
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
      const { isSapWorkbook, parseSapRadarMhtml } = await import("@/lib/sap-mhtml-parser");
      if (!isSapWorkbook(buffer)) {
        toast.error('Este archivo no parece el reporte de SAP: se espera el .xls exportado ("Web Page, Single File") o ese mismo archivo guardado como .xlsx.');
        setState("idle");
        return;
      }
      const result = await parseSapRadarMhtml(buffer);
      // `filas` (todas, una por cliente + material + día) y no `valid`, que se
      // queda solo con el último corte de cada cliente.
      setRows(
        (result.filas ?? result.valid).map((r) => ({
          sap_code: r.sap_code,
          client_name: r.client_name,
          tipo_cliente: r.tipo_cliente,
          esquema_atencion: r.esquema_atencion,
          oficina_venta: r.oficina_venta,
          material_code: r.material_code,
          fecha: r.fecha,
          quantity_kg: r.quantity_kg,
        }))
      );
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
    const batchId = crypto.randomUUID();
    const tandas: FilaCarga[][] = [];
    for (let i = 0; i < rows.length; i += FILAS_POR_TANDA) tandas.push(rows.slice(i, i + FILAS_POR_TANDA));

    let inserted = 0;
    let reemplazadas = 0;
    let totalKg = 0;
    try {
      for (let i = 0; i < tandas.length; i++) {
        const res = await fetch("/api/bqto-3m-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: tandas[i], batchId, finalizar: i === tandas.length - 1 }),
        });
        const parcial = (await res.json()) as {
          inserted?: number;
          reemplazadas?: number;
          total_kg?: number;
          error?: string;
          detail?: string;
        };
        if (!res.ok) {
          toast.error(
            (parcial.detail ? `${parcial.error}: ${parcial.detail}` : (parcial.error ?? "Error al guardar")) +
              (tandas.length > 1 ? ` (tanda ${i + 1} de ${tandas.length})` : "")
          );
          setState("previewing");
          return;
        }
        inserted += parcial.inserted ?? 0;
        reemplazadas += parcial.reemplazadas ?? 0;
        totalKg += parcial.total_kg ?? 0;
      }
      setDoneSummary(
        [
          `${inserted.toLocaleString("es-VE")} filas guardadas`,
          `total ${kg(totalKg)} kg`,
          reemplazadas ? `${reemplazadas.toLocaleString("es-VE")} filas de la carga anterior reemplazadas` : "",
          tandas.length > 1 ? `subido en ${tandas.length} tandas` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      );
      setState("done");
      toast.success("Carga completada");
      router.refresh();
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
    const clientes = new Set(rows.map((r) => r.sap_code)).size;
    const meses = [...new Set(rows.map((r) => r.fecha.slice(0, 7)))].sort();
    const total = rows.reduce((s, r) => s + r.quantity_kg, 0);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-slate-900">{fileName}</span>
          <Badge variant="secondary">{clientes.toLocaleString("es-VE")} clientes</Badge>
          <Badge variant="secondary">{rows.length.toLocaleString("es-VE")} filas</Badge>
          <Badge variant="secondary">
            {meses.length} {meses.length === 1 ? "mes" : "meses"}: {meses.join(", ")}
          </Badge>
          <Badge variant="secondary">{kg(total)} kg</Badge>
          {errors.length > 0 && <Badge variant="destructive">{errors.length} errores</Badge>}
        </div>
        <Alert>
          <AlertDescription>
            Esta carga <span className="font-medium">reemplaza por completo</span> la de Barquisimeto completo
            anterior. No toca el piloto ni el Dashboard.
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
          <Button onClick={handleCommit} disabled={state === "uploading" || rows.length === 0}>
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
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragOver ? "border-slate-900 bg-slate-50" : "border-slate-200"
      }`}
    >
      <p className="text-slate-600">
        {state === "parsing"
          ? "Leyendo el archivo…"
          : "Arrastra aquí el Radar de Harina PAN de 3 meses de Barquisimeto completo"}
      </p>
      <p className="text-xs text-slate-400 mt-1">
        Reporte N7_V_SD88_WEB_001 en .xls (&quot;Web Page, Single File&quot;) o guardado como .xlsx
      </p>
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
