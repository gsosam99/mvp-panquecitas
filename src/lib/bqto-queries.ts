import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS } from "@/data/catalog";
import { contarDiasHabiles } from "@/lib/business-days";
import { todayISO } from "@/lib/date-buckets";
import { getActivacionAjustada, type ActivacionAjustadaResult } from "@/lib/dienn-queries";
import { foldSegmento } from "@/lib/segmentos";
import { getUniverseLocations, sectorGroup, vigentesAl, type Sector } from "@/lib/universe";
import {
  DIAS_HABILES_MES,
  SIN_TIPO,
  type BqtoFila,
  type PerfilTipo,
  type ReferenciaActivacion,
} from "@/lib/bqto-completo";

// Lecturas del módulo "Ciudades completas" (ver src/lib/bqto-completo.ts).
// Nada de esto lo usa el Dashboard principal.

/** Las filas de la última carga. `error` trae el motivo si la tabla no se pudo leer (p. ej. falta el migration 025). */
export async function getBqto3MFilas(): Promise<{ filas: BqtoFila[]; error: string | null }> {
  const supabase = createSupabaseServiceClient();
  try {
    const filas = await fetchAllRows<BqtoFila>(() =>
      supabase
        .from("bqto_3m_ventas")
        .select("ciudad, sap_code, client_name, tipo_cliente, quantity_kg, date_of_sale")
    );
    return { filas, error: null };
  } catch (e) {
    console.error("[getBqto3MFilas]", e);
    const detalle = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
    return { filas: [], error: detalle };
  }
}

/** Referencias de activación: el piloto total y cada sector piloto. */
export type ReferenciasPiloto = Record<"total" | Sector, ReferenciaActivacion>;

export interface PerfilPiloto {
  referencias: ReferenciasPiloto;
  /**
   * La mayor compra de Harina PAN de un cliente de la cartera del piloto en un
   * mes (kg). Un cliente de la zona que compra más que esto al mes no tiene
   * equivalente en el piloto: es un "gigante" y se muestra aparte.
   */
  umbralGiganteMes: number;
}

/**
 * El perfil de hoy del piloto completo, de Cabudare y de Cumaná: activación y
 * volumen de Panquecitas por cliente activo, en total y POR TIPO DE CLIENTE.
 *
 * La proyección de una zona usa el perfil por tipo (DIENN, 27-09-2026): cada
 * tipo de cliente de la zona se activa y compra como ese mismo tipo en el
 * piloto. Un promedio único trataba a un hipermercado como a una bodega.
 *
 * La activación general sale de getActivacionAjustada, la misma función de la
 * tarjeta de activación del dashboard, para que los porcentajes sean
 * idénticos. La de cada tipo usa la misma definición de activo (Radar de
 * Panquecitas acumulado > 0) sobre la cartera vigente de ese tipo.
 *
 * Los kg por cliente activo al mes cuentan a cada cliente desde SU primera
 * compra hasta el último día con Radar: dividir entre los meses del piloto
 * completo castigaría a los clientes activados tarde, que todavía no tuvieron
 * tiempo de vender.
 */
export async function getPerfilPiloto(): Promise<PerfilPiloto> {
  const supabase = createSupabaseServiceClient();
  const [actTotal, actCabudare, actCumana, universo, radar, harinaPan] = await Promise.all([
    getActivacionAjustada(),
    getActivacionAjustada("barquisimeto_este"),
    getActivacionAjustada("cumana"),
    getUniverseLocations(),
    fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(() =>
      supabase
        .from("sap_sell_in_records")
        .select("location_id, quantity_kg, date_of_sale")
        .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    ),
    fetchAllRows<{ location_id: string; quantity_kg: number; date_of_sale: string }>(() =>
      supabase
        .from("sap_sell_in_records")
        .select("location_id, quantity_kg, date_of_sale")
        .eq("product_id", PRODUCT_IDS.HARINA_PAN)
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

  const hoy = todayISO();

  // Umbral de gigante: la mayor Harina PAN de un cliente de la cartera en un mes.
  const idsCartera = new Set(vigentesAl(universo, hoy).map((l) => l.id));
  const panPorClienteMes = new Map<string, number>();
  for (const r of harinaPan) {
    if (!idsCartera.has(r.location_id)) continue;
    const llave = `${r.location_id}|${r.date_of_sale.slice(0, 7)}`;
    panPorClienteMes.set(llave, (panPorClienteMes.get(llave) ?? 0) + (Number(r.quantity_kg) || 0));
  }
  const umbralGiganteMes = Math.max(0, ...panPorClienteMes.values());

  function armar(etiqueta: string, act: ActivacionAjustadaResult, sector?: Sector): ReferenciaActivacion {
    const delSector = sector ? universo.filter((l) => sectorGroup(l.oficina_venta) === sector) : universo;
    let kgActivos = 0;
    let diasCliente = 0;
    const porTipo: Record<string, PerfilTipo> = {};
    for (const l of vigentesAl(delSector, hoy)) {
      const tipo = foldSegmento(l.tipo_cliente) || foldSegmento(SIN_TIPO);
      if (!porTipo[tipo]) porTipo[tipo] = { cartera: 0, activos: 0, kgActivos: 0, mesesCliente: 0 };
      const perfil = porTipo[tipo];
      perfil.cartera += 1;
      const c = porCliente.get(l.id);
      // "Activo" igual que la tarjeta: Radar de Panquecitas acumulado > 0.
      if (!c || c.kg <= 0 || !c.primera || !corte) continue;
      const dias = contarDiasHabiles(c.primera, corte);
      kgActivos += c.kg;
      diasCliente += dias;
      perfil.activos += 1;
      perfil.kgActivos += c.kg;
      perfil.mesesCliente += dias / DIAS_HABILES_MES;
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
      porTipo,
    };
  }

  return {
    referencias: {
      total: armar("Piloto total (Cumaná + Cabudare)", actTotal),
      barquisimeto_este: armar("Cabudare", actCabudare, "barquisimeto_este"),
      cumana: armar("Cumaná (piloto)", actCumana, "cumana"),
    },
    umbralGiganteMes,
  };
}
