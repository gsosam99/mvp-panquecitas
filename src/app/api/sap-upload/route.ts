import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import {
  PRODUCT_IDS,
  SAP_RADAR_MATERIAL_PRODUCT_MAP,
  SAP_RADAR_MATERIAL_VARIANT_MAP,
  SAP_MATERIAL_PRODUCT_MAP,
  SAP_MATERIAL_VARIANT_MAP,
} from "@/data/catalog";
import { mapLocationType } from "@/lib/excel-parser";
import { isExcludedDistribuidor } from "@/lib/sectors";
import type { ParsedSapRadarRow, ParsedSapFacturacionRow } from "@/types";

type RadarFecha = { sap_code: string; material_code: string; fecha: string };

type SapUploadBody =
  // Reporte "Radar" (Harina PAN + Panquecitas) — acumulado del mes, un
  // archivo MHTML por producto ("Radar HPM.xls" / "Radar panquecitas.xls").
  // `fechas` = todas las fechas distintas con venta (para la recompra), aparte
  // del acumulado que va en `rows`.
  | { format: "radar"; rows: ParsedSapRadarRow[]; batchId: string; fechas?: RadarFecha[] }
  // Reporte "Pedidos y Facturado" (Panquecitas, Cantidad Pedido/Facturada por día).
  | { format: "facturacion"; rows: ParsedSapFacturacionRow[]; batchId: string };

// Misma fila (cliente + fecha + producto/presentación) → misma llave. null se
// normaliza a un string fijo porque el radar de HPM nunca trae variant_id.
function dedupeKey(location_id: string, product_id: string, variant_id: string | null | undefined, date: string) {
  return `${location_id}|${product_id}|${variant_id ?? "null"}|${date}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

// Los errores de supabase-js (PostgrestError) traen message/details/hint/code
// en vez de un Error normal. Los aplanamos a un string legible para
// devolverlo en el 500 — esto es una ruta solo-admin (hasDashboardSession),
// así que exponer el detalle real de la BD ayuda a diagnosticar sin filtrar
// nada sensible a usuarios finales.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorDetail(error: any): string {
  if (error && typeof error === "object") {
    const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  return String(error);
}

// Mapa dedupeKey → id de la fila ya existente (para actualizar en vez de
// duplicar/omitir, reporte "Pedidos y Facturado" — llave por fecha exacta).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchExistingRecords(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  dateColumn: string,
  locationIds: string[],
  dates: string[]
): Promise<Map<string, string>> {
  if (!locationIds.length || !dates.length) return new Map();
  const { data, error } = await supabase
    .from(table)
    .select(`id, location_id, product_id, variant_id, ${dateColumn}`)
    .in("location_id", locationIds)
    .in(dateColumn, dates);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const r of data as { id: string; location_id: string; product_id: string; variant_id: string | null }[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.set(dedupeKey(r.location_id, r.product_id, r.variant_id, (r as any)[dateColumn]), r.id);
  }
  return map;
}

// El reporte Radar (SAP) NO crea clientes nuevos — solo puede alimentar
// ventas de clientes que ya viven en `locations` (cargados vía Cartera de
// Clientes, el universo cerrado del piloto). Un client_code de SAP que no
// esté en la cartera se ignora por completo. Ver decisión con Alejandro
// (06-08-2026): el reporte de Pedidos y Facturado trae clientes
// (distribuidoras) que no son puntos de venta reales y no deben contarse.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveKnownLocationIds(supabase: any, sapCodes: string[]): Promise<Map<string, string>> {
  if (!sapCodes.length) return new Map();
  const { data, error } = await supabase.from("locations").select("id, sap_code").in("sap_code", sapCodes);
  if (error) throw error;
  return new Map((data as { id: string; sap_code: string }[]).map((l) => [l.sap_code, l.id]));
}

export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = (await req.json()) as SapUploadBody;
    if (!body?.rows?.length || !body.batchId) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    if (body.format === "facturacion") {
      return await handleFacturacionUpload(supabase, body.rows, body.batchId);
    }
    if (body.format === "radar") {
      return await handleRadarUpload(supabase, body.rows, body.batchId, body.fechas ?? []);
    }
    return Response.json({ error: "Formato de reporte desconocido" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/sap-upload]", error);
    return Response.json(
      { error: "Error interno del servidor", detail: errorDetail(error) },
      { status: 500 }
    );
  }
}

// ── Reporte "Radar" (Harina PAN + Panquecitas) — acumulado del mes ─────────
// Cada fila trae "Venta Acumulada": lo real DESPACHADO acumulado en lo que
// va del mes para ese cliente+material. Si se vuelve a subir un radar más
// adelante dentro del mismo mes, el número siempre es mayor o igual al
// anterior — así que la fila existente para ese cliente+producto+
// presentación+MES se REEMPLAZA con el nuevo acumulado (y su fecha), nunca
// se suma ni se descarta. Un mes nuevo simplemente crea una fila nueva.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRadarUpload(supabase: any, rows: ParsedSapRadarRow[], batchId: string, fechas: RadarFecha[]) {
  // ── 1. Resolver clientes contra la cartera ya cargada (no se crean nuevos) ──
  const uniqueByCode = new Map<string, ParsedSapRadarRow>();
  for (const row of rows) uniqueByCode.set(row.sap_code, row);

  const knownLocationIds = await resolveKnownLocationIds(supabase, [...uniqueByCode.keys()]);
  const clientesFueraCartera = [...uniqueByCode.keys()].filter((c) => !knownLocationIds.has(c)).length;

  const locationsToRefresh = [...uniqueByCode.entries()]
    .filter(([sap_code]) => knownLocationIds.has(sap_code))
    .map(([sap_code, row]) => ({
      sap_code,
      name: row.client_name,
      type: mapLocationType(row.tipo_cliente),
      tipo_cliente: row.tipo_cliente || null,
      esquema_atencion: row.esquema_atencion || null,
      grupo_vendedor: row.grupo_vendedor || null,
      region: row.region || null,
      oficina_venta: row.oficina_venta || null,
      zona_venta: row.zona_venta || null,
    }));

  let locationsUpdated = 0;
  if (locationsToRefresh.length > 0) {
    const { data: upsertedLocs, error: locError } = await supabase
      .from("locations")
      .upsert(locationsToRefresh, { onConflict: "sap_code", ignoreDuplicates: false })
      .select("id");
    if (locError) throw locError;
    locationsUpdated = (upsertedLocs ?? []).length;
  }

  // ── 2. Resolver product_id + variant_id por material — solo clientes conocidos ──
  const unknownMaterials = new Set<string>();
  const sellInRows: { location_id: string; product_id: string; variant_id: string | null; quantity_kg: number; date_of_sale: string }[] = [];
  for (const row of rows) {
    const location_id = knownLocationIds.get(row.sap_code);
    if (!location_id) continue; // cliente fuera de la cartera → se ignora

    const product_id = SAP_RADAR_MATERIAL_PRODUCT_MAP[row.material_code];
    if (!product_id) {
      unknownMaterials.add(`${row.material_code} (${row.material_name})`);
      continue;
    }
    const variant_id = SAP_RADAR_MATERIAL_VARIANT_MAP[row.material_code] ?? null;

    sellInRows.push({ location_id, product_id, variant_id, quantity_kg: row.quantity_kg, date_of_sale: row.fecha });
  }

  if (unknownMaterials.size > 0) {
    return Response.json({
      error: `Materiales SAP no mapeados: ${[...unknownMaterials].join(", ")}. Actualiza SAP_RADAR_MATERIAL_PRODUCT_MAP en catalog.ts.`,
    }, { status: 422 });
  }

  // ── 3. Colapsar por cliente+producto+presentación+MES — se queda la fecha más reciente ──
  const byKey = new Map<string, (typeof sellInRows)[number]>();
  for (const r of sellInRows) {
    const key = dedupeKey(r.location_id, r.product_id, r.variant_id, monthKey(r.date_of_sale));
    const existing = byKey.get(key);
    if (!existing || r.date_of_sale > existing.date_of_sale) byKey.set(key, r);
  }

  // ── 4. Reemplazar el acumulado existente o insertar si es la primera vez ──
  const locationIds = [...new Set([...byKey.values()].map((r) => r.location_id))];
  const existingRows = locationIds.length
    ? await (async () => {
        const { data, error } = await supabase
          .from("sap_sell_in_records")
          .select("id, location_id, product_id, variant_id, date_of_sale")
          .in("location_id", locationIds)
          .in("product_id", [PRODUCT_IDS.PANQUECITAS, PRODUCT_IDS.HARINA_PAN]);
        if (error) throw error;
        return data as { id: string; location_id: string; product_id: string; variant_id: string | null; date_of_sale: string }[];
      })()
    : [];

  const existingByKey = new Map<string, { id: string; date_of_sale: string }>();
  for (const r of existingRows) {
    existingByKey.set(dedupeKey(r.location_id, r.product_id, r.variant_id, monthKey(r.date_of_sale)), {
      id: r.id,
      date_of_sale: r.date_of_sale,
    });
  }

  const toInsert: (typeof sellInRows) = [];
  const toUpdate: { id: string; quantity_kg: number; date_of_sale: string }[] = [];
  const toDelete: string[] = [];
  let staleSkipped = 0;
  let nonPositiveSkipped = 0;
  for (const [key, r] of byKey) {
    const existing = existingByKey.get(key);

    // sap_sell_in_records exige quantity_kg > 0 (ver schema.sql). Un
    // acumulado <= 0 en el archivo (créditos/devoluciones que dejan el mes
    // en cero o negativo) no se puede guardar tal cual: si ya había un
    // acumulado positivo guardado para esa llave, se elimina en vez de
    // dejarlo desactualizado; si no había nada, simplemente no se inserta.
    if (r.quantity_kg <= 0) {
      if (existing && r.date_of_sale >= existing.date_of_sale) {
        toDelete.push(existing.id);
      } else {
        nonPositiveSkipped++;
      }
      continue;
    }

    if (!existing) {
      toInsert.push(r);
    } else if (r.date_of_sale >= existing.date_of_sale) {
      toUpdate.push({ id: existing.id, quantity_kg: r.quantity_kg, date_of_sale: r.date_of_sale });
    } else {
      staleSkipped++; // el archivo trae una fecha más vieja que el acumulado ya guardado
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("sap_sell_in_records").insert(
      toInsert.map((r) => ({ uploaded_by: null, upload_batch_id: batchId, ...r }))
    );
    if (insertError) throw insertError;
  }
  if (toUpdate.length > 0) {
    const results = await Promise.all(
      toUpdate.map((u) =>
        supabase
          .from("sap_sell_in_records")
          .update({ quantity_kg: u.quantity_kg, date_of_sale: u.date_of_sale, upload_batch_id: batchId })
          .eq("id", u.id)
      )
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const failed = results.find((r: any) => r.error);
    if (failed) throw failed.error;
  }
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase.from("sap_sell_in_records").delete().in("id", toDelete);
    if (deleteError) throw deleteError;
  }

  // ── 5. Fechas de venta Radar (para la recompra) → radar_ventas_fechas ──
  // Distintas por (cliente, producto, fecha). Solo clientes de la cartera y
  // materiales mapeados. NO es crítico: si la tabla no existe todavía (falta
  // correr el migration 013) o falla el insert, se registra y se sigue — la
  // carga del acumulado no se rompe.
  let fechasInserted = 0;
  try {
    const seen = new Set<string>();
    const fechaRows: { location_id: string; product_id: string; fecha: string }[] = [];
    for (const f of fechas) {
      const location_id = knownLocationIds.get(f.sap_code);
      const product_id = SAP_RADAR_MATERIAL_PRODUCT_MAP[f.material_code];
      if (!location_id || !product_id) continue; // cliente fuera de cartera o material no mapeado
      const key = `${location_id}|${product_id}|${f.fecha}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fechaRows.push({ location_id, product_id, fecha: f.fecha });
    }
    if (fechaRows.length > 0) {
      const { error: fechasError } = await supabase
        .from("radar_ventas_fechas")
        .upsert(fechaRows, { onConflict: "location_id,product_id,fecha", ignoreDuplicates: true });
      if (fechasError) throw fechasError;
      fechasInserted = fechaRows.length;
    }
  } catch (fechasErr) {
    console.error("[handleRadarUpload] no se pudieron guardar las fechas de recompra (no crítico):", fechasErr);
  }

  return Response.json({
    format: "radar",
    inserted: toInsert.length,
    fechas_registradas: fechasInserted,
    updated: toUpdate.length,
    deleted: toDelete.length,
    stale_skipped: staleSkipped,
    non_positive_skipped: nonPositiveSkipped,
    clientes_fuera_cartera: clientesFueraCartera,
    locations_upserted: locationsUpdated,
  });
}

// ── Reporte "Pedidos y Facturado" (Panquecitas): Pedido/Entregado/Facturado ─
// Escribe EXCLUSIVAMENTE en sap_pedidos_facturados — nunca en
// sap_sell_in_records (esa tabla es solo de "Carga Radar"). Ambas cifras
// crudas del reporte (Cantidad Pedido y Cantidad Facturada) se guardan
// juntas por cliente+material+fecha, porque DIENN necesita mostrarlas como
// dos tarjetas independientes que NO se pueden sumar entre sí ni con el
// Radar — son procesos de venta distintos. Ver decisión con Alejandro
// (07-08-2026) y migración 010.
//
// Es un reporte diario (una fila por cliente+material+fecha), así que a
// diferencia del Radar (acumulado mensual) aquí una fila repetida sí es un
// duplicado real y se descarta, no se reemplaza.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFacturacionUpload(supabase: any, rows: ParsedSapFacturacionRow[], batchId: string) {
  // ── 1. Resolver clientes contra la cartera ya cargada. Excepción: las
  // distribuidoras intermediarias conocidas (isExcludedDistribuidor) SÍ se
  // crean/actualizan aquí — su volumen facturado cuenta para las métricas
  // de Pedidos y Facturado (ayudan a llegar el producto al PDV vía Radar),
  // pero quedan excluidas del universo real en getUniverseLocations(), así
  // que nunca cuentan como clientes para mercaderistas/promotoras ni para
  // penetración. Ver decisión con Alejandro (08-08-2026).
  const uniqueByCode = new Map<string, ParsedSapFacturacionRow>();
  for (const row of rows) uniqueByCode.set(row.sap_code, row);

  const knownLocationIds = await resolveKnownLocationIds(supabase, [...uniqueByCode.keys()]);
  const clientesFueraCartera = [...uniqueByCode.keys()].filter(
    (c) => !knownLocationIds.has(c) && !isExcludedDistribuidor(c)
  ).length;

  const locationsToUpsert = [...uniqueByCode.entries()]
    .filter(([sap_code]) => knownLocationIds.has(sap_code) || isExcludedDistribuidor(sap_code))
    .map(([sap_code, row]) => ({
      sap_code,
      name: row.client_name,
      type: mapLocationType(row.tipo_cliente),
      tipo_cliente: row.tipo_cliente || null,
      esquema_atencion: row.esquema_atencion || null,
      grupo_vendedor: row.grupo_vendedor || null,
      region: row.region || null,
      oficina_venta: row.oficina_venta || null,
      zona_venta: row.zona_venta || null,
    }));

  let locationsUpdated = 0;
  if (locationsToUpsert.length > 0) {
    const { data: upsertedLocs, error: locError } = await supabase
      .from("locations")
      .upsert(locationsToUpsert, { onConflict: "sap_code", ignoreDuplicates: false })
      .select("id, sap_code");
    if (locError) throw locError;
    locationsUpdated = (upsertedLocs ?? []).length;
    // Las distribuidoras recién creadas no estaban en knownLocationIds — se
    // agregan ahora para que la fila 2 (pedidoFacturadoRows) las reconozca.
    for (const l of upsertedLocs as { id: string; sap_code: string }[]) {
      knownLocationIds.set(l.sap_code, l.id);
    }
  }

  // ── 2. Resolver product_id + variant_id por material. variant_id es lo
  // que alimenta el Mix de Producto de DIENN (400g/800g).
  const unknownMaterials = new Set<string>();
  const pedidoFacturadoRows: {
    upload_batch_id: string;
    location_id: string;
    product_id: string;
    variant_id: string | null;
    cantidad_pedido_kg: number;
    cantidad_facturada_kg: number;
    fecha: string;
  }[] = [];

  for (const row of rows) {
    const location_id = knownLocationIds.get(row.sap_code);
    if (!location_id) continue; // cliente fuera de la cartera → se ignora

    const product_id = SAP_MATERIAL_PRODUCT_MAP[row.material_code];
    if (!product_id) {
      unknownMaterials.add(`${row.material_code} (${row.material_name})`);
      continue;
    }
    const variant_id = SAP_MATERIAL_VARIANT_MAP[row.material_code] ?? null;

    // La tabla exige cantidad_pedido_kg / cantidad_facturada_kg >= 0 (CHECK
    // de la migración 010). En el reporte SAP un valor negativo representa un
    // dato nulo/sin cantidad, así que cuenta como 0. Insertarlo tal cual
    // violaba el CHECK y hacía fallar TODA la carga con un 500. Se recorta a 0
    // por columna, de forma independiente entre pedido y facturado.
    const cantidad_pedido_kg = Math.max(0, row.cantidad_pedido_kg);
    const cantidad_facturada_kg = Math.max(0, row.cantidad_facturada_kg);
    if (cantidad_pedido_kg <= 0 && cantidad_facturada_kg <= 0) continue; // fila sin datos útiles

    pedidoFacturadoRows.push({
      upload_batch_id: batchId,
      location_id,
      product_id,
      variant_id,
      cantidad_pedido_kg,
      cantidad_facturada_kg,
      fecha: row.fecha,
    });
  }

  if (unknownMaterials.size > 0) {
    return Response.json({
      error: `Materiales SAP no mapeados: ${[...unknownMaterials].join(", ")}. Actualiza SAP_MATERIAL_PRODUCT_MAP en catalog.ts.`,
    }, { status: 422 });
  }

  // ── 3. Descartar filas ya cargadas (mismo cliente + fecha + material) ──
  const locationIds = [...new Set(pedidoFacturadoRows.map((r) => r.location_id))];
  const existingKeys = await fetchExistingRecords(
    supabase,
    "sap_pedidos_facturados",
    "fecha",
    locationIds,
    [...new Set(pedidoFacturadoRows.map((r) => r.fecha))]
  );

  // El reporte puede traer VARIAS filas por (cliente, producto, presentación,
  // fecha) — distintas facturas/pedidos del mismo día — que NO son duplicados:
  // se SUMAN, no se descartan (antes se caía ~la mitad del volumen facturado).
  const aggByKey = new Map<string, (typeof pedidoFacturadoRows)[number]>();
  for (const r of pedidoFacturadoRows) {
    const key = dedupeKey(r.location_id, r.product_id, r.variant_id, r.fecha);
    const acc = aggByKey.get(key);
    if (acc) {
      acc.cantidad_pedido_kg += r.cantidad_pedido_kg;
      acc.cantidad_facturada_kg += r.cantidad_facturada_kg;
    } else {
      aggByKey.set(key, { ...r });
    }
  }
  // Se omiten solo las llaves ya presentes en la BD (re-carga idempotente). Para
  // recargar con los valores corregidos, borra antes el batch anterior.
  const newRows = [...aggByKey.values()].filter(
    (r) => !existingKeys.has(dedupeKey(r.location_id, r.product_id, r.variant_id, r.fecha))
  );

  // ── 4. Insert ────────────────────────────────────────────────────────────
  if (newRows.length > 0) {
    const { error } = await supabase.from("sap_pedidos_facturados").insert(newRows);
    if (error) throw error;
  }

  return Response.json({
    format: "facturacion",
    locations_upserted: locationsUpdated,
    inserted: newRows.length,
    duplicates_skipped: pedidoFacturadoRows.length - newRows.length,
    clientes_fuera_cartera: clientesFueraCartera,
  });
}

export async function DELETE(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const { batchId } = await req.json() as { batchId: string };
    if (!batchId) return Response.json({ error: "batchId requerido" }, { status: 400 });

    // Un batch pertenece a Carga Radar (sap_sell_in_records) o a Pedidos y
    // Facturado (sap_pedidos_facturados), nunca a ambas — borrar en las dos
    // es inofensivo porque el id no calza en la tabla que no le corresponde.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [sellInResult, pedidosFacturadosResult] = await Promise.all([
      (supabase as any).from("sap_sell_in_records").delete().eq("upload_batch_id", batchId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("sap_pedidos_facturados").delete().eq("upload_batch_id", batchId),
    ]);

    if (sellInResult.error) throw sellInResult.error;
    if (pedidosFacturadosResult.error) throw pedidosFacturadosResult.error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/sap-upload]", error);
    return Response.json(
      { error: "Error interno del servidor", detail: errorDetail(error) },
      { status: 500 }
    );
  }
}
