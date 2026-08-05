import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PRODUCT_IDS } from "@/data/catalog";
import { getUniverseLocations } from "@/lib/universe";
import { sectorGroup } from "@/lib/sectors";
import { PVP_TARGETS } from "@/data/pvp-thresholds";
import { desviado400, desviado800, type AdminPdvRow, type AdminVisitSnapshot } from "@/lib/admin-metrics";

// ────────────────────────────────────────────────────────────────
// Perfil Administrador — Auditoría, Control de Ejecución en PDV.
// Dos bloques: Ejecución y % Cobertura Mercaderista.
//
// Una sola query por carga de página: getAdminExecutionSnapshot() arma
// una fila por cliente de la cartera y todas las tarjetas y listas del
// dashboard se derivan de ahí con funciones puras (src/lib/admin-metrics.ts),
// que también corren en el cliente para que los filtros de Oficina de Venta
// y Grupo Vendedor sean instantáneos. Antes cada indicador llamaba a su
// propia query y el snapshot se recalculaba 6 veces por render.
//
// El universo es la CARTERA COMPLETA, no solo los clientes con venta SAP:
// la primera lista del Bloque 1 es justamente "clientes sin ventas en SAP",
// y la cobertura de mercaderista se mide sobre el total de la cartera.
//
// Ninguna de estas queries expone cifras de Sell-in ($ ni kg/bultos) al
// perfil Administrador: sap_sell_in_records solo se usa para saber si el
// cliente compró o no (booleano).
// ────────────────────────────────────────────────────────────────

interface VisitRow {
  id: string;
  location_id: string;
  created_at: string;
  pop_present: boolean;
  product_present: boolean;
  price_400: number | null;
  price_400_na: boolean;
  price_800: number | null;
  price_800_na: boolean;
  total_units_anaquel: number | null;
  front_faces: number | null;
  deposit_access: boolean;
}

export async function getAdminExecutionSnapshot(): Promise<AdminPdvRow[]> {
  const supabase = createSupabaseServiceClient();
  const universo = await getUniverseLocations();
  if (universo.length === 0) return [];

  const locationIds = universo.map((l) => l.id);

  // 1. ¿Tiene volumen SAP de Panquecitas? Cuenta tanto quien ya tiene
  // factura (sap_sell_in_records) como quien solo armó pedido aún no
  // facturado (sap_pending_orders). "Sin ventas en SAP" = cartera sin
  // ninguna de las dos. La fecha de primera actividad es la más temprana
  // entre pedido y factura (para el gráfico de activación).
  const [{ data: sellInData }, { data: pendingData }] = await Promise.all([
    supabase
      .from("sap_sell_in_records")
      .select("location_id, date_of_sale")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("quantity_kg", 0)
      .in("location_id", locationIds)
      .order("date_of_sale", { ascending: true }),
    supabase
      .from("sap_pending_orders")
      .select("location_id, order_date")
      .eq("product_id", PRODUCT_IDS.PANQUECITAS)
      .gt("quantity", 0)
      .in("location_id", locationIds)
      .order("order_date", { ascending: true }),
  ]);

  const compradorIds = new Set<string>();
  const primeraCompraByLocation = new Map<string, string>();

  function markActividad(locationId: string, fecha: string | null) {
    compradorIds.add(locationId);
    if (!fecha) return;
    const prev = primeraCompraByLocation.get(locationId);
    if (!prev || fecha < prev) primeraCompraByLocation.set(locationId, fecha);
  }

  for (const r of (sellInData ?? []) as { location_id: string; date_of_sale: string }[]) {
    markActividad(r.location_id, r.date_of_sale);
  }
  for (const r of (pendingData ?? []) as { location_id: string; order_date: string | null }[]) {
    markActividad(r.location_id, r.order_date);
  }

  // 2. Última visita de mercaderista por PDV.
  const { data: visitsData } = await supabase
    .from("mercaderista_visits")
    .select(
      "id, location_id, created_at, pop_present, product_present, price_400, price_400_na, price_800, price_800_na, total_units_anaquel, front_faces, deposit_access"
    )
    .in("location_id", locationIds)
    .order("created_at", { ascending: false });

  const lastVisitByLocation = new Map<string, VisitRow>();
  for (const v of (visitsData ?? []) as VisitRow[]) {
    if (!lastVisitByLocation.has(v.location_id)) lastVisitByLocation.set(v.location_id, v);
  }

  // 3. Unidades en depósito de esas últimas visitas. El anaquel ya no vive
  // en inventory_audits (ver decisión #6), solo la zona BODEGA.
  //
  // inventory_audits.quantity está en la unidad de medida de la variante:
  // bultos para las variantes BULTO, unidades sueltas para las UNIDAD. Para
  // comparar contra un umbral en unidades hay que multiplicar por
  // units_per_bulk (16 para 400g, 12 para 800g, 1 para las sueltas).
  const visitIds = Array.from(lastVisitByLocation.values()).map((v) => v.id);
  const unidadesDepositoByVisit = new Map<string, number>();

  if (visitIds.length > 0) {
    const { data: variantsData } = await supabase.from("variants").select("id, units_per_bulk");
    const unitsPerBulk = new Map(
      ((variantsData ?? []) as { id: string; units_per_bulk: number }[]).map((v) => [v.id, v.units_per_bulk])
    );

    const { data: auditsData } = await supabase
      .from("inventory_audits")
      .select("visit_id, variant_id, quantity")
      .eq("zone", "BODEGA")
      .in("visit_id", visitIds);

    for (const a of (auditsData ?? []) as { visit_id: string; variant_id: string; quantity: number }[]) {
      const unidades = a.quantity * (unitsPerBulk.get(a.variant_id) ?? 1);
      unidadesDepositoByVisit.set(a.visit_id, (unidadesDepositoByVisit.get(a.visit_id) ?? 0) + unidades);
    }
  }

  return universo.map((location) => {
    const visit = lastVisitByLocation.get(location.id) ?? null;
    const sector = sectorGroup(location.oficina_venta);
    const target = sector ? PVP_TARGETS[sector] : null;

    return {
      location,
      comprador: compradorIds.has(location.id),
      primeraCompra: primeraCompraByLocation.get(location.id) ?? null,
      visitado: visit !== null,
      ultimaVisita: visit?.created_at ?? null,
      popPresent: visit?.pop_present ?? null,
      productPresent: visit?.product_present ?? null,
      frontFaces: visit?.front_faces ?? null,
      // price_*_na = "el local no maneja esa presentación": se guarda como
      // precio no observado (null), igual que si no se hubiera visitado.
      price400: visit && !visit.price_400_na ? visit.price_400 : null,
      price800: visit && !visit.price_800_na ? visit.price_800 : null,
      target400: target?.p400 ?? null,
      target800: target?.p800 ?? null,
      unidadesAnaquel: visit?.total_units_anaquel ?? null,
      unidadesDeposito: visit ? unidadesDepositoByVisit.get(visit.id) ?? 0 : 0,
      depositAccess: visit?.deposit_access ?? null,
    };
  });
}

// ── Historial completo de visitas (no solo la última) ─────────────
// getAdminExecutionSnapshot() solo se queda con la última visita por PDV —
// suficiente para las tarjetas y listas de "ahora mismo", pero no permite
// reconstruir una serie en el tiempo. Los gráficos de ejecución semanal
// (POP/precio por semana S2/S4/S6/S8) y de riesgo de stock-out en el
// tiempo necesitan el historial completo para poder recortarlo por
// ventana de fecha en el cliente (mismo patrón de "una sola query, todo el
// filtrado en memoria" que el resto del dashboard).

export async function getAdminVisitHistory(): Promise<AdminVisitSnapshot[]> {
  const supabase = createSupabaseServiceClient();
  const universo = await getUniverseLocations();
  if (universo.length === 0) return [];
  const locationIds = universo.map((l) => l.id);

  const { data: visitsData } = await supabase
    .from("mercaderista_visits")
    .select(
      "id, location_id, created_at, pop_present, price_400, price_400_na, price_800, price_800_na, total_units_anaquel, deposit_access"
    )
    .in("location_id", locationIds)
    .order("created_at", { ascending: true });

  const visits = (visitsData ?? []) as {
    id: string;
    location_id: string;
    created_at: string;
    pop_present: boolean;
    price_400: number | null;
    price_400_na: boolean;
    price_800: number | null;
    price_800_na: boolean;
    total_units_anaquel: number | null;
    deposit_access: boolean;
  }[];
  if (visits.length === 0) return [];

  // Unidades en depósito por visita — mismo criterio de conversión
  // bultos→unidades que getInventarioDepositoKg en dienn-queries.ts.
  const visitIds = visits.map((v) => v.id);
  const { data: variantsData } = await supabase.from("variants").select("id, units_per_bulk");
  const unitsPerBulk = new Map(
    ((variantsData ?? []) as { id: string; units_per_bulk: number }[]).map((v) => [v.id, v.units_per_bulk])
  );

  const { data: auditsData } = await supabase
    .from("inventory_audits")
    .select("visit_id, variant_id, quantity")
    .eq("zone", "BODEGA")
    .in("visit_id", visitIds);

  const unidadesDepositoByVisit = new Map<string, number>();
  for (const a of (auditsData ?? []) as { visit_id: string; variant_id: string; quantity: number }[]) {
    const unidades = a.quantity * (unitsPerBulk.get(a.variant_id) ?? 1);
    unidadesDepositoByVisit.set(a.visit_id, (unidadesDepositoByVisit.get(a.visit_id) ?? 0) + unidades);
  }

  return visits.map((v) => ({
    locationId: v.location_id,
    createdAt: v.created_at,
    popPresent: v.pop_present,
    price400: v.price_400_na ? null : v.price_400,
    price800: v.price_800_na ? null : v.price_800,
    unidadesAnaquel: v.total_units_anaquel,
    unidadesDeposito: unidadesDepositoByVisit.get(v.id) ?? 0,
    depositAccess: v.deposit_access,
  }));
}

// ── "Índice Tienda Perfecta" ──────────────────────────────────────
// Se conserva porque el perfil DIENN lo muestra como "Tienda Ideal"
// (decisión #10). El dashboard de Admin ya no lo usa: sus tarjetas son
// las cinco definidas en src/lib/admin-metrics.ts.

export interface IndiceTiendaPerfectaResult {
  pct: number;
  cumplen: number;
  total: number;
}

export async function getIndiceTiendaPerfecta(): Promise<IndiceTiendaPerfectaResult> {
  const rows = await getAdminExecutionSnapshot();
  const evaluable = rows.filter((r) => r.target400 !== null);

  let cumplen = 0;
  for (const r of evaluable) {
    // Aquí sí se exigen ambos precios observados: la "tienda perfecta" es un
    // índice de ejecución completa, no la medición de precio del Bloque 1.
    const precioOk = r.price400 !== null && r.price800 !== null && !desviado400(r) && !desviado800(r);
    const popOk = r.popPresent === true;
    const inventarioOk = (r.unidadesAnaquel ?? 0) > 0;

    if (precioOk && popOk && inventarioOk) cumplen++;
  }

  return {
    pct: evaluable.length > 0 ? Math.round((cumplen / evaluable.length) * 1000) / 10 : 0,
    cumplen,
    total: evaluable.length,
  };
}
