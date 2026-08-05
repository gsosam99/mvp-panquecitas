import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { SAP_CATEGORY_MAP, SAP_MATERIAL_PRODUCT_MAP } from "@/data/catalog";
import { mapLocationType } from "@/lib/excel-parser";
import type { ParsedSapRow, ParsedSapFacturacionRow } from "@/types";

type SapUploadBody =
  // Reporte mensual N7_V_SD88_WEB_001 (Harina Pan, columnas KGL por mes).
  | { format?: "monthly"; rows: ParsedSapRow[]; batchId: string }
  // Reporte N7_V_SD83_WEB_001 (Panquecitas, Cantidad Pedido/Facturada).
  | { format: "facturacion"; rows: ParsedSapFacturacionRow[]; batchId: string };

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

  // ── 3. Insert sell-in records ────────────────────────────────────────────
  const { error: insertError } = await supabase.from("sap_sell_in_records").insert(sellInRecords);
  if (insertError) throw insertError;

  return Response.json({
    format: "monthly",
    inserted: sellInRecords.length,
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

  // ── 2. Resolver product_id por material y separar facturado/pendiente ──
  const unknownMaterials = new Set<string>();
  const sellInRows: {
    uploaded_by: null;
    upload_batch_id: string;
    location_id: string;
    product_id: string;
    quantity_kg: number;
    date_of_sale: string;
  }[] = [];
  const pendingRows: {
    upload_batch_id: string;
    location_id: string;
    product_id: string;
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

    if (row.cantidad_facturada_kg > 0) {
      sellInRows.push({
        uploaded_by: null,
        upload_batch_id: batchId,
        location_id,
        product_id,
        quantity_kg: row.cantidad_facturada_kg,
        date_of_sale: row.fecha,
      });
    }

    // Solo lo que falta por facturar — si ya se facturó todo el pedido, no
    // vuelve a aparecer como pendiente (ver pregunta al usuario, confirmada).
    const pendiente = row.cantidad_pedido_kg - row.cantidad_facturada_kg;
    if (pendiente > 0) {
      pendingRows.push({
        upload_batch_id: batchId,
        location_id,
        product_id,
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

  if (sellInRows.length > 0) {
    const { error } = await supabase.from("sap_sell_in_records").insert(sellInRows);
    if (error) throw error;
  }
  if (pendingRows.length > 0) {
    const { error } = await supabase.from("sap_pending_orders").insert(pendingRows);
    if (error) throw error;
  }

  return Response.json({
    format: "facturacion",
    locations_upserted: locationsToUpsert.length,
    ventas_inserted: sellInRows.length,
    pendientes_inserted: pendingRows.length,
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
