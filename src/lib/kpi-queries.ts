import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { PRODUCT_IDS, VARIANT_IDS } from "@/data/catalog";
import type { KpiData } from "@/types";

interface DateFilter {
  from: string;
  to: string;
}

interface SellInRow {
  quantity_kg: number;
  product_id: string;
}

interface AuditRow {
  quantity: number;
  variants: { presentation_kg: number } | null;
}

interface PromoRow {
  samples_given: number;
  conversions_tracked: number;
}

export async function getKpiData(filter?: DateFilter): Promise<KpiData> {
  const supabase = createSupabaseServiceClient();

  const from = filter?.from ?? "2000-01-01";
  const to = filter?.to ?? new Date().toISOString().split("T")[0];

  // ── Sell-in PAN y Panquecitas ──────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sellInData } = await (supabase as any)
    .from("sap_sell_in_records")
    .select("quantity_kg, product_id")
    .gte("date_of_sale", from)
    .lte("date_of_sale", to);

  const sellIn = (sellInData ?? []) as SellInRow[];

  const panSellInKg = sellIn
    .filter((r) => r.product_id === PRODUCT_IDS.HARINA_PAN)
    .reduce((sum, r) => sum + r.quantity_kg, 0);

  const panquecitasSellInKg = sellIn
    .filter((r) => r.product_id === PRODUCT_IDS.PANQUECITAS)
    .reduce((sum, r) => sum + r.quantity_kg, 0);

  const relativePct = panSellInKg > 0
    ? Math.round((panquecitasSellInKg / panSellInKg) * 100 * 10) / 10
    : 0;

  // ── Inventario Panquecitas en anaquel (último disponible) ──
  const { data: auditData } = await supabase
    .from("inventory_audits")
    .select("quantity, variants(presentation_kg)")
    .eq("zone", "ANAQUEL")
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lte("created_at", `${to}T23:59:59.999Z`);

  const audits = (auditData ?? []) as unknown as AuditRow[];

  const panquecitasInventoryKg = audits
    .reduce((sum, r) => sum + r.quantity * (r.variants?.presentation_kg ?? 0), 0);

  // ── Actividad promotoras ───────────────────────────────────
  const { data: promoData } = await supabase
    .from("promotion_activities")
    .select("samples_given, conversions_tracked")
    .gte("report_date", from)
    .lte("report_date", to);

  const promos = (promoData ?? []) as PromoRow[];

  const promotoraSamples = promos.reduce((sum, r) => sum + r.samples_given, 0);
  const promotoraConversions = promos.reduce((sum, r) => sum + r.conversions_tracked, 0);
  const conversionRate = promotoraSamples > 0
    ? Math.round((promotoraConversions / promotoraSamples) * 100 * 10) / 10
    : 0;

  return {
    panSellInKg: Math.round(panSellInKg * 10) / 10,
    panquecitasSellInKg: Math.round(panquecitasSellInKg * 10) / 10,
    relativePct,
    panquecitasInventoryKg: Math.round(panquecitasInventoryKg * 10) / 10,
    promotoraSamples,
    promotoraConversions,
    conversionRate,
  };
}

export interface MonthlyPoint {
  month: string;
  pan_kg: number;
  panquecitas_kg: number;
}

// ── Field data queries ────────────────────────────────────────────────────────

export interface PricePoint {
  date: string;
  price_04: number | null;
  price_08: number | null;
}

export async function getPriceTrend(days = 30): Promise<PricePoint[]> {
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("inventory_audits")
    .select("created_at, unit_price_observed, variant_id")
    .eq("zone", "ANAQUEL")
    .not("unit_price_observed", "is", null)
    .gt("unit_price_observed", 0)
    .gte("created_at", `${since}T00:00:00.000Z`)
    .order("created_at");

  if (!data) return [];

  const byDate = new Map<
    string,
    { sum04: number; count04: number; sum08: number; count08: number }
  >();

  for (const row of data as {
    created_at: string;
    unit_price_observed: number;
    variant_id: string;
  }[]) {
    const date = row.created_at.split("T")[0];
    if (!byDate.has(date))
      byDate.set(date, { sum04: 0, count04: 0, sum08: 0, count08: 0 });
    const entry = byDate.get(date)!;
    if (row.variant_id === VARIANT_IDS.PANQ_04KG_UNIDAD) {
      entry.sum04 += row.unit_price_observed;
      entry.count04++;
    } else if (row.variant_id === VARIANT_IDS.PANQ_08KG_UNIDAD) {
      entry.sum08 += row.unit_price_observed;
      entry.count08++;
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum04, count04, sum08, count08 }]) => ({
      date: date.slice(5), // MM-DD
      price_04: count04 > 0 ? Math.round((sum04 / count04) * 100) / 100 : null,
      price_08: count08 > 0 ? Math.round((sum08 / count08) * 100) / 100 : null,
    }));
}

export interface PromotoraPoint {
  date: string;
  samples: number;
  conversions: number;
}

export async function getPromotoraDailyActivity(
  days = 30
): Promise<PromotoraPoint[]> {
  const supabase = createSupabaseServiceClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const { data } = await supabase
    .from("promotion_activities")
    .select("report_date, samples_given, conversions_tracked")
    .gte("report_date", since)
    .order("report_date");

  if (!data) return [];

  const byDate = new Map<string, { samples: number; conversions: number }>();
  for (const row of data as {
    report_date: string;
    samples_given: number;
    conversions_tracked: number;
  }[]) {
    if (!byDate.has(row.report_date))
      byDate.set(row.report_date, { samples: 0, conversions: 0 });
    const entry = byDate.get(row.report_date)!;
    entry.samples += row.samples_given;
    entry.conversions += row.conversions_tracked;
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { samples, conversions }]) => ({
      date: date.slice(5),
      samples,
      conversions,
    }));
}

export interface ConversionLocation {
  location: string;
  samples: number;
  conversions: number;
  rate: number;
}

export async function getConversionByLocation(): Promise<ConversionLocation[]> {
  const supabase = createSupabaseServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("promotion_activities")
    .select("samples_given, conversions_tracked, locations(name)");

  if (!data) return [];

  const byLoc = new Map<string, { samples: number; conversions: number }>();
  for (const row of data as {
    samples_given: number;
    conversions_tracked: number;
    locations: { name: string } | null;
  }[]) {
    const name = row.locations?.name ?? "Desconocido";
    if (!byLoc.has(name)) byLoc.set(name, { samples: 0, conversions: 0 });
    const entry = byLoc.get(name)!;
    entry.samples += row.samples_given;
    entry.conversions += row.conversions_tracked;
  }

  return Array.from(byLoc.entries())
    .filter(([, { samples }]) => samples > 0)
    .map(([location, { samples, conversions }]) => ({
      location,
      samples,
      conversions,
      rate: Math.round((conversions / samples) * 100 * 10) / 10,
    }))
    .sort((a, b) => b.rate - a.rate);
}

export async function getMonthlySellIn(months = 12): Promise<MonthlyPoint[]> {
  const supabase = createSupabaseServiceClient();
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("sap_sell_in_records")
    .select("date_of_sale, quantity_kg, product_id")
    .gte("date_of_sale", sinceStr)
    .order("date_of_sale");

  if (!data) return [];

  const byMonth = new Map<string, { pan_kg: number; panquecitas_kg: number }>();
  for (const row of data as { date_of_sale: string; quantity_kg: number; product_id: string }[]) {
    const month = row.date_of_sale.slice(0, 7); // YYYY-MM
    if (!byMonth.has(month)) byMonth.set(month, { pan_kg: 0, panquecitas_kg: 0 });
    const entry = byMonth.get(month)!;
    if (row.product_id === PRODUCT_IDS.HARINA_PAN) entry.pan_kg += row.quantity_kg;
    else if (row.product_id === PRODUCT_IDS.PANQUECITAS) entry.panquecitas_kg += row.quantity_kg;
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { pan_kg, panquecitas_kg }]) => ({
      month,
      pan_kg: Math.round(pan_kg * 10) / 10,
      panquecitas_kg: Math.round(panquecitas_kg * 10) / 10,
    }));
}
