import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { sectorGroup } from "@/lib/sectors";
import type { ParsedCarteraRow } from "@/types";

// Carga/actualización de la cartera de clientes: agrega/actualiza
// oficina_venta, tipo_cliente, centro_poblado, municipio y region por
// sap_code (upsert). No toca sap_sell_in_records — eso sigue siendo
// responsabilidad de "Carga SAP" (reporte de ventas mensual).
//
// Nota importante: este upsert NO incluye las columnas que ya administra
// el reporte de ventas (ver Carga SAP), así que cargar el reporte mensual
// después de esto no pisa oficina_venta/tipo_cliente/centro_poblado.
export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = (await req.json()) as { rows: ParsedCarteraRow[] };
    const { rows } = body;
    if (!rows?.length) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const uniqueByCode = new Map<string, ParsedCarteraRow>();
    for (const row of rows) uniqueByCode.set(row.sap_code, row);

    const locationsToUpsert = Array.from(uniqueByCode.values()).map((row) => ({
      sap_code: row.sap_code,
      name: row.name,
      type: row.type,
      tipo_cliente: row.tipo_cliente || null,
      oficina_venta: row.oficina_venta || null,
      centro_poblado: row.centro_poblado || null,
      municipio: row.municipio || null,
      region: row.region || null,
      asesor_encargado: row.asesor_encargado || null,
      fuente_sell_out: row.fuente_sell_out ?? "Calculado",
    }));

    const { data: upserted, error } = await supabase
      .from("locations")
      .upsert(locationsToUpsert, { onConflict: "sap_code", ignoreDuplicates: false })
      .select("id");

    if (error) throw error;

    // Diagnóstico: cuántas de las filas subidas no calzan con ningún sector
    // conocido (Cumaná / Barquisimeto Este) — si esto es alto, el filtro de
    // campo/DIENN por sector no va a encontrar esos PDV aunque la carga en
    // sí haya sido exitosa. Ver bug reportado: "dice que la carga fue
    // exitosa pero los perfiles de campo no ven la lista".
    const sinSector = locationsToUpsert.filter((l) => sectorGroup(l.oficina_venta) === null).length;

    return Response.json({ locations_upserted: (upserted ?? []).length, sin_sector: sinSector });
  } catch (error) {
    console.error("[POST /api/cartera-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
