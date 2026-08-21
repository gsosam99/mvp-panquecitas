import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import { sectorGroup } from "@/lib/sectors";
import { COHORTES, cohorteParaClienteNuevo } from "@/lib/cohortes";
import type { ParsedCarteraRow } from "@/types";

// Carga/actualización de la cartera de clientes: agrega/actualiza
// oficina_venta, tipo_cliente, centro_poblado, municipio y region por
// sap_code (upsert). No toca sap_sell_in_records — eso sigue siendo
// responsabilidad de "Carga SAP" (reporte de ventas mensual).
//
// Nota importante: este upsert NO incluye las columnas que ya administra
// el reporte de ventas (ver Carga SAP), así que cargar el reporte mensual
// después de esto no pisa oficina_venta/tipo_cliente/centro_poblado.

/** Nombre de la tanda cuya fecha de arranque coincide con `fecha`. */
function cohortePorFecha(fecha: string): string | null {
  return COHORTES.find((c) => c.desde === fecha)?.nombre ?? null;
}

/**
 * sap_code → fecha/cohorte que YA tiene registrada cada cliente. Paginado
 * porque `locations` supera el tope de 1000 filas de PostgREST: sin paginar,
 * los clientes de las páginas siguientes se verían como "nuevos" y se les
 * reasignaría una cohorte equivocada.
 */
async function getCohortesRegistradas(
  supabase: ReturnType<typeof createSupabaseServiceClient>
): Promise<Map<string, { fecha: string | null; cohorte: string | null }>> {
  const PAGINA = 1000;
  const out = new Map<string, { fecha: string | null; cohorte: string | null }>();

  for (let desde = 0; ; desde += PAGINA) {
    const { data } = await supabase
      .from("locations")
      .select("sap_code, fecha_incorporacion, cohorte")
      .order("sap_code", { ascending: true })
      .range(desde, desde + PAGINA - 1);

    const pagina = (data ?? []) as {
      sap_code: string;
      fecha_incorporacion: string | null;
      cohorte: string | null;
    }[];
    if (pagina.length === 0) break;

    for (const r of pagina) {
      out.set(r.sap_code.trim(), {
        fecha: r.fecha_incorporacion ? r.fecha_incorporacion.slice(0, 10) : null,
        cohorte: r.cohorte,
      });
    }
    if (pagina.length < PAGINA) break;
  }

  return out;
}

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

    // ── Guarda de orden: el migration 020 tiene que haber corrido ────
    // Ese migration es el que estampa a los clientes que YA están con la
    // fecha del piloto original (03-08-2026). Si se carga el archivo
    // consolidado antes, los 358 originales y las tandas nuevas quedan
    // indistinguibles y no hay forma de reconstruir quién estaba desde
    // cuándo — se pierde la historia de forma irreversible. Mejor rechazar
    // la carga que aceptarla mal.
    const probe = await supabase.from("locations").select("fecha_incorporacion").limit(1);
    if (probe.error) {
      return Response.json(
        {
          error:
            "Falta correr el migration 020_fecha_incorporacion.sql antes de cargar la cartera. " +
            "Ese paso marca a los clientes actuales como el piloto original; si se carga el " +
            "archivo primero, las tandas nuevas se mezclan con los originales y no se pueden separar.",
        },
        { status: 409 }
      );
    }

    const uniqueByCode = new Map<string, ParsedCarteraRow>();
    for (const row of rows) uniqueByCode.set(row.sap_code, row);

    // ── Asignación de cohorte ────────────────────────────────────────
    // Un cliente que ya tiene fecha NUNCA se recalcula: volver a cargar el
    // mismo archivo tiene que ser idempotente, o cada carga reescribiría la
    // historia y movería los indicadores de meses cerrados. Los nuevos la
    // reciben por la regla de grupo vendedor (ver src/lib/cohortes.ts).
    // La columna de fecha del archivo, si existe, es un override explícito
    // y sí pisa lo registrado — pero se reporta abajo para que el cambio
    // nunca pase inadvertido.
    const registradas = await getCohortesRegistradas(supabase);
    const nuevosPorCohorte = new Map<string, number>();
    let fechasSobrescritas = 0;

    const locationsToUpsert = Array.from(uniqueByCode.values()).map((row) => {
      const registrada = registradas.get(row.sap_code.trim());

      let fecha_incorporacion: string;
      let cohorte: string | null;

      if (row.fecha_incorporacion) {
        fecha_incorporacion = row.fecha_incorporacion;
        cohorte = cohortePorFecha(fecha_incorporacion) ?? registrada?.cohorte ?? null;
        if (registrada?.fecha && registrada.fecha !== fecha_incorporacion) fechasSobrescritas += 1;
      } else if (registrada?.fecha) {
        fecha_incorporacion = registrada.fecha;
        cohorte = registrada.cohorte ?? cohortePorFecha(fecha_incorporacion);
      } else {
        const tanda = cohorteParaClienteNuevo(row.grupo_vendedor);
        fecha_incorporacion = tanda.desde;
        cohorte = tanda.nombre;
        nuevosPorCohorte.set(tanda.nombre, (nuevosPorCohorte.get(tanda.nombre) ?? 0) + 1);
      }

      return {
        sap_code: row.sap_code,
        name: row.name,
        type: row.type,
        tipo_cliente: row.tipo_cliente || null,
        segmento_cliente: row.segmento_cliente || null,
        oficina_venta: row.oficina_venta || null,
        centro_poblado: row.centro_poblado || null,
        municipio: row.municipio || null,
        region: row.region || null,
        grupo_vendedor: row.grupo_vendedor || null,
        asesor_encargado: row.asesor_encargado || null,
        fuente_sell_out: row.fuente_sell_out ?? "Calculado",
        esquema_atencion: row.esquema_atencion || null,
        fecha_incorporacion,
        cohorte,
      };
    });

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
    // Cuántas filas trajeron "Segmento de Clientes 2": si es 0, el archivo no
    // tiene esa columna y el ranking por segmento va a salir vacío.
    const conSegmento = locationsToUpsert.filter((l) => l.segmento_cliente !== null).length;

    return Response.json({
      locations_upserted: (upserted ?? []).length,
      sin_sector: sinSector,
      con_segmento: conSegmento,
      // Clientes NUEVOS por tanda de incorporación. Es la cifra a revisar
      // después de cargar: si "Indirecto Cumaná" sale en 0, el archivo no
      // trae los grupos vendedores U27/U28 y esos PDV entrarían con la
      // fecha equivocada.
      nuevos_por_cohorte: Object.fromEntries(nuevosPorCohorte),
      fechas_sobrescritas: fechasSobrescritas,
    });
  } catch (error) {
    console.error("[POST /api/cartera-upload]", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
