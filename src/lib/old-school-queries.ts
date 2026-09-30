import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS } from "@/data/catalog";
import { contarDiasHabiles, siguienteDiaHabil } from "@/lib/business-days";
import { todayISO } from "@/lib/date-buckets";
import { esTipoFoco } from "@/lib/bqto-completo";
import { getUniverseLocations, sectorGroup, vigentesAl, type Sector } from "@/lib/universe";
import type { GrupoPiloto, ReferenciaOldSchool } from "@/lib/old-school";

// Lecturas del módulo "Old School" (ver src/lib/old-school.ts).

/** Arranque del piloto: el mismo RENDIMIENTO_DIARIO_DESDE de dienn-queries.ts. */
export const OLD_SCHOOL_DESDE = "2026-08-03";

/**
 * El perfil de hoy de Cabudare y de Cumaná piloto.
 *
 * Activo = Radar de Panquecitas acumulado > 0 sobre la cartera vigente hoy,
 * igual que la tarjeta de activación del dashboard. El corte foco / fuera de
 * foco usa el TIPO de cliente (esTipoFoco), el mismo criterio con que se
 * separan los clientes del archivo de la ciudad completa: así la activación
 * de cada grupo se aplica al mismo grupo del otro lado.
 *
 * Venta diaria = Radar de Panquecitas de la cartera vigente del sector desde
 * el 03-08-2026 ÷ días hábiles desde esa fecha hasta el último Radar. Una
 * venta de fin de semana se imputa al lunes siguiente, igual que en las
 * series diarias del piloto.
 */
export async function getReferenciasOldSchool(): Promise<Record<Sector, ReferenciaOldSchool>> {
  const supabase = createSupabaseServiceClient();
  const [universo, radar] = await Promise.all([
    getUniverseLocations(),
    fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(() =>
      supabase
        .from("sap_sell_in_records")
        .select("location_id, quantity_kg, date_of_sale")
        .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    ),
  ]);

  let corte: string | null = null;
  const acumulado = new Map<string, number>();
  const desdeArranque = new Map<string, number>();
  for (const r of radar) {
    const kg = Number(r.quantity_kg) || 0;
    const dia = siguienteDiaHabil(r.date_of_sale.slice(0, 10));
    acumulado.set(r.location_id, (acumulado.get(r.location_id) ?? 0) + kg);
    if (dia < OLD_SCHOOL_DESDE) continue;
    if (!corte || dia > corte) corte = dia;
    desdeArranque.set(r.location_id, (desdeArranque.get(r.location_id) ?? 0) + kg);
  }
  const diasHabiles = corte ? contarDiasHabiles(OLD_SCHOOL_DESDE, corte) : 0;
  const vigentes = vigentesAl(universo, todayISO());

  const grupo = (cartera: number, activos: number): GrupoPiloto => ({
    cartera,
    activos,
    activacionPct: cartera > 0 ? (activos / cartera) * 100 : 0,
  });

  function armar(etiqueta: string, sector: Sector): ReferenciaOldSchool {
    const c = { foco: 0, noFoco: 0 };
    const a = { foco: 0, noFoco: 0 };
    let kgPanquecitas = 0;
    for (const l of vigentes) {
      if (sectorGroup(l.oficina_venta) !== sector) continue;
      const g = esTipoFoco(l.tipo_cliente) ? "foco" : "noFoco";
      c[g] += 1;
      if ((acumulado.get(l.id) ?? 0) > 0) a[g] += 1;
      kgPanquecitas += desdeArranque.get(l.id) ?? 0;
    }
    const activos = a.foco + a.noFoco;
    const kgDia = diasHabiles > 0 ? kgPanquecitas / diasHabiles : 0;
    return {
      etiqueta,
      total: grupo(c.foco + c.noFoco, activos),
      foco: grupo(c.foco, a.foco),
      noFoco: grupo(c.noFoco, a.noFoco),
      kgPanquecitas,
      desde: OLD_SCHOOL_DESDE,
      corte,
      diasHabiles,
      kgDia,
      kgDiaPorActivo: activos > 0 ? kgDia / activos : 0,
    };
  }

  return {
    barquisimeto_este: armar("Cabudare", "barquisimeto_este"),
    cumana: armar("Cumaná (piloto)", "cumana"),
  };
}
