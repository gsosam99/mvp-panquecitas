import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS } from "@/data/catalog";
import { contarDiasHabiles, siguienteDiaHabil } from "@/lib/business-days";
import { todayISO } from "@/lib/date-buckets";
import { DIAS_HABILES_3M } from "@/lib/business-days";
import { getRendimiento3M } from "@/lib/dienn-queries";
import { esTipoFoco, SIN_TIPO, type BqtoFila } from "@/lib/bqto-completo";
import { esSegmentoSinAlimentos, foldSegmento } from "@/lib/segmentos";
import { getUniverseLocations, sectorGroup, vigentesAl, type Sector } from "@/lib/universe";
import type {
  CriterioFoco,
  GrupoPiloto,
  RatioDemanda,
  ReferenciaOldSchool,
  SegmentoPiloto,
} from "@/lib/old-school";

// Lecturas del módulo "Old School" (ver src/lib/old-school.ts).

/** Arranque del piloto: el mismo RENDIMIENTO_DIARIO_DESDE de dienn-queries.ts. */
export const OLD_SCHOOL_DESDE = "2026-08-03";

/**
 * El % de la demanda de Harina PAN que hoy vende en Panquecitas cada sector
 * piloto, con las dos bases de BaseRatio.
 *
 * Panquecitas por día y PAN "dashboard" salen de getRendimiento3M("universo"),
 * la misma función del gráfico de ratios. PAN "misma fuente" = el PAN de los
 * clientes de la cartera del sector dentro del archivo de la ciudad completa
 * que le toca (Cabudare en Barquisimeto, Cumaná piloto en Cumaná), ÷ 63.
 */
export async function getRatiosDemanda(
  filasCiudad: Record<Sector, BqtoFila[]>
): Promise<Record<Sector, RatioDemanda>> {
  const [universo, rendCabudare, rendCumana] = await Promise.all([
    getUniverseLocations(),
    getRendimiento3M("universo", "barquisimeto_este"),
    getRendimiento3M("universo", "cumana"),
  ]);
  const vigentes = vigentesAl(universo, todayISO());

  function armar(etiqueta: string, sector: Sector, rend: Awaited<ReturnType<typeof getRendimiento3M>>): RatioDemanda {
    const codigos = new Set(
      vigentes.filter((l) => sectorGroup(l.oficina_venta) === sector).map((l) => l.sap_code.trim())
    );
    const delPiloto = filasCiudad[sector].filter((f) => codigos.has(f.sap_code.trim()));
    const panMismaFuente = delPiloto.reduce((s, f) => s + (Number(f.quantity_kg) || 0), 0);
    const dias = rend.puntos.length;
    const panqKgDia = dias > 0 ? rend.puntos.reduce((s, p) => s + p.panquecitasKg, 0) / dias : 0;
    const panKgDia = { dashboard: rend.promedio3M, mismaFuente: panMismaFuente / DIAS_HABILES_3M };
    const ratio = (pan: number) => (pan > 0 ? (panqKgDia / pan) * 100 : 0);
    return {
      etiqueta,
      panqKgDia,
      dias,
      desde: rend.puntos[0]?.dia ?? null,
      hasta: rend.puntos[dias - 1]?.dia ?? null,
      panKgDia,
      ratioPct: { dashboard: ratio(panKgDia.dashboard), mismaFuente: ratio(panKgDia.mismaFuente) },
      clientesEnArchivo: new Set(delPiloto.map((f) => f.sap_code.trim())).size,
    };
  }

  return {
    barquisimeto_este: armar("Cabudare", "barquisimeto_este", rendCabudare),
    cumana: armar("Cumaná (piloto)", "cumana", rendCumana),
  };
}

/**
 * El perfil de hoy de Cabudare y de Cumaná piloto.
 *
 * Activo = Radar de Panquecitas acumulado > 0 sobre la cartera vigente hoy,
 * igual que la tarjeta de activación del dashboard. El corte foco / fuera de
 * foco se arma con los dos criterios de CriterioFoco: por tipo de cliente
 * (esTipoFoco, el mismo del archivo de la ciudad) y por segmento
 * (SEGMENTOS_SIN_ALIMENTOS, el del dashboard).
 *
 * Venta diaria = Radar de Panquecitas de la cartera vigente del sector desde
 * el 03-08-2026 ÷ días hábiles desde esa fecha hasta el último Radar. Una
 * venta de fin de semana se imputa al lunes siguiente, igual que en las
 * series diarias del piloto.
 */
export async function getReferenciasOldSchool(): Promise<Record<"total" | Sector, ReferenciaOldSchool>> {
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

  /** sector null = el piloto total (Cabudare + Cumaná). */
  function armar(etiqueta: string, sector: Sector | null): ReferenciaOldSchool {
    const conteo = () => ({ foco: { c: 0, a: 0 }, noFoco: { c: 0, a: 0 } });
    const porCriterio: Record<CriterioFoco, ReturnType<typeof conteo>> = { tipo: conteo(), segmento: conteo() };
    const segmentos = new Map<string, { tipo: string; cartera: number; activos: number; kg: number }>();
    let cartera = 0;
    let activos = 0;
    let kgPanquecitas = 0;
    for (const l of vigentes) {
      const s = sectorGroup(l.oficina_venta);
      if (sector ? s !== sector : s === null) continue;
      const activo = (acumulado.get(l.id) ?? 0) > 0;
      const kg = desdeArranque.get(l.id) ?? 0;
      const clave = foldSegmento(l.tipo_cliente) || foldSegmento(SIN_TIPO);
      const seg = segmentos.get(clave) ?? { tipo: l.tipo_cliente?.trim() || SIN_TIPO, cartera: 0, activos: 0, kg: 0 };
      seg.cartera += 1;
      if (activo) seg.activos += 1;
      seg.kg += kg;
      segmentos.set(clave, seg);
      const esFoco: Record<CriterioFoco, boolean> = {
        tipo: esTipoFoco(l.tipo_cliente),
        segmento: !esSegmentoSinAlimentos(l.segmento_cliente),
      };
      for (const criterio of ["tipo", "segmento"] as const) {
        const g = porCriterio[criterio][esFoco[criterio] ? "foco" : "noFoco"];
        g.c += 1;
        if (activo) g.a += 1;
      }
      cartera += 1;
      if (activo) activos += 1;
      kgPanquecitas += kg;
    }
    const porSegmento: SegmentoPiloto[] = [...segmentos.entries()]
      .map(([clave, s]) => ({
        clave,
        tipo: s.tipo,
        cartera: s.cartera,
        activos: s.activos,
        activacionPct: s.cartera > 0 ? (s.activos / s.cartera) * 100 : 0,
        kg: s.kg,
        kgDiaPorActivo: s.activos > 0 && diasHabiles > 0 ? s.kg / diasHabiles / s.activos : 0,
      }))
      .sort((a, b) => b.cartera - a.cartera);
    const grupos = (criterio: CriterioFoco) => ({
      foco: grupo(porCriterio[criterio].foco.c, porCriterio[criterio].foco.a),
      noFoco: grupo(porCriterio[criterio].noFoco.c, porCriterio[criterio].noFoco.a),
    });
    const kgDia = diasHabiles > 0 ? kgPanquecitas / diasHabiles : 0;
    return {
      etiqueta,
      total: grupo(cartera, activos),
      grupos: { tipo: grupos("tipo"), segmento: grupos("segmento") },
      kgPanquecitas,
      desde: OLD_SCHOOL_DESDE,
      corte,
      diasHabiles,
      kgDia,
      kgDiaPorActivo: activos > 0 ? kgDia / activos : 0,
      porSegmento,
    };
  }

  return {
    total: armar("Piloto total", null),
    barquisimeto_este: armar("Cabudare", "barquisimeto_este"),
    cumana: armar("Cumaná (piloto)", "cumana"),
  };
}
