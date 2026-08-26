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
  clientes_descartados_fuera_cartera: number;
  clientes_en_archivo: number;
  meses: string[];
  desde: string;
  hasta: string;
  total_kg: number;
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
  const locationIdBySapCode = new Map(locations.map((l) => [l.sap_code, l.id]));

  const sapCodesEnArchivo = new Set(rows.map((r) => r.sap_code));
  const codigosFueraDeCartera = new Set<string>();
  const materialesNoMapeados = new Set<string>();

  // NO se colapsa por "último corte" — verificado contra la fila "Resultado
  // total" que el propio SAP calcula al final del archivo (26-08-2026): la
  // suma de "Venta Acumulada" de TODAS las filas, sin filtrar por fecha ni
  // por mes, es exactamente el total que reporta SAP (y coincide con
  // "Venta Diaria Promedio" del mismo Resultado total × días hábiles). Cada
  // fila es un aporte independiente que hay que sumar completo — no una
  // fotografía acumulada de la que solo valga la más reciente.
  //
  // Sí se colapsa por cliente+material+FECHA exacta (sumando, no
  // reemplazando): si el archivo repite la misma fila exacta, la unique
  // constraint de la tabla (sap_code, material_code, date_of_sale) exige un
  // solo registro para esa combinación.
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
    const location_id = locationIdBySapCode.get(r.sap_code);
    if (!location_id) {
      codigosFueraDeCartera.add(r.sap_code);
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
  return {
    inserted: toInsert.length,
    reemplazadas,
    clientes_en_cartera: new Set(toInsert.map((r) => r.location_id)).size,
    clientes_descartados_fuera_cartera: codigosFueraDeCartera.size,
    clientes_en_archivo: sapCodesEnArchivo.size,
    meses: [...new Set(rows.map((r) => r.fecha.slice(0, 7)))].sort(),
    desde: fechasArchivo[0],
    hasta: fechasArchivo[fechasArchivo.length - 1],
    total_kg: Math.round(toInsert.reduce((s, r) => s + r.quantity_kg, 0) * 10) / 10,
  };
}
