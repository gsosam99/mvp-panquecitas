import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS, VARIANT_IDS } from "@/data/catalog";
import { getVolumenLocations } from "@/lib/universe";
import { sectorGroup, type Sector } from "@/lib/sectors";
import { siguienteDiaHabil } from "@/lib/business-days";
import { SEGMENTO_SIN_DATO } from "@/lib/segmentos";
import {
  BASE_DESDE_400G,
  BASE_HASTA_400G,
  FECHA_BLOQUEO_400G,
  type GrupoPresentacion,
  type Impacto400gCliente,
  type Impacto400gDia,
  type Impacto400gResult,
} from "@/lib/impacto-400g-utils";

// ── Impacto bloqueo 400g (DIENN, 23-09-2026) ─────────────────────────────
// Radar de Panquecitas (sap_sell_in_records, una fila por cliente +
// presentación + día) separado en 400g y 800g, para medir cuánto volumen se
// pierde desde que el 400g se bloqueó (15-09) y cuánto absorbe el 800g.
//
// Volumen: incluye PDV fuera de cartera (getVolumenLocations), igual que el
// resto de las cifras de volumen de Panquecitas. Global; el corte por ciudad
// se hace en el cliente. Criterio y KPIs en impacto-400g-utils.ts.

export type { Impacto400gResult };

const PRESENTACION: Record<string, "400" | "800"> = {
  [VARIANT_IDS.PANQ_04KG_UNIDAD]: "400",
  [VARIANT_IDS.PANQ_04KG_BULTO]: "400",
  [VARIANT_IDS.PANQ_08KG_UNIDAD]: "800",
  [VARIANT_IDS.PANQ_08KG_BULTO]: "800",
};

const r1 = (v: number) => Math.round(v * 10) / 10;

export async function getImpacto400g(): Promise<Impacto400gResult> {
  const supabase = createSupabaseServiceClient();
  const [locations, rows] = await Promise.all([
    getVolumenLocations(),
    fetchAllRows<{ location_id: string; variant_id: string; quantity_kg: number; date_of_sale: string }>(() =>
      supabase
        .from("sap_sell_in_records")
        .select("location_id, variant_id, quantity_kg, date_of_sale")
        .eq("product_id", PRODUCT_IDS.PANQUECITAS)
        .not("variant_id", "is", null)
    ),
  ]);

  const locById = new Map(locations.map((l) => [l.id, l]));
  const porDia = new Map<string, Impacto400gDia>();
  const porCliente = new Map<string, { kg400Base: number; kg800Base: number; kg400Post: number; kg800Post: number }>();
  let fechaCorte: string | null = null;

  for (const r of rows ?? []) {
    const presentacion = PRESENTACION[r.variant_id];
    const loc = locById.get(r.location_id);
    const sector: Sector | null = loc ? sectorGroup(loc.oficina_venta) : null;
    if (!presentacion || !sector) continue;

    // Venta de fin de semana → siguiente día hábil (series solo de hábiles).
    const fecha = siguienteDiaHabil(r.date_of_sale);
    if (!fechaCorte || fecha > fechaCorte) fechaCorte = fecha;
    const kg = Number(r.quantity_kg) || 0;

    const claveDia = `${fecha}|${sector}`;
    let dia = porDia.get(claveDia);
    if (!dia) porDia.set(claveDia, (dia = { fecha, sector, kg400: 0, kg800: 0 }));
    if (presentacion === "400") dia.kg400 += kg;
    else dia.kg800 += kg;

    const enBase = fecha >= BASE_DESDE_400G && fecha <= BASE_HASTA_400G;
    const enPost = fecha >= FECHA_BLOQUEO_400G;
    if (!enBase && !enPost) continue;
    let c = porCliente.get(r.location_id);
    if (!c) porCliente.set(r.location_id, (c = { kg400Base: 0, kg800Base: 0, kg400Post: 0, kg800Post: 0 }));
    if (enBase) {
      if (presentacion === "400") c.kg400Base += kg;
      else c.kg800Base += kg;
    } else if (presentacion === "400") c.kg400Post += kg;
    else c.kg800Post += kg;
  }

  const clientes: Impacto400gCliente[] = [];
  for (const [locationId, c] of porCliente) {
    const loc = locById.get(locationId)!;
    const sector = sectorGroup(loc.oficina_venta)!;
    const compro400 = c.kg400Base > 0;
    const compro800 = c.kg800Base > 0;
    const grupo: GrupoPresentacion =
      compro400 && compro800 ? "AMBAS" : compro400 ? "SOLO_400" : compro800 ? "SOLO_800" : "NUEVO";
    // Sin compra neta en ningún período (p. ej. solo devoluciones): no aporta.
    if (grupo === "NUEVO" && c.kg400Post <= 0 && c.kg800Post <= 0) continue;
    clientes.push({
      locationId,
      sapCode: loc.sap_code,
      nombre: loc.name,
      sector,
      municipio: loc.municipio,
      segmento: loc.segmento_cliente?.trim() || SEGMENTO_SIN_DATO,
      grupo,
      kg400Base: r1(c.kg400Base),
      kg800Base: r1(c.kg800Base),
      kg400Post: r1(c.kg400Post),
      kg800Post: r1(c.kg800Post),
    });
  }

  clientes.sort((a, b) => b.kg400Base - a.kg400Base || a.nombre.localeCompare(b.nombre));
  const dias = [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { fechaCorte, dias, clientes };
}
