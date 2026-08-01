import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PRODUCT_IDS } from "@/data/catalog";
import { PVP_TARGETS, isPvpDeviated } from "@/data/pvp-thresholds";
import { sectorGroup } from "@/lib/universe";
import type { Location } from "@/types";

// ────────────────────────────────────────────────────────────────
// Perfil Administrador — Auditoría, Control de Ejecución en PDV.
// Reestructurado en 3 bloques (Ejecución / Cobertura Mercaderista /
// Precio de Venta) — ver "Cambios en app Panquecitas - Versión Ale (2)"
// y docs/decisiones-implementacion.md (decisiones #3, #5, #6, #8, #9,
// #10). Ninguna de estas queries toca sap_sell_in_records más allá de
// identificar "PDVs compradores" (nunca expone $ ni kg/bultos de
// Sell-in al perfil Administrador).
// ────────────────────────────────────────────────────────────────

interface LastVisitInfo {
  id: string;
  created_at: string;
  pop_present: boolean;
  pop_price_tag: boolean | null;
  product_present: boolean;
  price_400: number | null;
  price_400_na: boolean;
  price_800: number | null;
  price_800_na: boolean;
  total_units_anaquel: number | null;
  front_faces: number | null;
  deposit_access: boolean;
}

export interface PdvExecutionRow {
  location: Location;
  lastVisit: LastVisitInfo | null;
  depositoQty: number;
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
  const { data: sellInData } = await supabase
    .from("sap_sell_in_records")
    .select("location_id, quantity_kg")
    .eq("product_id", PRODUCT_IDS.PANQUECITAS)
    .gt("quantity_kg", 0);

  const compradorIds = new Set(((sellInData ?? []) as { location_id: string }[]).map((r) => r.location_id));

  // TODO(demo): bloque a eliminar junto con el parámetro demoMode.
  if (demoMode) {
    const { data: visitedData } = await supabase.from("mercaderista_visits").select("location_id");
    for (const v of (visitedData ?? []) as { location_id: string }[]) {
      compradorIds.add(v.location_id);
    }
  }

  if (compradorIds.size === 0) return [];

  const { data: locData } = await supabase
    .from("locations")
    .select(
      "id, name, type, sap_code, address, region, centro_poblado, municipio, tipo_cliente, oficina_venta, lat, lng"
    )
    .in("id", Array.from(compradorIds));

  const locations = (locData ?? []) as Location[];

  // 2. Última visita por PDV comprador
  const { data: visitsData } = await supabase
    .from("mercaderista_visits")
    .select(
      "id, location_id, created_at, pop_present, pop_price_tag, product_present, price_400, price_400_na, price_800, price_800_na, total_units_anaquel, front_faces, deposit_access"
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
        pop_price_tag: v.pop_price_tag,
        product_present: v.product_present,
        price_400: v.price_400,
        price_400_na: v.price_400_na,
        price_800: v.price_800,
        price_800_na: v.price_800_na,
        total_units_anaquel: v.total_units_anaquel,
        front_faces: v.front_faces,
        deposit_access: v.deposit_access,
      });
    }
  }

  const visitIds = Array.from(lastVisitByLocation.values()).map((v) => v.id);

  // 3. Depósito (BODEGA) de esas últimas visitas — el anaquel ya no vive
  // en inventory_audits, ver decisión #6 en docs/decisiones-implementacion.md.
  const depositoByVisit = new Map<string, number>();
  if (visitIds.length > 0) {
    const { data: auditsData } = await supabase
      .from("inventory_audits")
      .select("visit_id, zone, quantity")
      .eq("zone", "BODEGA")
      .in("visit_id", visitIds);

    for (const a of (auditsData ?? []) as { visit_id: string; quantity: number }[]) {
      depositoByVisit.set(a.visit_id, (depositoByVisit.get(a.visit_id) ?? 0) + a.quantity);
    }
  }

  return locations.map((location) => {
    const lastVisit = lastVisitByLocation.get(location.id) ?? null;
    return {
      location,
      lastVisit,
      depositoQty: lastVisit ? depositoByVisit.get(lastVisit.id) ?? 0 : 0,
    };
  });
}

// ── Bloque 2: Cobertura Mercaderista ──────────────────────────────

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

// ── Bloque 1.ii: % cobertura material POP + incidencias ──────────
// Criterio de alerta (decisión #8): material POP presente pero su
// preciador NO tiene el precio marcado.

export interface MaterialPopResult {
  pct: number;
  conPop: number;
  total: number;
  incidencias: Location[];
}

export async function getCoberturaMaterialPop(demoMode = false): Promise<MaterialPopResult> {
  const snapshot = await getExecutionSnapshot(demoMode);
  const visitados = snapshot.filter((r) => r.lastVisit !== null);
  const conPop = visitados.filter((r) => r.lastVisit!.pop_present === true);
  const incidencias = conPop.filter((r) => r.lastVisit!.pop_price_tag === false).map((r) => r.location);

  return {
    pct: visitados.length > 0 ? Math.round((conPop.length / visitados.length) * 100 * 10) / 10 : 0,
    conPop: conPop.length,
    total: visitados.length,
    incidencias,
  };
}

// ── Bloque 1.iv: Agotados en depósito ─────────────────────────────

export async function getAgotadosDeposito(demoMode = false): Promise<Location[]> {
  const snapshot = await getExecutionSnapshot(demoMode);
  return snapshot
    .filter((r) => r.lastVisit?.deposit_access === true && r.depositoQty === 0)
    .map((r) => r.location);
}

// ── Bloque 1.iii: Caras frontales bajas ───────────────────────────
// Regla nueva por tipo de cliente (decisión #9): para HIPERMERCADOS /
// SUPERMERCADOS / DIST.VIVER/BEB NO AL / MAYOR VIVE/CONF/BEBI, alerta si
// caras frontales < 4. Para el resto, alerta si no hay presencia de
// producto (no hay "caras" que contar).

const CARAS_4_TIPO_CLIENTE = new Set([
  "HIPERMERCADOS",
  "SUPERMERCADOS",
  "DIST.VIVER/BEB NO AL",
  "MAYOR VIVE/CONF/BEBI",
]);

export interface CarasFrontalesRow {
  location: Location;
  frontFaces: number | null;
  motivo: "CARAS_INSUFICIENTES" | "SIN_PRESENCIA";
}

export async function getCarasFrontalesBajas(demoMode = false): Promise<CarasFrontalesRow[]> {
  const snapshot = await getExecutionSnapshot(demoMode);
  const rows: CarasFrontalesRow[] = [];

  for (const r of snapshot) {
    if (!r.lastVisit) continue;
    const tipo = (r.location.tipo_cliente ?? "").trim().toUpperCase();
    const umbral4 = CARAS_4_TIPO_CLIENTE.has(tipo);

    if (umbral4) {
      if (r.lastVisit.product_present && (r.lastVisit.front_faces ?? 0) < 4) {
        rows.push({ location: r.location, frontFaces: r.lastVisit.front_faces, motivo: "CARAS_INSUFICIENTES" });
      }
    } else if (!r.lastVisit.product_present) {
      rows.push({ location: r.location, frontFaces: null, motivo: "SIN_PRESENCIA" });
    }
  }

  return rows;
}

// ── Bloque 1.i / Bloque 3: Desviación PVP 400g/800g ───────────────

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
    const sector = sectorGroup(r.location.oficina_venta);
    if (!sector) continue; // sin umbral definido fuera de los sectores piloto
    const target = PVP_TARGETS[sector];
    const price04 = r.lastVisit?.price_400_na ? null : r.lastVisit?.price_400 ?? null;
    const price08 = r.lastVisit?.price_800_na ? null : r.lastVisit?.price_800 ?? null;

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

// ── "Índice Tienda Perfecta" (renombrado desde "Tienda Ideal", ─────
// decisión #10 — el mismo cálculo también se muestra en DIENN como
// "Tienda Ideal" hasta que el equipo defina una fórmula distinta).

export interface IndiceTiendaPerfectaResult {
  pct: number;
  cumplen: number;
  total: number;
}

export async function getIndiceTiendaPerfecta(demoMode = false): Promise<IndiceTiendaPerfectaResult> {
  const snapshot = await getExecutionSnapshot(demoMode);
  const evaluable = snapshot.filter((r) => sectorGroup(r.location.oficina_venta) !== null);

  let cumplen = 0;
  for (const r of evaluable) {
    const sector = sectorGroup(r.location.oficina_venta)!;
    const target = PVP_TARGETS[sector];
    const v = r.lastVisit;
    const precioOk =
      !!v &&
      !v.price_400_na &&
      v.price_400 !== null &&
      !isPvpDeviated(v.price_400, target.p400) &&
      !v.price_800_na &&
      v.price_800 !== null &&
      !isPvpDeviated(v.price_800, target.p800);
    const popOk = v?.pop_present === true;
    const inventarioOk = !!v && (v.total_units_anaquel ?? 0) > 0;

    if (precioOk && popOk && inventarioOk) cumplen++;
  }

  return {
    pct: evaluable.length > 0 ? Math.round((cumplen / evaluable.length) * 100 * 10) / 10 : 0,
    cumplen,
    total: evaluable.length,
  };
}
