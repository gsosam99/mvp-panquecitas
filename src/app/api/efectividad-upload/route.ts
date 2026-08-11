import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import type { MotivoNoVentaTipo, ParsedSapEfectividadRow } from "@/types";

// Carga del reporte SAP N7_V_SD85 (Efectividad de Visita / Motivos de No
// Venta) → tabla sap_motivos_no_venta. El parseo del MHTML ocurre en el
// cliente (ver EfectividadDropzone); aquí llegan las filas ya parseadas más
// la fecha del reporte (el reporte no trae fecha) y el batchId.
//
// Clasificación por historial del cliente (decisión con Alejandro,
// 11-08-2026): una fila que NO es "Venta Efectiva" se marca como
// NO_RECOMPRA si el cliente ya facturó alguna vez (sap_pedidos_facturados
// con cantidad_facturada > 0) o NO_ACTIVACION si nunca facturó. Las filas de
// "Venta Efectiva" se guardan como VENTA_EFECTIVA (no son motivo de no
// venta, pero alimentan la efectividad de visita).

interface EfectividadUploadBody {
  rows: ParsedSapEfectividadRow[];
  batchId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorDetail(error: any): string {
  if (error && typeof error === "object") {
    const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  return String(error);
}

function classify(
  justificacion: string,
  locationId: string | null,
  facturadoSet: Set<string>
): MotivoNoVentaTipo {
  if (justificacion.toLowerCase().includes("venta efectiva")) return "VENTA_EFECTIVA";
  return locationId && facturadoSet.has(locationId) ? "NO_RECOMPRA" : "NO_ACTIVACION";
}

export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = (await req.json()) as EfectividadUploadBody;
    const { rows, batchId } = body ?? {};
    if (!rows?.length || !batchId) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // ── 1. Resolver clientes contra la cartera (por sap_code). No se crean
    // clientes nuevos: si no está en la cartera, la fila igual se guarda con
    // location_id null (y sin ubicación), pero cuenta como No Activación
    // porque nunca pudo haber facturado. ──
    const uniqueCodes = [...new Set(rows.map((r) => r.sap_code))];
    const knownLocationIds = new Map<string, string>();
    if (uniqueCodes.length > 0) {
      const { data: locs, error: locError } = await supabase
        .from("locations")
        .select("id, sap_code")
        .in("sap_code", uniqueCodes);
      if (locError) throw locError;
      for (const l of (locs ?? []) as { id: string; sap_code: string }[]) {
        knownLocationIds.set(l.sap_code, l.id);
      }
    }

    // ── 2. Historial de facturación: set de location_id que alguna vez
    // facturó (cantidad_facturada_kg > 0). Define No Recompra vs No
    // Activación. ──
    const { data: facturado, error: factError } = await supabase
      .from("sap_pedidos_facturados")
      .select("location_id")
      .gt("cantidad_facturada_kg", 0);
    if (factError) throw factError;
    const facturadoSet = new Set(
      ((facturado ?? []) as { location_id: string }[]).map((r) => r.location_id)
    );

    // ── 3. Clasificar y armar los registros ──
    let noActivacion = 0;
    let noRecompra = 0;
    let ventaEfectiva = 0;
    let sinCartera = 0;

    const records = rows.map((row) => {
      const locationId = knownLocationIds.get(row.sap_code) ?? null;
      if (!locationId) sinCartera++;
      const tipo = classify(row.justificacion, locationId, facturadoSet);
      if (tipo === "NO_ACTIVACION") noActivacion++;
      else if (tipo === "NO_RECOMPRA") noRecompra++;
      else ventaEfectiva++;

      return {
        upload_batch_id: batchId,
        location_id: locationId,
        sap_code: row.sap_code,
        client_name: row.client_name || null,
        material_name: row.material_name || null,
        justificacion: row.justificacion,
        tipo,
        efectividad_visita: row.efectividad_visita,
        efectividad_pedidos: row.efectividad_pedidos,
        efectividad_ventas: row.efectividad_ventas,
      };
    });

    // ── 4. Reemplazo total: cada carga sustituye por completo la anterior
    // (la tabla siempre refleja el último reporte montado, sin acumular ni
    // duplicar). Se borra todo y se inserta lo nuevo. El filtro neq contra el
    // UUID nulo hace que el delete afecte todas las filas (supabase exige un
    // filtro en delete). ──
    const { error: delError } = await supabase
      .from("sap_motivos_no_venta")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (delError) throw delError;

    const { error: insertError } = await supabase.from("sap_motivos_no_venta").insert(records);
    if (insertError) throw insertError;

    return Response.json({
      inserted: records.length,
      no_activacion: noActivacion,
      no_recompra: noRecompra,
      venta_efectiva: ventaEfectiva,
      clientes_sin_cartera: sinCartera,
    });
  } catch (error) {
    console.error("[POST /api/efectividad-upload]", error);
    return Response.json(
      { error: "Error interno del servidor", detail: errorDetail(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const { batchId } = (await req.json()) as { batchId: string };
    if (!batchId) return Response.json({ error: "batchId requerido" }, { status: 400 });

    const { error } = await supabase.from("sap_motivos_no_venta").delete().eq("upload_batch_id", batchId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/efectividad-upload]", error);
    return Response.json(
      { error: "Error interno del servidor", detail: errorDetail(error) },
      { status: 500 }
    );
  }
}
