import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSapExcel } from "@/lib/excel-parser";
import { SAP_VARIANT_NAME_MAP } from "@/data/catalog";
import type { ParsedSapRow } from "@/types";
import type { Database } from "@/types/supabase";

type SapInsertRow = Database["public"]["Tables"]["sap_sell_in_records"]["Insert"];

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json() as { rows: ParsedSapRow[]; batchId: string };
    const { rows, batchId } = body;

    if (!rows?.length || !batchId) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // Cargar mapa de sap_code → location_id desde la BD
    const { data: locations, error: locError } = await supabase
      .from("locations")
      .select("id, sap_code");

    if (locError) throw locError;

    const locationMap = Object.fromEntries(
      (locations ?? []).map((l) => {
        const loc = l as { id: string; sap_code: string };
        return [loc.sap_code, loc.id];
      })
    );

    // Enriquecer filas con IDs reales
    const enriched = rows.map((row) => {
      const location_id = locationMap[row.sap_code];
      const variant_id = SAP_VARIANT_NAME_MAP[row.variant_name.toUpperCase()];
      return { ...row, location_id, variant_id };
    });

    const unmappedLocations = enriched.filter((r) => !r.location_id).map((r) => r.sap_code);
    const unmappedVariants = enriched.filter((r) => !r.variant_id).map((r) => r.variant_name);

    if (unmappedLocations.length > 0 || unmappedVariants.length > 0) {
      return Response.json({
        error: "Códigos no mapeados",
        unmappedLocations: [...new Set(unmappedLocations)],
        unmappedVariants: [...new Set(unmappedVariants)],
      }, { status: 422 });
    }

    const records: SapInsertRow[] = enriched.map((row) => ({
      uploaded_by: user.id,
      upload_batch_id: batchId,
      location_id: row.location_id!,
      variant_id: row.variant_id!,
      quantity_units: row.quantity,
      date_of_sale: row.date_of_sale,
    }));

    // Cast needed until real types are generated with `supabase gen types typescript`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from("sap_sell_in_records")
      .insert(records);

    if (insertError) throw insertError;

    return Response.json({ inserted: records.length });
  } catch (error) {
    console.error("[POST /api/sap-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

    const { batchId } = await req.json() as { batchId: string };
    if (!batchId) return Response.json({ error: "batchId requerido" }, { status: 400 });

    const { error } = await supabase
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

export { parseSapExcel };
