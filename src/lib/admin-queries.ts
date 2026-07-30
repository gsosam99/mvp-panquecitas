import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PRODUCT_IDS, VARIANT_IDS } from "@/data/catalog";
import { PVP_TARGETS, isPvpDeviated } from "@/data/pvp-thresholds";
import { clusterGroup } from "@/lib/universe";
import type { Location } from "@/types";

// ────────────────────────────────────────────────────────────────
// Perfil Administrador — Auditoría, Control de Ejecución en PDV.
// Ver doc §4. Ninguna de estas queries toca sap_sell_in_records más
// allá de identificar "PDVs compradores" (nunca expone $ ni kg/bultos
// de Sell-in al perfil Administrador).
// ────────────────────────────────────────────────────────────────

interface LastVisitInfo {
  id: string;
  created_at: string;
  pop_present: boolean;
  product_present: boolean;
  front_faces: number | null;
  deposit_access: boolean;
}

export interface PdvExecutionRow {
  location: Location;
  lastVisit: LastVisitInfo | null;
  depositoQty: number;
  anaquel: {
    v04: { qty: number; price: number | null };
    v08: { qty: number; price: number | null };
  };
}

/**
 * PDVs compradores (con sell-in de Panquecitas > 0) cruzados con su última visita.
 *
 * @param demoMode — TODO(demo): quitar este parámetro y su lógica cuando haya
 * datos reales de SAP. Con demoMode=true, un PDV también cuenta como
 * "comprador" si tiene al menos una visita de mercaderista registrada, aunque
 * no tenga venta SAP — solo para poder mostrar el dashboard de Admin sin
 * depender de un reporte SAP cargado. Con demoMode=false (default) se respeta
 * la definición real del spec: comprador = con venta SAP de Panquecitas.
 */
async function getExecutionSnapshot(demoMode = false): Promise<PdvExecutionRow[]> {
  const supabase = createSupabaseServiceClient();

  // 1. PDVs compradores de Panquecitas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sellInData } = await (supabase as any)
    .from("sap_sell_in_records")
    .select("location_id, quantity_kg")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0);

  const compradorIds = new Set(
    ((sellInData ?? []) as { location_id: string }[]).map((r) => r.location_id)
  );

  // TODO(demo): bloque a eliminar junto con el parámetro demoMode.
  if (demoMode) {
    const { data: visitedData } = await supabase
      .from("mercaderista_visits")
      .select("location_id");
    for (const v of (visitedData ?? []) as { location_id: string }[]) {
      compradorIds.add(v.location_id);
    }
  }

  if (compradorIds.size === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: locData } = await (supabase as any)
    .from("locations")
    .select(
      "id, name, type, sap_code, address, region, centro_poblado, municipio, tipo_cliente, lat, lng"
    )
    .in("id", Array.from(compradorIds));

  const locations = (locData ?? []) as Location[];

  // 2. Última visita por PDV comprador
  const { data: visitsData } = await supabase
    .from("mercaderista_visits")
    .select(
      "id, location_id, created_at, pop_present, product_present, front_faces, deposit_access"
    )
    .in("location_id", Array.from(compradorIds))
    .order("created_at", { ascending: false });

  const lastVisitByLocation = new Map<string, LastVisitInfo>();
  for (const v of (visitsData ?? []) as (LastVisitInfo & { location_id: string })[]) {
    if (!lastVisitByLocation.has(v.location_id)) {
      lastVisitByLocation.set(v.location_id, {
        id: v.id,
        created_at: v.created_at,
        pop_present: v.pop_present,
        product_present: v.product_present,
        front_faces: v.front_faces,
        deposit_access: v.deposit_access,
      });
    }
  }

  const visitIds = Array.from(lastVisitByLocation.values()).map((v) => v.id);

  // 3. Inventario (anaquel + depósito) de esas últimas visitas
  const auditsByVisit = new Map<
    string,
    { variant_id: string; zone: "ANAQUEL" | "BODEGA"; quantity: number; unit_price_observed: number | null }[]
  >();
  if (visitIds.length > 0) {
    const { data: auditsData } = await supabase
      .from("inventory_audits")
      .select("visit_id, variant_id, zone, quantity, unit_price_observed")
      .in("visit_id", visitIds);

    for (const a of (auditsData ?? []) as {
      visit_id: string;
      variant_id: string;
      zone: "ANAQUEL" | "BODEGA";
      quantity: number;
      unit_price_observed: number | null;
    }[]) {
      if (!auditsByVisit.has(a.visit_id)) auditsByVisit.set(a.visit_id, []);
      auditsByVisit.get(a.visit_id)!.push(a);
    }
  }

  return locations.map((location) => {
    const lastVisit = lastVisitByLocation.get(location.id) ?? null;
    const rows = lastVisit ? auditsByVisit.get(lastVisit.id) ?? [] : [];

    const depositoQty = rows
      .filter((r) => r.zone === "BODEGA")
      .reduce((sum, r) => sum + r.quantity, 0);

    const anaquel04 = rows.find(
      (r) => r.zone === "ANAQUEL" && r.variant_id === VARIANT_IDS.PANQ_04KG_UNIDAD
    );
    const anaquel08 = rows.find(
      (r) => r.zone === "ANAQUEL" && r.variant_id === VARIANT_IDS.PANQ_08KG_UNIDAD
    );

    return {
      location,
      lastVisit,
      depositoQty,
      anaquel: {
        v04: { qty: anaquel04?.quantity ?? 0, price: anaquel04?.unit_price_observed ?? null },
        v08: { qty: anaquel08?.quantity ?? 0, price: anaquel08?.unit_price_observed ?? null },
      },
    };
  });
}

// ── Cobertura Mercaderista ────────────────────────────────────────

export interface CoberturaResult {
  visitados: number;
  faltantes: Location[];
  total: number;
}

export async function getCoberturaMercaderista(demoMode = false): Promise<CoberturaResult> {
  const snapshot = await getExecutionSnapshot(demoMode);
  const faltantes = snapshot.filter((r) => r.lastVisit === null).map((r) => r.location);
  return {
    visitados: snapshot.length - faltantes.length,
    faltantes,
    total: snapshot.length,
  };
}

// ── Material POP faltante ─────────────────────────────────────────

export async function getMaterialPopFaltante(demoMode = false): Promise<Location[]> {
  const snapshot = await getExecutionSnapshot(demoMode);
  return snapshot
    .filter((r) => r.lastVisit && r.lastVisit.pop_present === false)
    .map((r) => r.location);
}

// ── Agotados en depósito ──────────────────────────────────────────

export async function getAgotadosDeposito(demoMode = false): Promise<Location[]> {
  const snapshot = await getExecutionSnapshot(demoMode);
  return snapshot
    .filter((r) => r.lastVisit?.deposit_access === true && r.depositoQty === 0)
    .map((r) => r.location);
}

// ── Caras frontales bajas (< 2) ───────────────────────────────────

export interface CarasFrontalesRow {
  location: Location;
  frontFaces: number;
}

export async function getCarasFrontalesBajas(demoMode = false): Promise<CarasFrontalesRow[]> {
  const snapshot = await getExecutionSnapshot(demoMode);
  return snapshot
    .filter(
      (r) =>
        r.lastVisit?.product_present === true &&
        r.lastVisit.front_faces !== null &&
        r.lastVisit.front_faces < 2
    )
    .map((r) => ({ location: r.location, frontFaces: r.lastVisit!.front_faces! }));
}

// ── Desviación PVP 400g/800g ──────────────────────────────────────

export interface PvpDeviationRow {
  location: Location;
  price04: number | null;
  price08: number | null;
  target04: number;
  target08: number;
  deviated04: boolean;
  deviated08: boolean;
}

export async function getDesviacionPvp(demoMode = false): Promise<PvpDeviationRow[]> {
  const snapshot = await getExecutionSnapshot(demoMode);
  const rows: PvpDeviationRow[] = [];

  for (const r of snapshot) {
    const group = clusterGroup(r.location.centro_poblado);
    if (!group) continue; // sin umbral definido fuera de los clusters piloto
    const target = PVP_TARGETS[group];
    const price04 = r.anaquel.v04.price;
    const price08 = r.anaquel.v08.price;

    rows.push({
      location: r.location,
      price04,
      price08,
      target04: target.p400,
      target08: target.p800,
      deviated04: price04 === null || isPvpDeviated(price04, target.p400),
      deviated08: price08 === null || isPvpDeviated(price08, target.p800),
    });
  }

  return rows.filter((r) => r.deviated04 || r.deviated08);
}

// ── Índice de Tienda Ideal MVP ────────────────────────────────────

export interface IndiceTiendaIdealResult {
  pct: number;
  cumplen: number;
  total: number;
}

export async function getIndiceTiendaIdeal(demoMode = false): Promise<IndiceTiendaIdealResult> {
  const snapshot = await getExecutionSnapshot(demoMode);
  const evaluable = snapshot.filter((r) => clusterGroup(r.location.centro_poblado) !== null);

  let cumplen = 0;
  for (const r of evaluable) {
    const group = clusterGroup(r.location.centro_poblado)!;
    const target = PVP_TARGETS[group];
    const precioOk =
      r.anaquel.v04.price !== null &&
      !isPvpDeviated(r.anaquel.v04.price, target.p400) &&
      r.anaquel.v08.price !== null &&
      !isPvpDeviated(r.anaquel.v08.price, target.p800);
    const popOk = r.lastVisit?.pop_present === true;
    const inventarioOk = r.anaquel.v04.qty > 0 && r.anaquel.v08.qty > 0;

    if (precioOk && popOk && inventarioOk) cumplen++;
  }

  return {
    pct: evaluable.length > 0 ? Math.round((cumplen / evaluable.length) * 100 * 10) / 10 : 0,
    cumplen,
    total: evaluable.length,
  };
}
