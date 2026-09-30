import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS } from "@/data/catalog";
import { contarDiasHabiles, siguienteDiaHabil } from "@/lib/business-days";
import { todayISO } from "@/lib/date-buckets";
import { getActivacionAjustada, type ActivacionAjustadaResult } from "@/lib/dienn-queries";
import { getUniverseLocations, sectorGroup, vigentesAl, type Sector } from "@/lib/universe";
import type { ReferenciaOldSchool } from "@/lib/old-school";

// Lecturas del módulo "Old School" (ver src/lib/old-school.ts).

/** Arranque del piloto: el mismo RENDIMIENTO_DIARIO_DESDE de dienn-queries.ts. */
export const OLD_SCHOOL_DESDE = "2026-08-03";

/**
 * El perfil de hoy de Cabudare y de Cumaná piloto: activación (la misma de la
 * tarjeta del dashboard, vía getActivacionAjustada) y venta promedio diaria
 * de Panquecitas.
 *
 * Venta diaria = Radar de Panquecitas de la cartera vigente del sector desde
 * el 03-08-2026 ÷ días hábiles desde esa fecha hasta el último Radar. Una
 * venta de fin de semana se imputa al lunes siguiente, igual que en las
 * series diarias del piloto.
 */
export async function getReferenciasOldSchool(): Promise<Record<Sector, ReferenciaOldSchool>> {
  const supabase = createSupabaseServiceClient();
  const [actCabudare, actCumana, universo, radar] = await Promise.all([
    getActivacionAjustada("barquisimeto_este"),
    getActivacionAjustada("cumana"),
    getUniverseLocations(),
    fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(() =>
      supabase
        .from("sap_sell_in_records")
        .select("location_id, quantity_kg, date_of_sale")
        .eq("product_id", PRODUCT_IDS.PANQUECITAS)
        .gte("date_of_sale", OLD_SCHOOL_DESDE)
    ),
  ]);

  let corte: string | null = null;
  const kgPorCliente = new Map<string, number>();
  for (const r of radar) {
    const dia = siguienteDiaHabil(r.date_of_sale.slice(0, 10));
    if (!corte || dia > corte) corte = dia;
    kgPorCliente.set(r.location_id, (kgPorCliente.get(r.location_id) ?? 0) + (Number(r.quantity_kg) || 0));
  }
  const diasHabiles = corte ? contarDiasHabiles(OLD_SCHOOL_DESDE, corte) : 0;
  const vigentes = vigentesAl(universo, todayISO());

  function armar(etiqueta: string, act: ActivacionAjustadaResult, sector: Sector): ReferenciaOldSchool {
    let kgPanquecitas = 0;
    for (const l of vigentes) {
      if (sectorGroup(l.oficina_venta) !== sector) continue;
      kgPanquecitas += kgPorCliente.get(l.id) ?? 0;
    }
    const kgDia = diasHabiles > 0 ? kgPanquecitas / diasHabiles : 0;
    return {
      etiqueta,
      cartera: act.universo,
      activos: act.activos,
      activacionPct: act.activacionPct,
      carteraFoco: act.universoAjustado,
      activacionFocoPct: act.activacionAjustadaPct,
      kgPanquecitas,
      desde: OLD_SCHOOL_DESDE,
      corte,
      diasHabiles,
      kgDia,
      kgDiaPorActivo: act.activos > 0 ? kgDia / act.activos : 0,
    };
  }

  return {
    barquisimeto_este: armar("Cabudare", actCabudare, "barquisimeto_este"),
    cumana: armar("Cumaná (piloto)", actCumana, "cumana"),
  };
}
