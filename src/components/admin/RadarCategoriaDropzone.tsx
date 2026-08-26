"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ParsedSapRadarRow, ParseError } from "@/types";

// Carga genérica de Radar Mavesa (Margarina/Mayonesa), en sus dos
// propósitos: "referencia" (mayo-julio, alimenta el promedio del gráfico de
// ratio) y "actual" (agosto en adelante, alimenta el gráfico de barras de
// totales). Mismo parser que la Carga Radar de PAN — el formato del archivo
// es el mismo export de SAP BW, cambia el endpoint según categoria+proposito.
// Cada combinación tiene su propia tabla: cargar acá nunca reemplaza datos de
// otra categoría ni del otro propósito de la misma categoría.

type UploadState = "idle" | "parsing" | "previewing" | "uploading" | "done";

const CATEGORIA_LABEL: Record<"margarina" | "mayonesa", string> = {
  margarina: "Margarina",
  mayonesa: "Mayonesa",
};

const PROPOSITO_LABEL: Record<"referencia" | "actual", string> = {
  referencia: "Referencia (histórico, alimenta el promedio del ratio)",
  actual: "Actual (mes vivo, alimenta las barras de totales)",
};

export function RadarCategoriaDropzone({
  categoria,
  proposito,
}: {
  categoria: "margarina" | "mayonesa";
  proposito: "referencia" | "actual";
}) {
  const endpoint = `/api/radar-${categoria}-${proposito}-upload`;
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<ParsedSapRadarRow[]>([]);
  const [columnasVenta, setColumnasVenta] = useState(0);
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
      // `filas` (todas, sin colapsar) y NO `valid`: un reporte de varios
      // meses (referencia) necesita cada mes, no solo el último corte.
      setRows(result.filas ?? result.valid);
      setColumnasVenta(result.columnasVenta ?? 0);
      setErrors(result.errors);
      setState("previewing");
    } catch {
      toast.error("Error al leer el archivo.");
      setState("idle");
    }
  }, []);

  // Vercel rechaza payloads de más de ~4.5MB por función — un archivo de
  // referencia (varios meses × miles de clientes) puede pasarse fácil de
  // ahí. Se parte por CLIENTE (nunca por fila suelta): agrupar por sap_code
  // garantiza que el colapsado de "último corte del mes" del servidor vea
  // siempre todas las filas de un mismo cliente juntas, así que partir acá
  // no cambia el resultado. Todas las tandas comparten el mismo batchId; el
  // borrado de filas viejas ("finalizar") solo corre en la última, para que
  // una tanda a medias nunca deje la tabla con clientes borrados y todavía
  // sin reemplazar.
  const CLIENTES_POR_TANDA = 200;

  function partirPorCliente(filas: ParsedSapRadarRow[]): ParsedSapRadarRow[][] {
    const porCliente = new Map<string, ParsedSapRadarRow[]>();
    for (const f of filas) {
      const grupo = porCliente.get(f.sap_code);
      if (grupo) grupo.push(f);
      else porCliente.set(f.sap_code, [f]);
    }
    const clientes = [...porCliente.keys()];
    const tandas: ParsedSapRadarRow[][] = [];
    for (let i = 0; i < clientes.length; i += CLIENTES_POR_TANDA) {
      const tanda = clientes.slice(i, i + CLIENTES_POR_TANDA).flatMap((c) => porCliente.get(c)!);
      tandas.push(tanda);
    }
    return tandas;
  }

  async function handleCommit() {
    if (!rows.length) return;
    setState("uploading");
    const batchId = crypto.randomUUID();
    const tandas = partirPorCliente(rows);

    type Resultado = {
      inserted?: number;
      reemplazadas?: number;
      clientes_en_cartera?: number;
      clientes_descartados_fuera_cartera?: number;
      meses?: string[];
      desde?: string;
      hasta?: string;
      total_kg?: number;
      error?: string;
      detail?: string;
    };
    const acumulado = {
      inserted: 0,
      reemplazadas: 0,
      clientes_en_cartera: 0,
      clientes_descartados_fuera_cartera: 0,
      meses: new Set<string>(),
      desde: "",
      hasta: "",
      total_kg: 0,
    };

    try {
      for (let i = 0; i < tandas.length; i++) {
        const esUltima = i === tandas.length - 1;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: tandas[i], batchId, finalizar: esUltima }),
        });
        const data = (await res.json()) as Resultado;
        if (!res.ok) {
          toast.error(
            (data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Error al guardar")) +
              (tandas.length > 1 ? ` (tanda ${i + 1} de ${tandas.length})` : "")
          );
          setState("previewing");
          return;
        }
        acumulado.inserted += data.inserted ?? 0;
        acumulado.reemplazadas += data.reemplazadas ?? 0;
        acumulado.clientes_en_cartera += data.clientes_en_cartera ?? 0;
        acumulado.clientes_descartados_fuera_cartera += data.clientes_descartados_fuera_cartera ?? 0;
        for (const m of data.meses ?? []) acumulado.meses.add(m);
        if (data.desde && (!acumulado.desde || data.desde < acumulado.desde)) acumulado.desde = data.desde;
        if (data.hasta && data.hasta > acumulado.hasta) acumulado.hasta = data.hasta;
        acumulado.total_kg += data.total_kg ?? 0;
      }

      setState("done");
      const clientesEnArchivo = new Set(rows.map((r) => r.sap_code)).size;
      const meses = [...acumulado.meses].sort();
      const partes = [
        `${acumulado.inserted} registros guardados`,
        proposito === "actual"
          ? `${acumulado.clientes_en_cartera} clientes de la cartera (de ${clientesEnArchivo} en el archivo)`
          : `${acumulado.clientes_en_cartera} de ${clientesEnArchivo} clientes con ciudad reconocida (el resto igual suma al total, sin poder agruparse por ciudad)`,
        `${meses.length} meses: ${meses.join(", ") || "—"}`,
        `rango ${acumulado.desde} → ${acumulado.hasta}`,
        `total ${acumulado.total_kg.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`,
      ];
      if (proposito === "actual" && acumulado.clientes_descartados_fuera_cartera) {
        partes.push(`${acumulado.clientes_descartados_fuera_cartera} clientes del archivo NO están en la cartera (descartados)`);
      }
      if (acumulado.reemplazadas) partes.push(`${acumulado.reemplazadas} filas de la carga anterior reemplazadas`);
      if (tandas.length > 1) partes.push(`subido en ${tandas.length} tandas`);
      setDoneSummary(partes.join(" · "));
      toast.success("Carga completada");
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
      setState("previewing");
    }
  }

  function reset() {
    setState("idle");
    setRows([]);
    setColumnasVenta(0);
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
    const totalFilas = rows.length;
    const clientes = new Set(rows.map((r) => r.sap_code)).size;
    const meses = [...new Set(rows.map((r) => r.fecha.slice(0, 7)))].sort();
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-slate-900">{fileName}</span>
          <Badge variant="secondary">{clientes} clientes</Badge>
          <Badge variant="secondary">{columnasVenta} col. Venta Acumulada</Badge>
          <Badge variant="secondary">{totalFilas} filas</Badge>
          <Badge variant="secondary">
            {meses.length} {meses.length === 1 ? "mes" : "meses"}: {meses.join(", ")}
          </Badge>
          {errors.length > 0 && <Badge variant="destructive">{errors.length} errores</Badge>}
        </div>
        <Alert>
          <AlertDescription>
            Esta carga <span className="font-medium">reemplaza por completo</span> el reporte "{PROPOSITO_LABEL[proposito]}"
            de {CATEGORIA_LABEL[categoria]} anterior. No toca ni la otra categoría ni el otro propósito de esta misma
            categoría.
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
          <Button onClick={handleCommit} disabled={state === "uploading" || totalFilas === 0}>
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
        {state === "parsing"
          ? "Leyendo el archivo…"
          : `Arrastra aquí el reporte Radar de ${CATEGORIA_LABEL[categoria]} — ${PROPOSITO_LABEL[proposito]}`}
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
