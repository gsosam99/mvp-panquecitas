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
import type { CarteraParseResult, ParsedCarteraRow } from "@/types";

interface CarteraDropzoneProps {
  onCommitSuccess: (count: number, sinSector: number) => void;
}

type UploadState = "idle" | "parsing" | "previewing" | "uploading" | "done";

/** Resultado del cruce del archivo subido contra la cartera ya registrada. */
interface CruceCartera {
  /** Filas del archivo que repiten un Nº cliente de una fila anterior del mismo archivo. */
  repetidosEnArchivo: number;
  /** Códigos del archivo que ya existían en la cartera (actualización, no incorporación). */
  yaEnCartera: number;
  yaEnCarteraCodigos: string[];
  /** De esos, los que estaban marcados "Fuera de cartera" y ahora pasan a ser cartera formal. */
  regularizados: number;
  regularizadosCodigos: string[];
}

export function CarteraDropzone({ onCommitSuccess }: CarteraDropzoneProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [parseResult, setParseResult] = useState<CarteraParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [cruce, setCruce] = useState<CruceCartera | null>(null);

  const parseFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Solo se aceptan archivos .xlsx o .xls");
      return;
    }
    setState("parsing");
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const { parseCarteraExcel } = await import("@/lib/excel-parser");
      const result = await parseCarteraExcel(buffer);
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
      const res = await fetch("/api/cartera-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parseResult.valid }),
      });
      const data = (await res.json()) as {
        locations_upserted?: number;
        sin_sector?: number;
        con_segmento?: number;
        nuevos_por_cohorte?: Record<string, number>;
        fechas_sobrescritas?: number;
        filas_repetidas_en_archivo?: number;
        ya_en_cartera?: number;
        ya_en_cartera_codigos?: string[];
        regularizados_fuera_de_cartera?: number;
        regularizados_fuera_de_cartera_codigos?: string[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar");
        setState("previewing");
        return;
      }
      setState("done");
      onCommitSuccess(data.locations_upserted ?? 0, data.sin_sector ?? 0);
      if (data.sin_sector) {
        toast.warning(
          `${data.locations_upserted} localidades actualizadas · ${data.sin_sector} sin sector reconocido (no aparecerán en campo/DIENN hasta corregir "Oficina de Ventas")`
        );
      } else {
        toast.success(`${data.locations_upserted} localidades actualizadas`);
      }
      // El ranking por segmento de DIENN depende de la columna "Segmento de
      // Clientes 2": si el archivo no la trae, conviene avisarlo aquí y no que
      // el gráfico aparezca vacío sin explicación.
      if (!data.con_segmento) {
        toast.warning(
          'Ninguna fila traía "Segmento de Clientes 2": el Ranking de Volumen por Segmento de DIENN saldrá vacío.'
        );
      }
      // Clientes NUEVOS por tanda de incorporación. Hay que poder verificarlo
      // en el momento: si "Indirecto Cumaná" sale en 0 es que el archivo no
      // trae los grupos vendedores U27/U28, y esos PDV habrían entrado con la
      // fecha equivocada — lo que desplaza los indicadores de todo agosto.
      const nuevos = Object.entries(data.nuevos_por_cohorte ?? {});
      if (nuevos.length > 0) {
        toast.info(
          `Clientes nuevos por tanda: ${nuevos.map(([tanda, n]) => `${tanda} ${n}`).join(" · ")}`
        );
      }
      if (data.fechas_sobrescritas) {
        toast.warning(
          `${data.fechas_sobrescritas} clientes cambiaron de fecha de incorporación por la columna de fecha del archivo. Los indicadores históricos de esos clientes se recalculan.`
        );
      }
      // Cruce contra la cartera que ya estaba. Al subir un archivo de "solo
      // los nuevos" esta es la cifra que hay que leer: los repetidos NO se
      // duplican (el upsert es por Nº cliente) pero tampoco son
      // incorporaciones — conservan su fecha de incorporación original.
      setCruce({
        repetidosEnArchivo: data.filas_repetidas_en_archivo ?? 0,
        yaEnCartera: data.ya_en_cartera ?? 0,
        yaEnCarteraCodigos: data.ya_en_cartera_codigos ?? [],
        regularizados: data.regularizados_fuera_de_cartera ?? 0,
        regularizadosCodigos: data.regularizados_fuera_de_cartera_codigos ?? [],
      });
      if (data.ya_en_cartera) {
        toast.warning(
          `${data.ya_en_cartera} de los códigos subidos YA estaban en la cartera: se actualizó su ficha, no se contaron como incorporaciones nuevas.`
        );
      }
      if (data.filas_repetidas_en_archivo) {
        toast.warning(
          `${data.filas_repetidas_en_archivo} filas del archivo repiten un Nº cliente que ya venía antes: se conservó la última de cada código.`
        );
      }
      // Un PDV marcado "Fuera de cartera" que aparece en el archivo pasa a ser
      // cartera formal y entra a las poblaciones/tasas. Es un cambio de
      // universo, no una actualización de ficha: tiene que verse.
      if (data.regularizados_fuera_de_cartera) {
        toast.warning(
          `${data.regularizados_fuera_de_cartera} PDV que estaban marcados "Fuera de cartera" pasan a ser cartera formal y empiezan a contar en poblaciones y tasas.`
        );
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
    setCruce(null);
  }

  function getStats(rows: ParsedCarteraRow[]) {
    const oficinas = [...new Set(rows.map((r) => r.oficina_venta))].sort();
    return { oficinas };
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
        onClick={() => document.getElementById("cartera-file-input")?.click()}
      >
        <input
          id="cartera-file-input"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileInput}
        />
        {state === "parsing" ? (
          <p className="text-slate-500 animate-pulse">Procesando {fileName}…</p>
        ) : (
          <>
            <div className="text-4xl mb-3">📇</div>
            <p className="font-medium text-slate-700">Arrastra el Excel de cartera de clientes aquí</p>
            <p className="text-sm text-slate-400 mt-1">o haz clic para seleccionar (.xlsx, .xls)</p>
            <p className="text-xs text-slate-400 mt-2">
              Debe incluir columnas: Nº cliente, Nombre, Oficina de Ventas, Tipo de Cliente, Centro Poblado
            </p>
          </>
        )}
      </div>
    );
  }

  if ((state === "previewing" || state === "uploading") && parseResult) {
    const { oficinas } = getStats(parseResult.valid);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{fileName}</h3>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge variant="default">{parseResult.valid.length} clientes</Badge>
              {oficinas.map((o) => (
                <Badge key={o} variant="secondary">
                  {o}
                </Badge>
              ))}
              {parseResult.errors.length > 0 && (
                <Badge variant="destructive">{parseResult.errors.length} errores</Badge>
              )}
              {/* El ranking por segmento de DIENN depende de esta columna: hay que
                  poder ver ANTES de confirmar si se reconoció o no. */}
              <Badge variant={parseResult.segmentoDetectado ? "secondary" : "destructive"}>
                {parseResult.segmentoDetectado ? "Segmento de Clientes 2 ✓" : "Sin columna de segmento"}
              </Badge>
            </div>
            {!parseResult.segmentoDetectado && parseResult.headers && (
              <div className="text-xs text-slate-500">
                No reconocí la columna de segmento. Debe llamarse{" "}
                <span className="font-medium">&quot;Segmento de Clientes 2&quot;</span>. Encabezados encontrados en el
                archivo: <span className="font-mono">{parseResult.headers.join(" · ")}</span>
              </div>
            )}
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
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Oficina de Ventas</TableHead>
                    <TableHead>Centro Poblado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parseResult.valid.slice(0, 100).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{row.sap_code}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{row.name}</TableCell>
                      <TableCell className="text-xs">{row.tipo_cliente}</TableCell>
                      <TableCell className="text-xs">{row.oficina_venta}</TableCell>
                      <TableCell className="text-xs">{row.centro_poblado}</TableCell>
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
            {state === "uploading" ? "Cargando…" : `Confirmar · ${parseResult.valid.length} clientes`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-4">
      <div className="text-center">
        <div className="text-4xl mb-3">✅</div>
        <p className="font-medium text-slate-700">Carga completada</p>
      </div>

      {/* Cruce contra la cartera previa. Los avisos emergentes desaparecen solos;
          esto queda en pantalla para poder copiar los códigos repetidos y
          revisarlos contra el archivo de origen. */}
      {cruce && (
        <div className="border rounded-lg p-4 text-sm text-slate-600 space-y-2 max-w-xl mx-auto">
          <p className="font-medium text-slate-900">Cruce con la cartera que ya estaba</p>
          <ul className="space-y-1">
            <li>
              Códigos que ya existían: <span className="font-medium">{cruce.yaEnCartera}</span> — se
              actualizó su ficha y conservan su fecha de incorporación original.
            </li>
            <li>
              Filas repetidas dentro del archivo:{" "}
              <span className="font-medium">{cruce.repetidosEnArchivo}</span> — se conservó la última
              de cada Nº cliente.
            </li>
            {cruce.regularizados > 0 && (
              <li className="text-amber-600">
                Pasaron de &quot;Fuera de cartera&quot; a cartera formal:{" "}
                <span className="font-medium">{cruce.regularizados}</span> — ahora cuentan en
                poblaciones y tasas.
              </li>
            )}
          </ul>
          {cruce.yaEnCarteraCodigos.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mt-2">
                Códigos ya existentes (primeros {cruce.yaEnCarteraCodigos.length}):
              </p>
              <p className="font-mono text-xs text-slate-500 break-all">
                {cruce.yaEnCarteraCodigos.join(" · ")}
              </p>
            </div>
          )}
          {cruce.regularizadosCodigos.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mt-2">
                Códigos que estaban &quot;Fuera de cartera&quot;:
              </p>
              <p className="font-mono text-xs text-slate-500 break-all">
                {cruce.regularizadosCodigos.join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="text-center">
        <Button variant="outline" onClick={handleReset}>
          Cargar otro archivo
        </Button>
      </div>
    </div>
  );
}
