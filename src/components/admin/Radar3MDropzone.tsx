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
  // Cuántas columnas "Venta Acumulada" trae el archivo: el reporte de 3 meses
  // debe traer una por mes. Con 1 sola, los meses extra se leen en 0.
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
      // `filas` (todas, sin colapsar) y NO `valid`: valid se queda con el último
      // corte por cliente+material, que en un reporte de 3 meses deja solo el
      // último mes y perdería los otros dos.
      setRows(result.filas ?? result.valid);
      setColumnasVenta(result.columnasVenta ?? 0);
      setErrors(result.errors);
      setState("previewing");
    } catch {
      toast.error("Error al leer el archivo.");
      setState("idle");
    }
  }, []);

  // Vercel rechaza payloads de más de ~4,5 MB por función. Con la cartera
  // ampliada (1102 clientes × 3 meses × 2 materiales × un corte por día) el
  // archivo entero en un solo POST se pasa y la carga falla con 413. Por eso
  // se parte, con el mismo mecanismo que ya usa la carga de Mavesa.
  //
  // Se parte por CLIENTE, nunca por fila suelta: el servidor colapsa por
  // cliente+material+mes quedándose con el último corte, así que todas las
  // filas de un mismo cliente tienen que viajar juntas. Partidas al medio, el
  // colapso vería solo una parte de sus cortes y se quedaría con el corte
  // equivocado.
  //
  // Todas las tandas comparten batchId; el borrado de lo viejo ("finalizar")
  // corre solo en la última, para que una tanda a medias nunca deje la tabla
  // con clientes borrados y todavía sin reemplazar.
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
      tandas.push(clientes.slice(i, i + CLIENTES_POR_TANDA).flatMap((c) => porCliente.get(c)!));
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
      cartera_total?: number;
      clientes_fuera_cartera?: number;
      clientes_en_archivo?: number;
      meses?: string[];
      meses_en_archivo?: string[];
      sin_volumen_por_mes?: Record<string, number>;
      total_kg_por_mes?: Record<string, number>;
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
      cartera_total: 0,
      clientes_fuera_cartera: 0,
      meses: new Set<string>(),
      meses_en_archivo: new Set<string>(),
      sin_volumen_por_mes: {} as Record<string, number>,
      total_kg_por_mes: {} as Record<string, number>,
      desde: "",
      hasta: "",
      total_kg: 0,
    };

    try {
      for (let i = 0; i < tandas.length; i++) {
        const esUltima = i === tandas.length - 1;
        const res = await fetch("/api/radar-3m-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: tandas[i], batchId, finalizar: esUltima }),
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
        // Los conteos de clientes se SUMAN entre tandas sin riesgo de doble
        // conteo: partirPorCliente garantiza que un cliente cae en una sola.
        acumulado.inserted += parcial.inserted ?? 0;
        acumulado.reemplazadas += parcial.reemplazadas ?? 0;
        acumulado.clientes_en_cartera += parcial.clientes_en_cartera ?? 0;
        acumulado.clientes_fuera_cartera += parcial.clientes_fuera_cartera ?? 0;
        // La cartera total es la misma en todas las tandas, no se acumula.
        acumulado.cartera_total = parcial.cartera_total ?? acumulado.cartera_total;
        for (const m of parcial.meses ?? []) acumulado.meses.add(m);
        for (const m of parcial.meses_en_archivo ?? []) acumulado.meses_en_archivo.add(m);
        for (const [m, n] of Object.entries(parcial.sin_volumen_por_mes ?? {}))
          acumulado.sin_volumen_por_mes[m] = (acumulado.sin_volumen_por_mes[m] ?? 0) + n;
        for (const [m, kg] of Object.entries(parcial.total_kg_por_mes ?? {}))
          acumulado.total_kg_por_mes[m] = Math.round(((acumulado.total_kg_por_mes[m] ?? 0) + kg) * 10) / 10;
        if (parcial.desde && (!acumulado.desde || parcial.desde < acumulado.desde)) acumulado.desde = parcial.desde;
        if (parcial.hasta && parcial.hasta > acumulado.hasta) acumulado.hasta = parcial.hasta;
        acumulado.total_kg += parcial.total_kg ?? 0;
      }

      const data = {
        inserted: acumulado.inserted,
        reemplazadas: acumulado.reemplazadas,
        clientes_en_cartera: acumulado.clientes_en_cartera,
        cartera_total: acumulado.cartera_total,
        clientes_fuera_cartera: acumulado.clientes_fuera_cartera,
        clientes_en_archivo: new Set(rows.map((r) => r.sap_code)).size,
        meses: [...acumulado.meses].sort(),
        meses_en_archivo: [...acumulado.meses_en_archivo].sort(),
        sin_volumen_por_mes: acumulado.sin_volumen_por_mes,
        total_kg_por_mes: acumulado.total_kg_por_mes,
        desde: acumulado.desde,
        hasta: acumulado.hasta,
        total_kg: acumulado.total_kg,
      };

      setState("done");
      // Resumen detallado a propósito: el promedio de referencia del gráfico
      // sale de estos números, así que hay que poder auditar de dónde salen.
      const porMes = Object.entries(data.total_kg_por_mes ?? {})
        .map(([m, kg]) => `${m}: ${kg.toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`)
        .join(" · ");
      const partes = [
        `${data.inserted} registros guardados`,
        `${data.clientes_en_cartera} de ${data.cartera_total} clientes de la cartera (el archivo trae ${data.clientes_en_archivo})`,
        `${data.meses?.length ?? 0} meses con volumen: ${data.meses?.join(", ") ?? "—"}`,
        `rango ${data.desde} → ${data.hasta}`,
        `total ${(data.total_kg ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`,
      ];
      if (porMes) partes.push(`por mes → ${porMes}`);
      // Si el archivo traía meses que quedaron sin volumen, el problema no es
      // el parser sino la lectura de la columna de kg de esos meses.
      const mesesSinVolumen = (data.meses_en_archivo ?? []).filter((m) => !(data.meses ?? []).includes(m));
      if (mesesSinVolumen.length > 0) {
        partes.push(
          `ATENCIÓN: ${mesesSinVolumen.join(", ")} vinieron en el archivo pero con volumen 0 (${Object.entries(
            data.sin_volumen_por_mes ?? {}
          )
            .map(([m, n]) => `${m}: ${n} filas`)
            .join(", ")})`
        );
      }
      if (data.clientes_fuera_cartera) {
        partes.push(`${data.clientes_fuera_cartera} clientes del archivo NO están en la cartera (ignorados)`);
      }
      if (data.reemplazadas) partes.push(`${data.reemplazadas} filas de la carga anterior reemplazadas`);
      if (tandas.length > 1) partes.push(`subido en ${tandas.length} tandas`);
      // Lo único que hay que mirar para saber si la carga sirve: si no cubrió
      // la cartera completa, el promedio de referencia va a salir corto y el
      // gráfico de ratio va a comparar contra una base incompleta.
      if (data.cartera_total > 0 && data.clientes_en_cartera < data.cartera_total) {
        partes.push(
          `ATENCIÓN: faltan ${data.cartera_total - data.clientes_en_cartera} clientes de la cartera — el archivo no los trae`
        );
      }
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
    const panRows = rows.length;
    // Lo que importa revisar antes de confirmar no es el número de filas (hay
    // una por corte diario) sino cuántos clientes y qué meses trae el archivo.
    const clientes = new Set(rows.map((r) => r.sap_code)).size;
    const meses = [...new Set(rows.map((r) => r.fecha.slice(0, 7)))].sort();
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-slate-900">{fileName}</span>
          <Badge variant="secondary">{clientes} clientes</Badge>
          <Badge variant={columnasVenta >= meses.length ? "secondary" : "destructive"}>
            {columnasVenta} col. Venta Acumulada
          </Badge>
          <Badge variant="secondary">{panRows} filas</Badge>
          <Badge variant="secondary">
            {meses.length} {meses.length === 1 ? "mes" : "meses"}: {meses.join(", ")}
          </Badge>
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
