import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PRODUCT_IDS } from "@/data/catalog";
import { VISIT_ROUNDS } from "@/data/visit-rounds";
import { getUniverseLocations } from "@/lib/universe";
import { sectorGroup } from "@/lib/sectors";
import {
  presentacionFromVariant,
  pickVisitForRound,
  type Presentacion,
  type SellOutClienteDiffRow,
  type SellOutRecord,
  type VisitRow,
} from "@/lib/sellout-utils";

// ────────────────────────────────────────────────────────────────
// Motor de Sell-Out (consulta a Supabase) — ver "Arreglos app
// Panquecitas" §Perfil DIENN (puntos 6 y 7) y
// docs/decisiones-implementacion.md (decisiones #1 a #8 de esa ronda).
// Los tipos y funciones de agregación puras (sin Supabase) viven en
// src/lib/sellout-utils.ts para poder importarse también desde Client
// Components.
//
// Sell-Out(R1→R2) = Inventario_R1 + Sell_In_Periodo(R1,R2) − Inventario_R2
// Si da negativo: se clampa a 0, se marca ajuste_inventario=true, y el
// excedente negativo se suma al Sell_In_Periodo del par siguiente (auto-
// compensación).
//
// Cálculo en vivo (sin tabla de caché) — ver decisión #4: para el volumen
// de datos de este MVP es más simple y evita bugs de caché desincronizada.
// ────────────────────────────────────────────────────────────────

export async function computeSellOut(): Promise<SellOutRecord[]> {
  const supabase = createSupabaseServiceClient();
  const universo = await getUniverseLocations();
  if (universo.length === 0) return [];

  const locationIds = universo.map((l) => l.id);

  // 1. Visitas de mercaderista (para inventario en anaquel/depósito por ronda)
  const { data: visitsData } = await supabase
    .from("mercaderista_visits")
    .select("id, location_id, created_at, anaquel_400_units, anaquel_800_units, deposit_access")
    .in("location_id", locationIds)
    .order("created_at");

  const visitsByLocation = new Map<string, VisitRow[]>();
  for (const v of (visitsData ?? []) as VisitRow[]) {
    if (!visitsByLocation.has(v.location_id)) visitsByLocation.set(v.location_id, []);
    visitsByLocation.get(v.location_id)!.push(v);
  }

  // 2. Depósito (BODEGA) por visita
  const allVisitIds = (visitsData ?? []).map((v) => (v as VisitRow).id);
  const depositoByVisit = new Map<string, { kg400: number; kg800: number }>();
  if (allVisitIds.length > 0) {
    const { data: variantsData } = await supabase.from("variants").select("id, presentation_kg, units_per_bulk");
    const kgPerUnit = new Map<string, number>(
      ((variantsData ?? []) as { id: string; presentation_kg: number; units_per_bulk: number }[]).map((v) => [
        v.id,
        v.presentation_kg * v.units_per_bulk,
      ])
    );

    const { data: auditsData } = await supabase
      .from("inventory_audits")
      .select("visit_id, variant_id, quantity, zone")
      .eq("zone", "BODEGA")
      .in("visit_id", allVisitIds);

    for (const a of (auditsData ?? []) as { visit_id: string; variant_id: string; quantity: number }[]) {
      const presentacion = presentacionFromVariant(a.variant_id);
      if (!presentacion) continue;
      const kg = a.quantity * (kgPerUnit.get(a.variant_id) ?? 0);
      if (!depositoByVisit.has(a.visit_id)) depositoByVisit.set(a.visit_id, { kg400: 0, kg800: 0 });
      const entry = depositoByVisit.get(a.visit_id)!;
      if (presentacion === "400g") entry.kg400 += kg;
      else entry.kg800 += kg;
    }
  }

  function inventarioKg(visit: VisitRow | null): { kg400: number; kg800: number } | null {
    if (!visit) return null;
    const anaquel400Kg = (visit.anaquel_400_units ?? 0) * 0.4;
    const anaquel800Kg = (visit.anaquel_800_units ?? 0) * 0.8;
    const deposito = visit.deposit_access ? depositoByVisit.get(visit.id) ?? { kg400: 0, kg800: 0 } : { kg400: 0, kg800: 0 };
    return { kg400: anaquel400Kg + deposito.kg400, kg800: anaquel800Kg + deposito.kg800 };
  }

  // 3. Despachos SAP (fecha real) por cliente
  const { data: dispatchesData } = await supabase
    .from("sap_dispatches")
    .select("location_id, variant_id, quantity, dispatch_date")
    .in("location_id", locationIds)
    .order("dispatch_date");

  const dispatchesByLocation = new Map<
    string,
    { variant: Presentacion | null; quantity: number; date: string }[]
  >();
  for (const d of (dispatchesData ?? []) as {
    location_id: string;
    variant_id: string | null;
    quantity: number;
    dispatch_date: string;
  }[]) {
    if (!dispatchesByLocation.has(d.location_id)) dispatchesByLocation.set(d.location_id, []);
    dispatchesByLocation
      .get(d.location_id)!
      .push({ variant: presentacionFromVariant(d.variant_id), quantity: d.quantity, date: d.dispatch_date });
  }

  // Nota: los despachos sin SKU reconocido (variant=null) no se pueden
  // asignar a una presentación — se excluyen del Sell-Out por presentación
  // (ver resolveVariantFromSku en src/data/catalog.ts).
  function sellInPeriodo(locationId: string, presentacion: Presentacion, fromDateInclusive: string, toDateExclusive: string): number {
    const rows = dispatchesByLocation.get(locationId) ?? [];
    return rows
      .filter((r) => r.variant === presentacion && r.date >= fromDateInclusive && r.date < toDateExclusive)
      .reduce((sum, r) => sum + r.quantity, 0);
  }

  // 4. Sell-Out reportado por Cadenas
  const { data: reportadoData } = await supabase
    .from("sell_out_reportado")
    .select("location_id, variant_id, fecha_inicio, fecha_fin, volumen")
    .in("location_id", locationIds);

  const reportadoByLocation = new Map<
    string,
    { variant: Presentacion | null; inicio: string; fin: string; volumen: number }[]
  >();
  for (const r of (reportadoData ?? []) as {
    location_id: string;
    variant_id: string | null;
    fecha_inicio: string;
    fecha_fin: string;
    volumen: number;
  }[]) {
    if (!reportadoByLocation.has(r.location_id)) reportadoByLocation.set(r.location_id, []);
    reportadoByLocation
      .get(r.location_id)!
      .push({ variant: presentacionFromVariant(r.variant_id), inicio: r.fecha_inicio, fin: r.fecha_fin, volumen: r.volumen });
  }

  // 5. Calcular por cliente, por presentación, recorriendo las rondas en orden
  const records: SellOutRecord[] = [];

  for (const location of universo) {
    const visits = visitsByLocation.get(location.id) ?? [];
    const sector = sectorGroup(location.oficina_venta);

    const roundVisits = VISIT_ROUNDS.map((r) => pickVisitForRound(visits, r.start, r.end));

    if (location.fuente_sell_out === "Reportado_B2B") {
      const reportado = reportadoByLocation.get(location.id) ?? [];
      for (let i = 0; i < VISIT_ROUNDS.length - 1; i++) {
        const roundFrom = VISIT_ROUNDS[i];
        const roundTo = VISIT_ROUNDS[i + 1];
        for (const presentacion of ["400g", "800g"] as Presentacion[]) {
          const volumen = reportado
            .filter((r) => r.variant === presentacion && r.inicio >= roundFrom.start && r.inicio <= roundTo.end)
            .reduce((sum, r) => sum + r.volumen, 0);
          if (volumen === 0) continue;
          const inv1 = inventarioKg(roundVisits[i]);
          const inv2 = inventarioKg(roundVisits[i + 1]);
          const invProm =
            inv1 || inv2
              ? ((presentacion === "400g" ? inv1?.kg400 ?? 0 : inv1?.kg800 ?? 0) +
                  (presentacion === "400g" ? inv2?.kg400 ?? 0 : inv2?.kg800 ?? 0)) /
                2
              : 0;
          records.push({
            locationId: location.id,
            name: location.name,
            sapCode: location.sap_code,
            sector,
            zona: location.region,
            asesor: location.asesor_encargado,
            fuente: "Reportado_B2B",
            roundIndex: i,
            roundLabel: `${roundFrom.label} → ${roundTo.label}`,
            variant: presentacion,
            sellInKg: volumen,
            sellOutKg: volumen,
            inventarioPromedioKg: invProm,
            ajusteInventario: false,
          });
        }
      }
      continue;
    }

    // fuente_sell_out === 'Calculado'
    for (const presentacion of ["400g", "800g"] as Presentacion[]) {
      let carryForward = 0;

      for (let i = 0; i < VISIT_ROUNDS.length - 1; i++) {
        const roundFrom = VISIT_ROUNDS[i];
        const roundTo = VISIT_ROUNDS[i + 1];
        const visit1 = roundVisits[i];
        const visit2 = roundVisits[i + 1];

        if (!visit1 || !visit2) {
          // Sin visita en alguna de las dos rondas: no hay dato para este
          // par, no se inventa. El arrastre de negativos igual sigue
          // aplicando cuando exista un par calculable más adelante.
          continue;
        }

        const inv1 = inventarioKg(visit1)!;
        const inv2 = inventarioKg(visit2)!;
        const inventarioInicial = presentacion === "400g" ? inv1.kg400 : inv1.kg800;
        const inventarioFinal = presentacion === "400g" ? inv2.kg400 : inv2.kg800;

        // Corte D-1 estricto: desde 00:00 de la fecha real de la visita R1,
        // hasta (exclusivo) la fecha calendario de la visita R2 — excluye
        // cualquier despacho con la misma fecha que R2.
        const fromDate = visit1.created_at.slice(0, 10);
        const toDateExclusive = visit2.created_at.slice(0, 10);
        const sellIn = sellInPeriodo(location.id, presentacion, fromDate, toDateExclusive) + carryForward;

        const raw = inventarioInicial + sellIn - inventarioFinal;
        const ajuste = raw < 0;
        const sellOut = ajuste ? 0 : raw;
        carryForward = ajuste ? -raw : 0;

        records.push({
          locationId: location.id,
          name: location.name,
          sapCode: location.sap_code,
          sector,
          zona: location.region,
          asesor: location.asesor_encargado,
          fuente: "Calculado",
          roundIndex: i,
          roundLabel: `${roundFrom.label} → ${roundTo.label}`,
          variant: presentacion,
          sellInKg: sellIn,
          sellOutKg: sellOut,
          inventarioPromedioKg: (inventarioInicial + inventarioFinal) / 2,
          ajusteInventario: ajuste,
        });
      }
    }
  }

  return records;
}

// ── Sell-Out por cliente = diferencia SAP − inventario en PDV ──────
// No requiere dos visitas: una sola visita de mercaderista (inventario en
// tienda) contra el reporte de SAP (Radar de Panquecitas). Ver
// SellOutClienteDiffRow en sellout-utils.
export async function getSellOutPorClienteDiff(): Promise<SellOutClienteDiffRow[]> {
  const supabase = createSupabaseServiceClient();
  const universo = await getUniverseLocations();
  if (universo.length === 0) return [];
  const locationIds = universo.map((l) => l.id);

  // 1. Reporte SAP (Radar de Panquecitas) en kg por cliente.
  const { data: radarData } = await supabase
    .from("sap_sell_in_records")
    .select("location_id, quantity_kg")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .in("location_id", locationIds);
  const sellInByLocation = new Map<string, number>();
  for (const r of (radarData ?? []) as { location_id: string; quantity_kg: number }[]) {
    sellInByLocation.set(r.location_id, (sellInByLocation.get(r.location_id) ?? 0) + r.quantity_kg);
  }

  // 2. Última visita de mercaderista por cliente (inventario en PDV).
  const { data: visitsData } = await supabase
    .from("mercaderista_visits")
    .select("id, location_id, created_at, anaquel_400_units, anaquel_800_units, deposit_access")
    .in("location_id", locationIds)
    .order("created_at", { ascending: false });
  const lastVisit = new Map<string, VisitRow>();
  for (const v of (visitsData ?? []) as VisitRow[]) {
    if (!lastVisit.has(v.location_id)) lastVisit.set(v.location_id, v);
  }

  // 3. Depósito (BODEGA) en kg de esas visitas.
  const visitIds = Array.from(lastVisit.values()).map((v) => v.id);
  const depositoKgByVisit = new Map<string, number>();
  if (visitIds.length > 0) {
    const { data: variantsData } = await supabase.from("variants").select("id, presentation_kg, units_per_bulk");
    const kgPerUnit = new Map<string, number>(
      ((variantsData ?? []) as { id: string; presentation_kg: number; units_per_bulk: number }[]).map((v) => [
        v.id,
        v.presentation_kg * v.units_per_bulk,
      ])
    );
    const { data: auditsData } = await supabase
      .from("inventory_audits")
      .select("visit_id, variant_id, quantity")
      .eq("zone", "BODEGA")
      .in("visit_id", visitIds);
    for (const a of (auditsData ?? []) as { visit_id: string; variant_id: string; quantity: number }[]) {
      if (!presentacionFromVariant(a.variant_id)) continue;
      const kg = a.quantity * (kgPerUnit.get(a.variant_id) ?? 0);
      depositoKgByVisit.set(a.visit_id, (depositoKgByVisit.get(a.visit_id) ?? 0) + kg);
    }
  }

  const rows: SellOutClienteDiffRow[] = [];
  for (const location of universo) {
    const visit = lastVisit.get(location.id);
    if (!visit) continue; // sin reporte del mercaderista no hay diferencia que calcular

    // Solo PDV visitados que ADEMÁS tienen ventas en SAP (Radar de Panquecitas
    // > 0): el sell out es SAP − inventario, así que sin sell-in SAP no hay
    // nada que comparar. Decisión con Alejandro (11-08-2026).
    const sellInSapKg = sellInByLocation.get(location.id) ?? 0;
    if (sellInSapKg <= 0) continue;

    const anaquelKg = (visit.anaquel_400_units ?? 0) * 0.4 + (visit.anaquel_800_units ?? 0) * 0.8;
    const depositoKg = visit.deposit_access ? depositoKgByVisit.get(visit.id) ?? 0 : 0;
    const inventarioPdvKg = anaquelKg + depositoKg;
    const diff = sellInSapKg - inventarioPdvKg;

    rows.push({
      locationId: location.id,
      name: location.name,
      sapCode: location.sap_code,
      sector: sectorGroup(location.oficina_venta),
      zona: location.region,
      asesor: location.asesor_encargado,
      fuente: location.fuente_sell_out === "Reportado_B2B" ? "Reportado_B2B" : "Calculado",
      sellInSapKg: Math.round(sellInSapKg * 10) / 10,
      inventarioPdvKg: Math.round(inventarioPdvKg * 10) / 10,
      sellOutKg: Math.round(Math.max(0, diff) * 10) / 10,
      ajusteInventario: diff < 0,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export {
  aggregateByRound,
  aggregateMixProducto,
  computeRotacion,
  filterRecords,
  filterSellOutClientes,
  getAvailableZonasYAsesores,
} from "@/lib/sellout-utils";
export type {
  Presentacion,
  SellOutRecord,
  SellOutClienteDiffRow,
  SellOutPorRondaPoint,
  MixProductoTonPoint,
  RotacionResult,
} from "@/lib/sellout-utils";
