import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { SAP_CATEGORY_MAP } from "@/data/catalog";
import type { ParsedSapRow } from "@/types";

export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = await req.json() as { rows: ParsedSapRow[]; batchId: string };
    const { rows, batchId } = body;
    if (!rows?.length || !batchId) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: upsertedLocs, error: locError } = await (supabase as any)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from("sap_sell_in_records")
      .insert(sellInRecords);

    if (insertError) throw insertError;

    return Response.json({
      inserted: sellInRecords.length,
      locations_upserted: locationsToUpsert.length,
    });
  } catch (error) {
    console.error("[POST /api/sap-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
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
    const { error } = await (supabase as any)
      .from("sap_sell_in_records")
      .delete()
      .eq("upload_batch_id", batchId);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/sap-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
