import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getDashboardSession } from "@/lib/session";
import { PRODUCT_IDS, SAP_RADAR_MATERIAL_PRODUCT_MAP } from "@/data/catalog";
import { esCiudadCompleta } from "@/lib/bqto-completo";

// ── Ciudades completas: Harina PAN de 3 meses ─────────────────────────
// Mismo reporte Radar que "Radar 3 Meses", pero de TODA una ciudad
// (Barquisimeto o Cumaná, campo `ciudad`) y a su propia tabla (bqto_3m_ventas,
// migrations 025 y 026). No se cruza con la cartera ni toca ninguna tabla del
// piloto: solo alimenta la página /bqto-completo.
//
// Las filas se guardan tal cual (cliente + material + día, con la venta de ese
// día): el total es la suma de las filas, como en el ratio 3M del dashboard.
//
// Cada carga REEMPLAZA la anterior DE SU CIUDAD; la otra no se toca. Llega en
// tandas (el archivo pasa el límite de tamaño de Vercel); el borrado de lo
// viejo corre solo en la última.

interface FilaCarga {
  sap_code: string;
  client_name: string;
  tipo_cliente: string;
  esquema_atencion: string;
  oficina_venta: string;
  material_code: string;
  fecha: string;
  quantity_kg: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

export async function POST(req: Request) {
  try {
    const session = await getDashboardSession();
    if (!session || session.role !== "DIENN") {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json()) as {
      rows?: FilaCarga[];
      batchId?: string;
      ciudad?: string;
      finalizar?: boolean;
    };
    const { rows, batchId, ciudad, finalizar = true } = body;
    // batchId viaja dentro del filtro .or() del borrado: se exige un UUID.
    if (!rows?.length || !batchId || !UUID_RE.test(batchId) || !esCiudadCompleta(ciudad)) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // Solo Harina PAN. Un material de otra categoría (o desconocido) frena la
    // carga en vez de sumarse en silencio al volumen.
    const otrosMateriales = new Set<string>();
    for (const r of rows) {
      if (SAP_RADAR_MATERIAL_PRODUCT_MAP[r.material_code] !== PRODUCT_IDS.HARINA_PAN) {
        otrosMateriales.add(r.material_code);
      }
    }
    if (otrosMateriales.size > 0) {
      return Response.json(
        {
          error: `El archivo trae materiales que no son Harina PAN: ${[...otrosMateriales].join(", ")}. Este módulo espera solo el Radar de Harina PAN.`,
        },
        { status: 422 }
      );
    }

    // Una fila en cero no es un movimiento. Las negativas se guardan: son
    // devoluciones y restan, igual que en la Carga Radar.
    const porLlave = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      if (!r.quantity_kg) continue;
      const sap_code = r.sap_code.trim();
      porLlave.set(`${sap_code}|${r.material_code}|${r.fecha}`, {
        ciudad,
        sap_code,
        client_name: r.client_name || null,
        tipo_cliente: r.tipo_cliente || null,
        esquema_atencion: r.esquema_atencion || null,
        oficina_venta: r.oficina_venta || null,
        material_code: r.material_code,
        quantity_kg: r.quantity_kg,
        date_of_sale: r.fecha,
        upload_batch_id: batchId,
      });
    }
    const toInsert = [...porLlave.values()];

    const supabase = createSupabaseServiceClient();
    const TANDA_FILAS = 500;
    for (let i = 0; i < toInsert.length; i += TANDA_FILAS) {
      const { error } = await supabase
        .from("bqto_3m_ventas")
        .upsert(toInsert.slice(i, i + TANDA_FILAS), {
          onConflict: "ciudad,sap_code,material_code,date_of_sale",
          ignoreDuplicates: false,
        });
      if (error) throw error;
    }

    let reemplazadas = 0;
    if (finalizar) {
      const { data: borradas, error } = await supabase
        .from("bqto_3m_ventas")
        .delete()
        .eq("ciudad", ciudad)
        .or(`upload_batch_id.is.null,upload_batch_id.neq.${batchId}`)
        .select("id");
      if (error) throw error;
      reemplazadas = (borradas ?? []).length;
    }

    return Response.json({
      inserted: toInsert.length,
      reemplazadas,
      total_kg: toInsert.reduce((s, r) => s + Number(r.quantity_kg), 0),
    });
  } catch (error) {
    console.error("[POST /api/bqto-3m-upload]", error);
    return Response.json({ error: "Error interno del servidor", detail: errorDetail(error) }, { status: 500 });
  }
}
