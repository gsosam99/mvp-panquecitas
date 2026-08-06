import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { SAP_CATEGORY_MAP, SAP_MATERIAL_PRODUCT_MAP, SAP_MATERIAL_VARIANT_MAP } from "@/data/catalog";
import { mapLocationType } from "@/lib/excel-parser";
import type { ParsedSapRow, ParsedSapFacturacionRow } from "@/types";

type SapUploadBody =
  // Reporte mensual N7_V_SD88_WEB_001 (Harina Pan, columnas KGL por mes).
  | { format?: "monthly"; rows: ParsedSapRow[]; batchId: string }
  // Reporte N7_V_SD83_WEB_001 (Panquecitas, Cantidad Pedido/Facturada).
  | { format: "facturacion"; rows: ParsedSapFacturacionRow[]; batchId: string };

// Misma fila (cliente + fecha + producto/presentación) ya cargada en un batch
// anterior → se descarta en vez de duplicar el KG. null se normaliza a un
// string fijo porque el reporte mensual nunca trae variant_id.
function dedupeKey(location_id: string, product_id: string, variant_id: string | null | undefined, date: string) {
  return `${location_id}|${product_id}|${variant_id ?? "null"}|${date}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchExistingKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  dateColumn: string,
  locationIds: string[],
  dates: string[]
) {
  if (!locationIds.length || !dates.length) return new Set<string>();
  const { data, error } = await supabase
    .from(table)
    .select(`location_id, product_id, variant_id, ${dateColumn}`)
    .in("location_id", locationIds)
    .in(dateColumn, dates);
  if (error) throw error;
  return new Set(
    (data as { location_id: string; product_id: string; variant_id: string | null }[]).map((r) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dedupeKey(r.location_id, r.product_id, r.variant_id, (r as any)[dateColumn])
    )
  );
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
    return await handleMonthlyUpload(supabase, body.rows, body.batchId);
  } catch (error) {
    console.error("[POST /api/sap-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// ── Reporte mensual (Harina Pan) ────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMonthlyUpload(supabase: any, rows: ParsedSapRow[], batchId: string) {
  // ── 1. Upsert locations desde el Excel ──────────────────────────────────
  const uniqueClients = new Map<string, { name: string; type: string; region: string; address: string }>();
  for (const row of rows) {
    if (!uniqueClients.has(row.sap_code)) {
      uniqueClients.set(row.sap_code, {
        name: row.client_name,
        type: row.client_type,
        region: row.region,
        address: row.city,
      });
    }
  }

  const locationsToUpsert = Array.from(uniqueClients.entries()).map(([sap_code, data]) => ({
    sap_code,
    name: data.name,
    type: data.type,
    region: data.region,
    address: data.address,
  }));

  const { data: upsertedLocs, error: locError } = await supabase
    .from("locations")
    .upsert(locationsToUpsert, { onConflict: "sap_code", ignoreDuplicates: false })
    .select("id, sap_code");

  if (locError) throw locError;

  const locationMap = Object.fromEntries(
    (upsertedLocs as { id: string; sap_code: string }[]).map((l) => [l.sap_code, l.id])
  );

  // ── 2. Resolver product_id por categoría ────────────────────────────────
  const unknownCategories = new Set<string>();
  const sellInRecords = rows.flatMap((row) => {
    const location_id = locationMap[row.sap_code];
    const product_id = SAP_CATEGORY_MAP[row.category];
    if (!location_id || !product_id) {
      if (!product_id) unknownCategories.add(row.category);
      return [];
    }
    return [{
      uploaded_by: null,
      upload_batch_id: batchId,
      location_id,
      product_id,
      quantity_kg: row.quantity_kg,
      date_of_sale: row.date_of_sale,
    }];
  });

  if (unknownCategories.size > 0) {
    return Response.json({
      error: `Categorías de producto no mapeadas: ${[...unknownCategories].join(", ")}. Actualiza SAP_CATEGORY_MAP en catalog.ts.`,
    }, { status: 422 });
  }

  // ── 3. Descartar filas ya cargadas (mismo cliente + fecha + producto) ──
  const existingKeys = await fetchExistingKeys(
    supabase,
    "sap_sell_in_records",
    "date_of_sale",
    [...new Set(sellInRecords.map((r) => r.location_id))],
    [...new Set(sellInRecords.map((r) => r.date_of_sale))]
  );
  const seenInBatch = new Set<string>();
  const newSellInRecords = sellInRecords.filter((r) => {
    const key = dedupeKey(r.location_id, r.product_id, null, r.date_of_sale);
    if (existingKeys.has(key) || seenInBatch.has(key)) return false;
    seenInBatch.add(key);
    return true;
  });
  const duplicates = sellInRecords.length - newSellInRecords.length;

  // ── 4. Insert sell-in records ────────────────────────────────────────────
  if (newSellInRecords.length > 0) {
    const { error: insertError } = await supabase.from("sap_sell_in_records").insert(newSellInRecords);
    if (insertError) throw insertError;
  }

  return Response.json({
    format: "monthly",
    inserted: newSellInRecords.length,
    duplicates_skipped: duplicates,
    locations_upserted: locationsToUpsert.length,
  });
}

// ── Reporte N7_V_SD83_WEB_001 (Panquecitas): Pedido/Entregado/Facturado ────
// Una sola fila trae tanto lo ya facturado (→ sap_sell_in_records, volumen
// real vendido/entregado) como lo pedido (→ sap_pending_orders, guardando
// solo lo que falta por facturar: Pedido − Facturado). Ver decisión en el
// chat con Alejandro (05-08-2026): un solo botón de carga llena ambas
// tablas porque el reporte real ya trae las dos cifras juntas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFacturacionUpload(supabase: any, rows: ParsedSapFacturacionRow[], batchId: string) {
  // ── 1. Upsert locations (solo columnas que trae este reporte) ──────────
  const uniqueByCode = new Map<string, ParsedSapFacturacionRow>();
  for (const row of rows) uniqueByCode.set(row.sap_code, row);

  const locationsToUpsert = Array.from(uniqueByCode.values()).map((row) => ({
    sap_code: row.sap_code,
    name: row.client_name,
    type: mapLocationType(row.tipo_cliente),
    tipo_cliente: row.tipo_cliente || null,
    esquema_atencion: row.esquema_atencion || null,
    grupo_vendedor: row.grupo_vendedor || null,
    region: row.region || null,
    oficina_venta: row.oficina_venta || null,
    zona_venta: row.zona_venta || null,
  }));

  const { data: upsertedLocs, error: locError } = await supabase
    .from("locations")
    .upsert(locationsToUpsert, { onConflict: "sap_code", ignoreDuplicates: false })
    .select("id, sap_code");

  if (locError) throw locError;

  const locationIdByCode = new Map(
    (upsertedLocs as { id: string; sap_code: string }[]).map((l) => [l.sap_code, l.id])
  );

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
    const location_id = locationIdByCode.get(row.sap_code);
    if (!location_id) continue; // no debería pasar: se acaba de upsertar por el mismo sap_code

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
    fetchExistingKeys(
      supabase,
      "sap_sell_in_records",
      "date_of_sale",
      allLocationIds,
      [...new Set(sellInRows.map((r) => r.date_of_sale))]
    ),
    fetchExistingKeys(
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
    locations_upserted: locationsToUpsert.length,
    ventas_inserted: newSellInRows.length,
    pendientes_inserted: newPendingRows.length,
    duplicates_skipped: (sellInRows.length - newSellInRows.length) + (pendingRows.length - newPendingRows.length),
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
