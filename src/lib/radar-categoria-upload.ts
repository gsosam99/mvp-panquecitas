import { getUniverseLocations } from "@/lib/universe";
import type { ParsedSapRadarRow } from "@/types";

// Carga compartida por las 4 combinaciones categoría×propósito de Mavesa
// (Margarina/Mayonesa × referencia/actual — ver supabase/migrations/022 y el
// plan "Comparativa Panquecitas vs. Margarina/Mayonesa"). Cada ruta le pasa
// SU PROPIA tabla, así que el delete-replace de una carga nunca toca a las
// otras 3 — la separación es a nivel de qué tabla se le pasa a esta función,
// no de lógica condicional acá adentro.
//
// Cartera-only siempre, para las 4 combinaciones (decisión del usuario,
// 26-08-2026: "universo toma todos los clientes de la cartera" — no el
// universo del archivo completo, que se probó antes y se revirtió): resuelve
// contra getUniverseLocations() y DESCARTA lo que no calce.

export function errorDetail(error: unknown): string {
  if (error && typeof error === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = error as any;
    const parts = [e.message, e.details, e.hint, e.code].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  return String(error);
}

export interface RadarCategoriaUploadResult {
  inserted: number;
  /** 0 si `finalizar: false` — la limpieza de filas viejas se hace una sola vez, en la última tanda. */
  reemplazadas: number;
  clientes_en_cartera: number;
  /** Tamaño de la cartera del piloto, para poder leer "N de <cartera_total>". */
  cartera_total: number;
  clientes_descartados_fuera_cartera: number;
  clientes_en_archivo: number;
  meses: string[];
  desde: string;
  hasta: string;
  total_kg: number;
  /**
   * kg GUARDADOS por mes (cartera-only). Es el diagnóstico que faltaba: el
   * reporte trae una columna "Venta Acumulada" POR MES y, si el parser
   * reconoce solo una de ellas, los otros meses entran en 0 y desaparecen sin
   * error. Con el total suelto eso era invisible; acá se ve de una.
   */
  total_kg_por_mes: Record<string, number>;
  /**
   * kg del ARCHIVO por mes, antes de recortar por cartera. Sirve para cuadrar
   * contra Excel: sumar las columnas de Venta Acumulada del reporte tiene que
   * dar exactamente esto.
   */
  total_kg_archivo_por_mes: Record<string, number>;
  /** Filas del archivo (antes de descartar fuera de cartera y no mapeadas). */
  filas_en_archivo: number;
}

/**
 * @param supabase Cliente service-role.
 * @param tabla Nombre de la tabla destino (una de las 4 de migration 022) — es
 *   lo único que distingue una carga de otra, todo lo demás es idéntico.
 * @param materialMap Mapa material_code → product_id. Puede traer códigos de
 *   OTRA categoría (el mapa se comparte entre Margarina y Mayonesa, ver
 *   catalog.ts): por eso se exige `expectedProductId` y una fila cuyo
 *   material resuelva a un producto distinto se rechaza, para que subir el
 *   archivo en el endpoint equivocado falle rápido en vez de guardar datos
 *   de una categoría bajo el nombre de otra.
 * @param finalizar Si es `false`, inserta/actualiza pero NO corre el
 *   borrado de filas viejas — usado por el dropzone cuando parte un archivo
 *   grande en varias tandas (mismo batchId) para no pasarse del límite de
 *   tamaño de payload de Vercel: correr el borrado en cada tanda dejaría la
 *   tabla momentáneamente incompleta (borraría clientes que la tanda
 *   siguiente todavía no reinsertó). Se corre UNA sola vez, en la última.
 */
export async function processRadarCategoriaUpload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tabla: string,
  materialMap: Record<string, string>,
  expectedProductId: string,
  rows: ParsedSapRadarRow[],
  batchId: string,
  finalizar = true
): Promise<RadarCategoriaUploadResult | { error: string; status: number }> {
  const locations = await getUniverseLocations();
  // Trim en los DOS lados: el parser ya recorta el código del archivo, pero en
  // `locations` pueden quedar valores con espacios de cargas viejas. Un código
  // que no calza se descarta en silencio y ese cliente desaparece del promedio
  // para siempre — es justo el fallo que hace que el promedio no se mueva
  // cuando la cartera crece.
  const locationIdBySapCode = new Map(locations.map((l) => [l.sap_code.trim(), l.id]));

  const sapCodesEnArchivo = new Set(rows.map((r) => r.sap_code.trim()));
  const codigosFueraDeCartera = new Set<string>();
  const materialesNoMapeados = new Set<string>();

  // NO se colapsa por "último corte". El archivo de referencia de Mavesa trae
  // UNA SOLA columna "Venta Acumulada" y ese número YA ES el acumulado de los
  // tres meses: cada fila es un aporte independiente que hay que sumar
  // completo, no una fotografía acumulada de la que solo valga la más
  // reciente (usuario, 27-08-2026). Verificado además contra la fila
  // "Resultado total" que el propio SAP calcula al final del archivo: la suma
  // de "Venta Acumulada" de TODAS las filas, sin filtrar por fecha ni por mes,
  // es exactamente el total que reporta SAP.
  //
  // Esto NO es lo mismo que radar-3m-upload (Harina PAN), y esa diferencia es
  // real, no una inconsistencia: el reporte de PAN trae UNA COLUMNA DE VENTA
  // ACUMULADA POR MES (ver findRadarRatioColumns en sap-mhtml-parser.ts), así
  // que ahí sí hay cortes por mes y quedarse con el último de cada uno es lo
  // correcto. Son dos formatos de archivo distintos. Unificar el criterio —
  // que se probó el 26-08-2026 y se revirtió— hundía el total de Mavesa,
  // porque descartaba todas las filas del mes menos una.
  //
  // Sí se colapsa por cliente+material+FECHA exacta (sumando, no
  // reemplazando): si el archivo repite la misma fila exacta, la unique
  // constraint de la tabla (sap_code, material_code, date_of_sale) exige un
  // solo registro para esa combinación.
  //
  // Por MATERIAL y no por producto: una categoría puede tener varias
  // presentaciones y colapsando por producto un cliente con dos de ellas
  // perdería el volumen de una.
  const byKey = new Map<
    string,
    {
      sap_code: string;
      material_code: string;
      location_id: string;
      product_id: string;
      quantity_kg: number;
      date_of_sale: string;
    }
  >();

  for (const r of rows) {
    const location_id = locationIdBySapCode.get(r.sap_code.trim());
    if (!location_id) {
      codigosFueraDeCartera.add(r.sap_code.trim());
      continue; // cartera-only: se descarta, no se guarda con location_id null
    }

    const product_id = materialMap[r.material_code];
    if (!product_id || product_id !== expectedProductId) {
      materialesNoMapeados.add(`${r.material_code} (${r.material_name})`);
      continue;
    }

    const key = `${r.sap_code}|${r.material_code}|${r.fecha}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.quantity_kg += r.quantity_kg;
    } else {
      byKey.set(key, {
        sap_code: r.sap_code,
        material_code: r.material_code,
        location_id,
        product_id,
        quantity_kg: r.quantity_kg,
        date_of_sale: r.fecha,
      });
    }
  }

  if (materialesNoMapeados.size > 0) {
    return {
      error: `Materiales SAP no mapeados (o de otra categoría): ${[...materialesNoMapeados].join(
        ", "
      )}. Actualiza SAP_RADAR_MAVESA_MATERIAL_PRODUCT_MAP en catalog.ts, o revisa que este archivo va en el endpoint correcto.`,
      status: 422,
    };
  }

  const colapsadas = [...byKey.values()];
  const toInsert = colapsadas.filter((r) => r.quantity_kg > 0).map((r) => ({ ...r, upload_batch_id: batchId }));

  if (toInsert.length === 0) {
    return { error: "El archivo no trajo ninguna fila con volumen de clientes en cartera.", status: 422 };
  }

  const TANDA_FILAS = 500;
  for (let i = 0; i < toInsert.length; i += TANDA_FILAS) {
    const { error: upsertError } = await supabase
      .from(tabla)
      .upsert(toInsert.slice(i, i + TANDA_FILAS), {
        onConflict: "sap_code,material_code,date_of_sale",
        ignoreDuplicates: false,
      });
    if (upsertError) throw upsertError;
  }

  // Reemplazo completo de ESTA tabla únicamente — nunca toca ninguna otra
  // combinación categoría×propósito ni las tablas de PAN. Solo en la última
  // tanda (ver `finalizar` en el JSDoc de arriba).
  let reemplazadas = 0;
  if (finalizar) {
    const { data: borradas, error: staleError } = await supabase
      .from(tabla)
      .delete()
      .or(`upload_batch_id.is.null,upload_batch_id.neq.${batchId}`)
      .select("id");
    if (staleError) throw staleError;
    reemplazadas = (borradas ?? []).length;
  }

  // Diagnóstico de meses/rango a partir del ARCHIVO completo (rows), no de
  // `toInsert` — evita que un cliente/material descartado (fuera de cartera,
  // material no mapeado) recorte el rango mostrado.
  const fechasArchivo = rows.map((r) => r.fecha).sort();

  // kg por mes, en los dos alcances. Se acumula en crudo y se redondea al
  // final: redondear en cada suma arrastra el error a lo largo de miles de
  // filas y el desglose deja de cuadrar con el total.
  const acumPorMes = (pares: { mes: string; kg: number }[]): Record<string, number> => {
    const crudo = new Map<string, number>();
    for (const p of pares) crudo.set(p.mes, (crudo.get(p.mes) ?? 0) + p.kg);
    const salida: Record<string, number> = {};
    for (const mes of [...crudo.keys()].sort()) salida[mes] = Math.round((crudo.get(mes) ?? 0) * 10) / 10;
    return salida;
  };

  return {
    inserted: toInsert.length,
    reemplazadas,
    clientes_en_cartera: new Set(toInsert.map((r) => r.location_id)).size,
    cartera_total: locations.length,
    clientes_descartados_fuera_cartera: codigosFueraDeCartera.size,
    clientes_en_archivo: sapCodesEnArchivo.size,
    meses: [...new Set(rows.map((r) => r.fecha.slice(0, 7)))].sort(),
    desde: fechasArchivo[0],
    hasta: fechasArchivo[fechasArchivo.length - 1],
    total_kg: Math.round(toInsert.reduce((s, r) => s + r.quantity_kg, 0) * 10) / 10,
    total_kg_por_mes: acumPorMes(
      toInsert.map((r) => ({ mes: r.date_of_sale.slice(0, 7), kg: r.quantity_kg }))
    ),
    total_kg_archivo_por_mes: acumPorMes(
      rows.map((r) => ({ mes: r.fecha.slice(0, 7), kg: r.quantity_kg }))
    ),
    filas_en_archivo: rows.length,
  };
}
