"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ParsedSapFacturacionRow, ParseError } from "@/types";

// Carga "Facturado Harina PAN": el reporte SAP Pedidos y Facturado
// (N7_V_SD83_WEB_001) corrido para Harina PAN. Mismo parser que la carga de
// Panquecitas, pero va a su propia tabla (facturado_hpm_dia, migration 027) y
// solo alimenta el botón "Facturado" del gráfico de baseline de PAN de DIENN.
// Reemplaza los MESES que trae el archivo: se puede subir mes por mes.

type UploadState = "idle" | "parsing" | "previewing" | "uploading" | "done";

/** Lo único que viaja al servidor: cada fila liviana para no pasar el límite de Vercel. */
type FilaLiviana = Pick<
  ParsedSapFacturacionRow,
  "sap_code" | "material_code" | "material_name" | "fecha" | "cantidad_pedido_kg" | "cantidad_facturada_kg"
>;

// Se parte por CLIENTE: el servidor suma las filas de un mismo cliente +
// material + día, así que tienen que viajar juntas.
const CLIENTES_POR_TANDA = 300;

function partirPorCliente(filas: FilaLiviana[]): FilaLiviana[][] {
  const porCliente = new Map<string, FilaLiviana[]>();
  for (const f of filas) {
    const grupo = porCliente.get(f.sap_code);
    if (grupo) grupo.push(f);
    else porCliente.set(f.sap_code, [f]);
  }
  const clientes = [...porCliente.keys()];
  const tandas: FilaLiviana[][] = [];
  for (let i = 0; i < clientes.length; i += CLIENTES_POR_TANDA) {
    tandas.push(clientes.slice(i, i + CLIENTES_POR_TANDA).flatMap((c) => porCliente.get(c)!));
  }
  return tandas;
}

export function FacturadoHpmDropzone() {
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<FilaLiviana[]>([]);
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
      const { isSapWorkbook, parseSapFacturacionMhtml } = await import("@/lib/sap-mhtml-parser");
      if (!isSapWorkbook(buffer)) {
        toast.error('Este archivo no parece el reporte de SAP: se espera el .xls exportado ("Web Page, Single File") o ese mismo archivo guardado como .xlsx.');
        setState("idle");
        return;
      }
      const result = await parseSapFacturacionMhtml(buffer);
      setRows(
        result.valid.map((r) => ({
          sap_code: r.sap_code,
          material_code: r.material_code,
          material_name: r.material_name,
          fecha: r.fecha,
          cantidad_pedido_kg: r.cantidad_pedido_kg,
          cantidad_facturada_kg: r.cantidad_facturada_kg,
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
    const tandas = partirPorCliente(rows);
    const meses = [...new Set(rows.map((r) => r.fecha.slice(0, 7)))].sort();

    type Resultado = {
      guardadas?: number;
      reemplazadas?: number;
      clientes_guardados?: number;
      clientes_ignorados?: number;
      materiales_ignorados?: string[];
      total_kg_por_mes?: Record<string, number>;
      desde?: string;
      hasta?: string;
      error?: string;
      detail?: string;
    };

    const acumulado = {
      guardadas: 0,
      reemplazadas: 0,
      clientes_guardados: 0,
      clientes_ignorados: 0,
      materiales_ignorados: new Set<string>(),
      total_kg_por_mes: {} as Record<string, number>,
      desde: "",
      hasta: "",
    };

    try {
      for (let i = 0; i < tandas.length; i++) {
        const res = await fetch("/api/facturado-hpm-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: tandas[i], batchId, meses, finalizar: i === tandas.length - 1 }),
        });
        const parcial = (await res.json()) as Resultado;
        if (!res.ok) {
          toast.error(
            (parcial.detail ? `${parcial.error}: ${parcial.detail}` : (parcial.error ?? "Error al guardar")) +
              (tandas.length > 1 ? ` (tanda ${i + 1} de ${tandas.length})` : "")
          );
          setState("previewing");
          return;
        }
        // Un cliente cae en una sola tanda: los conteos se suman sin doble conteo.
        acumulado.guardadas += parcial.guardadas ?? 0;
        acumulado.reemplazadas += parcial.reemplazadas ?? 0;
        acumulado.clientes_guardados += parcial.clientes_guardados ?? 0;
        acumulado.clientes_ignorados += parcial.clientes_ignorados ?? 0;
        for (const m of parcial.materiales_ignorados ?? []) acumulado.materiales_ignorados.add(m);
        for (const [m, kg] of Object.entries(parcial.total_kg_por_mes ?? {}))
          acumulado.total_kg_por_mes[m] = Math.round(((acumulado.total_kg_por_mes[m] ?? 0) + kg) * 10) / 10;
        if (parcial.desde && (!acumulado.desde || parcial.desde < acumulado.desde)) acumulado.desde = parcial.desde;
        if (parcial.hasta && parcial.hasta > acumulado.hasta) acumulado.hasta = parcial.hasta;
      }

      const porMes = Object.entries(acumulado.total_kg_por_mes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([m, kg]) => `${m}: ${kg.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`)
        .join(" · ");
      const partes = [
        `${acumulado.guardadas} registros guardados`,
        `${acumulado.clientes_guardados} clientes`,
        `rango ${acumulado.desde} → ${acumulado.hasta}`,
      ];
      if (porMes) partes.push(`facturado por mes → ${porMes}`);
      if (acumulado.reemplazadas) partes.push(`${acumulado.reemplazadas} filas de cargas anteriores reemplazadas`);
      if (acumulado.clientes_ignorados) {
        partes.push(`${acumulado.clientes_ignorados} clientes del archivo no existen en la app (ignorados)`);
      }
      if (acumulado.materiales_ignorados.size > 0) {
        partes.push(
          `materiales que no son Harina PAN H187/H439 (ignorados): ${[...acumulado.materiales_ignorados].join(", ")}`
        );
      }
      if (tandas.length > 1) partes.push(`subido en ${tandas.length} tandas`);
      setDoneSummary(partes.join(" · "));
      setState("done");
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
    const clientes = new Set(rows.map((r) => r.sap_code)).size;
    const meses = [...new Set(rows.map((r) => r.fecha.slice(0, 7)))].sort();
    const materiales = [...new Set(rows.map((r) => r.material_code))].sort();
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-slate-900">{fileName}</span>
          <Badge variant="secondary">{clientes} clientes</Badge>
          <Badge variant="secondary">{rows.length} filas</Badge>
          <Badge variant="secondary">
            {meses.length} {meses.length === 1 ? "mes" : "meses"}: {meses.join(", ")}
          </Badge>
          <Badge variant="secondary">Materiales: {materiales.join(", ")}</Badge>
          {errors.length > 0 && <Badge variant="destructive">{errors.length} errores</Badge>}
        </div>
        <Alert>
          <AlertDescription>
            Esta carga <span className="font-medium">reemplaza los meses que trae el archivo</span> (
            {meses.join(", ")}) en el facturado de Harina PAN. Los otros meses no se tocan. Solo se guardan los
            materiales de Harina PAN (H187, H439) y los clientes que existen en la app.
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
      className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
        dragOver ? "border-slate-900 bg-slate-50" : "border-slate-200"
      }`}
    >
      <p className="text-4xl mb-2">📄</p>
      <p className="text-slate-600">
        {state === "parsing" ? "Leyendo el archivo…" : "Arrastra aquí el reporte Pedidos y Facturado de Harina PAN"}
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
