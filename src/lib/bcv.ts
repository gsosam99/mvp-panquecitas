import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

// ────────────────────────────────────────────────────────────────
// Tasa BCV y corrección de precios capturados en Bs.
//
// El wizard de campo permite elegir la moneda: en "Bs." convierte a USD antes
// de guardar (ver AuditWizard.toUsd + /api/bcv-rate), así que mercaderista_visits
// debería tener siempre USD. Cuando el selector queda en "USD" y el
// mercaderista teclea el monto en bolívares, el precio entra crudo — y contra
// objetivos de 1,2–2,85 USD se ve como un sobreprecio gigante.
//
// Regla acordada con DIENN (18-08-2026): un precio de visita > 100 no puede ser
// USD (el objetivo más alto es 2,85), así que se asume Bs y se divide entre la
// tasa BCV del DÍA DE LA VISITA.
// ────────────────────────────────────────────────────────────────

/** Sobre este monto, un precio de visita se interpreta como bolívares. */
export const PRECIO_BS_UMBRAL = 100;

const DOLAR_API = "https://ve.dolarapi.com/v1/dolares/oficial";

interface DolarApiResponse {
  promedio?: number;
  promedio_real?: number;
  valor?: number;
}

/** Tasa oficial vigente según la API pública del BCV. null si falla. */
export async function fetchBcvRate(): Promise<number | null> {
  try {
    const res = await fetch(DOLAR_API, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as DolarApiResponse;
    const rate = data.promedio ?? data.promedio_real ?? data.valor;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch (error) {
    console.error("[fetchBcvRate]", error);
    return null;
  }
}

/** Devuelve la tasa a aplicar en una fecha "YYYY-MM-DD" (o null si no hay ninguna). */
export type BcvRateLookup = (fecha: string | null) => number | null;

/**
 * Carga el histórico de bcv_rates y, de paso, cachea la tasa de hoy si falta
 * (así el histórico se va armando solo: la API del BCV no expone fechas
 * pasadas). Todo es best-effort — si la tabla no existe todavía o la API está
 * caída, se devuelve un lookup que no convierte nada y los precios quedan como
 * están, que es el comportamiento anterior.
 */
export async function getBcvRateLookup(): Promise<BcvRateLookup> {
  const supabase = createSupabaseServiceClient();
  const rates = new Map<string, number>();

  try {
    const { data } = await supabase.from("bcv_rates").select("fecha, tasa");
    for (const r of (data ?? []) as { fecha: string; tasa: number }[]) {
      rates.set(r.fecha.slice(0, 10), Number(r.tasa));
    }
  } catch (error) {
    console.error("[getBcvRateLookup] no se pudo leer bcv_rates:", error);
  }

  // Tasa de hoy: si no está guardada, se consulta y se guarda (no crítico).
  const hoy = new Date().toISOString().slice(0, 10);
  if (!rates.has(hoy)) {
    const tasa = await fetchBcvRate();
    if (tasa) {
      rates.set(hoy, tasa);
      try {
        await supabase.from("bcv_rates").upsert({ fecha: hoy, tasa }, { onConflict: "fecha" });
      } catch (error) {
        console.error("[getBcvRateLookup] no se pudo cachear la tasa de hoy:", error);
      }
    }
  }

  if (rates.size === 0) return () => null;

  // Fechas ordenadas para buscar la tasa vigente en una fecha dada.
  const fechas = Array.from(rates.keys()).sort();

  return (fecha: string | null): number | null => {
    if (!fecha) return rates.get(fechas[fechas.length - 1]) ?? null;
    const dia = fecha.slice(0, 10);
    const exacta = rates.get(dia);
    if (exacta) return exacta;
    // La más reciente ANTERIOR o igual a la fecha pedida; si la visita es más
    // vieja que todo el histórico, la primera que se conozca.
    let elegida: string | null = null;
    for (const f of fechas) {
      if (f <= dia) elegida = f;
      else break;
    }
    return rates.get(elegida ?? fechas[0]) ?? null;
  };
}

/**
 * Precio de visita normalizado a USD: si supera el umbral se asume que quedó
 * cargado en Bs y se divide entre la tasa del día de la visita. Sin tasa
 * disponible se devuelve tal cual (mejor el dato crudo que uno inventado).
 */
export function precioVisitaEnUsd(
  precio: number | null,
  fechaVisita: string | null,
  rateAt: BcvRateLookup
): number | null {
  if (precio === null || precio <= PRECIO_BS_UMBRAL) return precio;
  const tasa = rateAt(fechaVisita);
  if (!tasa) return precio;
  return Math.round((precio / tasa) * 100) / 100;
}
