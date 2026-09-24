import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS } from "@/data/catalog";
import { contarDiasHabiles } from "@/lib/business-days";
import { todayISO } from "@/lib/date-buckets";
import { getActivacionAjustada, type ActivacionAjustadaResult } from "@/lib/dienn-queries";
import { getUniverseLocations, sectorGroup, vigentesAl, type Sector } from "@/lib/universe";
import { DIAS_HABILES_MES, type BqtoFila, type ReferenciaActivacion } from "@/lib/bqto-completo";

// Lecturas del módulo "Barquisimeto completo" (ver src/lib/bqto-completo.ts).
// Nada de esto lo usa el Dashboard principal.

/** Las filas de la última carga. `error` trae el motivo si la tabla no se pudo leer (p. ej. falta el migration 025). */
export async function getBqto3MFilas(): Promise<{ filas: BqtoFila[]; error: string | null }> {
  const supabase = createSupabaseServiceClient();
  try {
    const filas = await fetchAllRows<BqtoFila>(() =>
      supabase.from("bqto_3m_ventas").select("sap_code, tipo_cliente, quantity_kg, date_of_sale")
    );
    return { filas, error: null };
  } catch (e) {
    console.error("[getBqto3MFilas]", e);
    const detalle = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
    return { filas: [], error: detalle };
  }
}

/**
 * La activación de hoy del piloto completo y de Cabudare, con el volumen de
 * Panquecitas por cliente activo al mes.
 *
 * La activación sale de getActivacionAjustada, la misma función de la tarjeta
 * de activación del dashboard, para que los porcentajes sean idénticos: total
 * (activos ÷ cartera) y foco / "a escala" (activos ÷ cartera sin los inactivos
 * de segmentos no vendibles).
 *
 * Los kg por cliente activo al mes cuentan a cada cliente desde SU primera
 * compra hasta el último día con Radar: dividir entre los meses del piloto
 * completo castigaría a los clientes activados tarde, que todavía no tuvieron
 * tiempo de vender.
 */
export async function getReferenciasPiloto(): Promise<ReferenciaActivacion[]> {
  const supabase = createSupabaseServiceClient();
  const [actTotal, actCabudare, universo, radar] = await Promise.all([
    getActivacionAjustada(),
    getActivacionAjustada("barquisimeto_este"),
    getUniverseLocations(),
    fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(() =>
      supabase
        .from("sap_sell_in_records")
        .select("location_id, quantity_kg, date_of_sale")
        .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    ),
  ]);

  let corte: string | null = null;
  const porCliente = new Map<string, { kg: number; primera: string | null }>();
  for (const r of radar) {
    const kg = Number(r.quantity_kg) || 0;
    const dia = r.date_of_sale.slice(0, 10);
    if (!corte || dia > corte) corte = dia;
    let c = porCliente.get(r.location_id);
    if (!c) {
      c = { kg: 0, primera: null };
      porCliente.set(r.location_id, c);
    }
    c.kg += kg;
    if (kg > 0 && (!c.primera || dia < c.primera)) c.primera = dia;
  }

  function armar(
    etiqueta: string,
    act: ActivacionAjustadaResult,
    sector?: Sector
  ): ReferenciaActivacion {
    const delSector = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
    let kgActivos = 0;
    let diasCliente = 0;
    for (const l of vigentesAl(delSector, todayISO())) {
      const c = porCliente.get(l.id);
      // "Activo" igual que la tarjeta: Radar de Panquecitas acumulado > 0.
      if (!c || c.kg <= 0 || !c.primera || !corte) continue;
      kgActivos += c.kg;
      diasCliente += contarDiasHabiles(c.primera, corte);
    }
    const mesesCliente = diasCliente / DIAS_HABILES_MES;
    return {
      etiqueta,
      cartera: act.universo,
      activos: act.activos,
      activacionPct: act.activacionPct,
      carteraFoco: act.universoAjustado,
      activacionFocoPct: act.activacionAjustadaPct,
      kgActivos,
      mesesCliente,
      kgPorActivoMes: mesesCliente > 0 ? kgActivos / mesesCliente : 0,
      corte,
    };
  }

  return [armar("Piloto total (Cumaná + Cabudare)", actTotal), armar("Cabudare", actCabudare, "barquisimeto_este")];
}
