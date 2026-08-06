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
import type { ParsedSapRadarRow, ParsedSapFacturacionRow } from "@/types";

type SapUploadBody =
  // Reporte "Radar" (Harina PAN + Panquecitas) — acumulado del mes, un
  // archivo MHTML por producto ("Radar HPM.xls" / "Radar panquecitas.xls").
  | { format: "radar"; rows: ParsedSapRadarRow[]; batchId: string }
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
      return await handleRadarUpload(supabase, body.rows, body.batchId);
    }
    return Response.json({ error: "Formato de reporte desconocido" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/sap-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
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
async function handleRadarUpload(supabase: any, rows: ParsedSapRadarRow[], batchId: string) {
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
  let staleSkipped = 0;
  for (const [key, r] of byKey) {
    const existing = existingByKey.get(key);
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

  return Response.json({
    format: "radar",
    inserted: toInsert.length,
    updated: toUpdate.length,
    stale_skipped: staleSkipped,
    clientes_fuera_cartera: clientesFueraCartera,
    locations_upserted: locationsUpdated,
  });
}

// ── Reporte "Pedidos y Facturado" (Panquecitas): Pedido/Entregado/Facturado ─
// Una sola fila trae tanto lo ya facturado (→ sap_sell_in_records, volumen
// facturado) como lo pedido (→ sap_pending_orders, guardando solo lo que
// falta por facturar: Pedido − Facturado). Es un reporte diario (una fila
// por cliente+material+fecha), así que a diferencia del Radar (acumulado
// mensual) aquí una fila repetida sí es un duplicado real y se descarta.
// Estos volúmenes alimentan solo las métricas de volumen facturado/pedido —
// NO determinan el universo de clientes reales (eso lo hace Carga Radar
// cruzado con la Cartera de Clientes), porque este reporte trae
// distribuidoras intermediarias que no son puntos de venta finales.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFacturacionUpload(supabase: any, rows: ParsedSapFacturacionRow[], batchId: string) {
  // ── 1. Resolver clientes contra la cartera ya cargada (no se crean nuevos) ──
  const uniqueByCode = new Map<string, ParsedSapFacturacionRow>();
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

  // ── 2. Resolver product_id + variant_id por material y separar
  // facturado/pendiente. variant_id es lo que alimenta el Mix de Producto
  // de DIENN (cantidad facturada por presentación 400g/800g).
  const unknownMaterials = new Set<string>();
  const sellInRows: {
    uploaded_by: null;
    upload_batch_id: string;
    location_id: string;
    product_id: string;
    variant_id: string | null;
    quantity_kg: number;
    date_of_sale: string;
  }[] = [];
  const pendingRows: {
    upload_batch_id: string;
    location_id: string;
    product_id: string;
    variant_id: string | null;
    quantity: number;
    order_date: string;
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

    if (row.cantidad_facturada_kg > 0) {
      sellInRows.push({
        uploaded_by: null,
        upload_batch_id: batchId,
        location_id,
        product_id,
        variant_id,
        quantity_kg: row.cantidad_facturada_kg,
        date_of_sale: row.fecha,
      });
    }

    // Solo lo que falta por facturar — si ya se facturó todo el pedido, no
    // vuelve a aparecer como pendiente (ver pregunta al usuario, confirmada).
    // Pedida total = Facturada + Pendiente (misma fecha y presentación),
    // que es lo que usa la gráfica Pedido vs Ventas de DIENN.
    const pendiente = row.cantidad_pedido_kg - row.cantidad_facturada_kg;
    if (pendiente > 0) {
      pendingRows.push({
        upload_batch_id: batchId,
        location_id,
        product_id,
        variant_id,
        quantity: pendiente,
        order_date: row.fecha,
      });
    }
  }

  if (unknownMaterials.size > 0) {
    return Response.json({
      error: `Materiales SAP no mapeados: ${[...unknownMaterials].join(", ")}. Actualiza SAP_MATERIAL_PRODUCT_MAP en catalog.ts.`,
    }, { status: 422 });
  }

  // ── 3. Descartar filas ya cargadas (mismo cliente + fecha + material) ──
  const allLocationIds = [
    ...new Set([...sellInRows.map((r) => r.location_id), ...pendingRows.map((r) => r.location_id)]),
  ];
  const [existingSellInKeys, existingPendingKeys] = await Promise.all([
    fetchExistingRecords(
      supabase,
      "sap_sell_in_records",
      "date_of_sale",
      allLocationIds,
      [...new Set(sellInRows.map((r) => r.date_of_sale))]
    ),
    fetchExistingRecords(
      supabase,
      "sap_pending_orders",
      "order_date",
      allLocationIds,
      [...new Set(pendingRows.map((r) => r.order_date))]
    ),
  ]);

  const seenSellIn = new Set<string>();
  const newSellInRows = sellInRows.filter((r) => {
    const key = dedupeKey(r.location_id, r.product_id, r.variant_id, r.date_of_sale);
    if (existingSellInKeys.has(key) || seenSellIn.has(key)) return false;
    seenSellIn.add(key);
    return true;
  });

  const seenPending = new Set<string>();
  const newPendingRows = pendingRows.filter((r) => {
    const key = dedupeKey(r.location_id, r.product_id, r.variant_id, r.order_date);
    if (existingPendingKeys.has(key) || seenPending.has(key)) return false;
    seenPending.add(key);
    return true;
  });

  // ── 4. Insert ────────────────────────────────────────────────────────────
  if (newSellInRows.length > 0) {
    const { error } = await supabase.from("sap_sell_in_records").insert(newSellInRows);
    if (error) throw error;
  }
  if (newPendingRows.length > 0) {
    const { error } = await supabase.from("sap_pending_orders").insert(newPendingRows);
    if (error) throw error;
  }

  return Response.json({
    format: "facturacion",
    locations_upserted: locationsUpdated,
    ventas_inserted: newSellInRows.length,
    pendientes_inserted: newPendingRows.length,
    duplicates_skipped: (sellInRows.length - newSellInRows.length) + (pendingRows.length - newPendingRows.length),
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [sellInResult, pendingResult] = await Promise.all([
      (supabase as any).from("sap_sell_in_records").delete().eq("upload_batch_id", batchId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("sap_pending_orders").delete().eq("upload_batch_id", batchId),
    ]);

    if (sellInResult.error) throw sellInResult.error;
    if (pendingResult.error) throw pendingResult.error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/sap-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
