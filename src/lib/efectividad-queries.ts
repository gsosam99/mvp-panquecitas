import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { MotivoNoVentaTipo } from "@/types";

// Lectura de los motivos de no venta ya cargados y clasificados
// (sap_motivos_no_venta). El cruce geográfico se resuelve aquí con un join a
// locations: "ciudad" = centro_poblado (Cabudare / Cumaná / …), con
// municipio y region como respaldo/columnas extra.

export interface MotivoNoVentaRow {
  id: string;
  tipo: MotivoNoVentaTipo;
  sapCode: string;
  clientName: string | null;
  ciudad: string | null;
  municipio: string | null;
  region: string | null;
  materialName: string | null;
  motivo: string;
  efectividadVisita: number | null;
}

type LocRel = { centro_poblado: string | null; municipio: string | null; region: string | null };

type RawRow = {
  id: string;
  tipo: MotivoNoVentaTipo;
  sap_code: string;
  client_name: string | null;
  material_name: string | null;
  justificacion: string;
  efectividad_visita: number | string | null;
  locations: LocRel | LocRel[] | null;
};

/** Solo los motivos de NO venta (No Activación / No Recompra) para las dos listas. */
export async function getMotivosNoVenta(): Promise<MotivoNoVentaRow[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sap_motivos_no_venta")
    .select(
      "id, tipo, sap_code, client_name, material_name, justificacion, efectividad_visita, locations(centro_poblado, municipio, region)"
    )
    .in("tipo", ["NO_ACTIVACION", "NO_RECOMPRA"])
    .order("client_name", { ascending: true });

  if (error) {
    console.error("[getMotivosNoVenta]", error);
    return [];
  }

  return ((data ?? []) as RawRow[]).map((r) => {
    // La relación location_id → locations es 1-a-1, pero supabase-js a veces
    // la tipa como array; se normaliza a un solo objeto.
    const loc = Array.isArray(r.locations) ? r.locations[0] ?? null : r.locations;
    const ef = r.efectividad_visita;
    return {
      id: r.id,
      tipo: r.tipo,
      sapCode: r.sap_code,
      clientName: r.client_name,
      ciudad: loc?.centro_poblado ?? loc?.municipio ?? loc?.region ?? null,
      municipio: loc?.municipio ?? null,
      region: loc?.region ?? null,
      materialName: r.material_name,
      motivo: r.justificacion,
      efectividadVisita: ef === null || ef === undefined ? null : Number(ef),
    };
  });
}
