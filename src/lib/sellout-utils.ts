// Tipos y funciones puras del motor de Sell-Out (sin dependencias de
// servidor/Supabase) para poder importarse también desde Client
// Components — ver src/lib/sellout-queries.ts, que las usa junto con
// computeSellOut() (server-only, hace las consultas a Supabase).
import { VARIANT_IDS } from "@/data/catalog";
import { DIAS_HABILES_POR_QUINCENA } from "@/lib/business-days";
import type { Location } from "@/types";

export type Presentacion = "400g" | "800g";

export interface SellOutRecord {
  locationId: string;
  name: string;
  sapCode: string | null;
  sector: string | null;
  zona: string | null; // locations.region ("Territorio de ventas2")
  asesor: string | null; // locations.asesor_encargado
  fuente: "Calculado" | "Reportado_B2B";
  roundIndex: number; // índice de la ronda "desde" (0 = Ronda 1→2, etc.)
  roundLabel: string; // "Ronda 1 → Ronda 2"
  variant: Presentacion;
  sellInKg: number;
  sellOutKg: number;
  inventarioPromedioKg: number;
  ajusteInventario: boolean;
}

export interface VisitRow {
  id: string;
  location_id: string;
  created_at: string;
  anaquel_400_units: number | null;
  anaquel_800_units: number | null;
  deposit_access: boolean;
}

export function presentacionFromVariant(variantId: string | null): Presentacion | null {
  if (variantId === VARIANT_IDS.PANQ_04KG_BULTO || variantId === VARIANT_IDS.PANQ_04KG_UNIDAD) return "400g";
  if (variantId === VARIANT_IDS.PANQ_08KG_BULTO || variantId === VARIANT_IDS.PANQ_08KG_UNIDAD) return "800g";
  return null;
}

/** Visita más reciente de un cliente cuya fecha caiga dentro de la ventana de la ronda. */
export function pickVisitForRound(visits: VisitRow[], start: string, end: string): VisitRow | null {
  const inWindow = visits.filter((v) => {
    const d = v.created_at.slice(0, 10);
    return d >= start && d <= end;
  });
  if (inWindow.length === 0) return null;
  return inWindow.reduce((latest, v) => (v.created_at > latest.created_at ? v : latest));
}

// ── Agregados para el dashboard ────────────────────────────────────

export interface SellOutPorRondaPoint {
  roundLabel: string;
  sellInKg: number;
  sellOutKg: number;
  inventarioPromedioKg: number;
}

export function aggregateByRound(records: SellOutRecord[]): SellOutPorRondaPoint[] {
  const byRound = new Map<number, SellOutPorRondaPoint & { count: number }>();
  for (const r of records) {
    if (!byRound.has(r.roundIndex)) {
      byRound.set(r.roundIndex, { roundLabel: r.roundLabel, sellInKg: 0, sellOutKg: 0, inventarioPromedioKg: 0, count: 0 });
    }
    const entry = byRound.get(r.roundIndex)!;
    entry.sellInKg += r.sellInKg;
    entry.sellOutKg += r.sellOutKg;
    entry.inventarioPromedioKg += r.inventarioPromedioKg;
    entry.count += 1;
  }
  return Array.from(byRound.entries())
    .sort(([a], [b]) => a - b)
    .map(([, v]) => ({
      roundLabel: v.roundLabel,
      sellInKg: Math.round(v.sellInKg * 10) / 10,
      sellOutKg: Math.round(v.sellOutKg * 10) / 10,
      inventarioPromedioKg: v.count > 0 ? Math.round((v.inventarioPromedioKg / v.count) * 10) / 10 : 0,
    }));
}

// ── Sell-Out desglosado por cliente (por ronda/semana) ─────────────
// Una fila por (cliente, ronda), sumando las dos presentaciones (400g+800g).
// Es la vista tipo lista descargable que reemplaza al indicador acumulado.

export interface SellOutClienteRondaRow {
  locationId: string;
  name: string;
  sapCode: string | null;
  fuente: "Calculado" | "Reportado_B2B";
  roundIndex: number;
  roundLabel: string;
  sellInKg: number;
  sellOutKg: number;
  inventarioPromedioKg: number;
  /** true si en esa quincena hubo clamp a 0 por Sell-Out negativo (mercancía en tránsito). */
  ajusteInventario: boolean;
}

export function aggregateSellOutPorCliente(records: SellOutRecord[]): SellOutClienteRondaRow[] {
  const byKey = new Map<string, SellOutClienteRondaRow & { invCount: number }>();
  for (const r of records) {
    const key = `${r.locationId}__${r.roundIndex}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        locationId: r.locationId,
        name: r.name,
        sapCode: r.sapCode,
        fuente: r.fuente,
        roundIndex: r.roundIndex,
        roundLabel: r.roundLabel,
        sellInKg: 0,
        sellOutKg: 0,
        inventarioPromedioKg: 0,
        invCount: 0,
        ajusteInventario: false,
      });
    }
    const e = byKey.get(key)!;
    e.sellInKg += r.sellInKg;
    e.sellOutKg += r.sellOutKg;
    e.inventarioPromedioKg += r.inventarioPromedioKg;
    e.invCount += 1;
    e.ajusteInventario = e.ajusteInventario || r.ajusteInventario;
  }

  return Array.from(byKey.values())
    .map(({ invCount, ...row }) => ({
      ...row,
      sellInKg: Math.round(row.sellInKg * 10) / 10,
      sellOutKg: Math.round(row.sellOutKg * 10) / 10,
      inventarioPromedioKg: invCount > 0 ? Math.round((row.inventarioPromedioKg / invCount) * 10) / 10 : 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.roundIndex - b.roundIndex);
}

export interface MixProductoTonPoint {
  variant: Presentacion;
  toneladas: number;
}

/** Mix de Producto: toneladas vendidas (Sell-Out) acumuladas por presentación. */
export function aggregateMixProducto(records: SellOutRecord[]): MixProductoTonPoint[] {
  const kgByVariant: Record<Presentacion, number> = { "400g": 0, "800g": 0 };
  for (const r of records) kgByVariant[r.variant] += r.sellOutKg;
  return (["400g", "800g"] as Presentacion[]).map((variant) => ({
    variant,
    toneladas: Math.round((kgByVariant[variant] / 1000) * 100) / 100,
  }));
}

export interface RotacionResult {
  rotacionTotalKg: number;
  diasInventarioEnCalle: number;
}

export function computeRotacion(records: SellOutRecord[]): RotacionResult {
  const totalSellOut = records.reduce((s, r) => s + r.sellOutKg, 0);
  const invPromEntries = records.filter((r) => r.inventarioPromedioKg > 0);
  const invPromedio =
    invPromEntries.length > 0 ? invPromEntries.reduce((s, r) => s + r.inventarioPromedioKg, 0) / invPromEntries.length : 0;

  // Días HÁBILES cubiertos por ronda (≈10 días hábiles entre rondas, excluyendo
  // fines de semana) × número de pares con dato. Ver business-days.ts.
  const pares = new Set(records.map((r) => r.roundIndex)).size;
  const diasTotales = pares * DIAS_HABILES_POR_QUINCENA;
  const kgPorDia = diasTotales > 0 ? totalSellOut / diasTotales : 0;

  return {
    rotacionTotalKg: Math.round(totalSellOut * 10) / 10,
    diasInventarioEnCalle: kgPorDia > 0 ? Math.round(invPromedio / kgPorDia) : 0,
  };
}

export function filterRecords(
  records: SellOutRecord[],
  opts: { sector?: string | null; zona?: string; asesor?: string; fuente?: "Calculado" | "Reportado_B2B" | "TODOS" }
): SellOutRecord[] {
  return records.filter((r) => {
    if (opts.sector && r.sector !== opts.sector) return false;
    if (opts.zona && r.zona !== opts.zona) return false;
    if (opts.asesor && r.asesor !== opts.asesor) return false;
    if (opts.fuente && opts.fuente !== "TODOS" && r.fuente !== opts.fuente) return false;
    return true;
  });
}

export function getAvailableZonasYAsesores(locations: Location[]): { zonas: string[]; asesores: string[] } {
  const zonas = new Set<string>();
  const asesores = new Set<string>();
  for (const l of locations) {
    if (l.region) zonas.add(l.region);
    if (l.asesor_encargado) asesores.add(l.asesor_encargado);
  }
  return { zonas: Array.from(zonas).sort(), asesores: Array.from(asesores).sort() };
}
