import type { Sector } from "@/lib/sectors";
import { contarDiasHabiles } from "@/lib/business-days";

// Constantes, tipos y cálculo de "Impacto bloqueo 400g" sin dependencia de
// Supabase, para poder importarse desde el Client Component. La query está en
// src/lib/impacto-400g.ts.
//
// Decisión DIENN (23-09-2026): la presentación de 400g se bloqueó para la venta
// desde el 15-09-2026. La base de comparación son las 4 semanas previas al
// bloqueo (18-08 a 14-09, 20 días hábiles): su ritmo por día hábil es lo que
// se habría vendido si el 400g siguiera activo.

/** Primer día sin venta de 400g. */
export const FECHA_BLOQUEO_400G = "2026-09-15";
/** Período base: las 4 semanas anteriores al bloqueo (ambas fechas incluidas). */
export const BASE_DESDE_400G = "2026-08-18";
export const BASE_HASTA_400G = "2026-09-14";

/** Días hábiles de un mes, para llevar el ritmo semanal a un estimado mensual. */
export const DIAS_HABILES_MES = 22;

/**
 * Qué compraba el cliente en el período base. NUEVO = no compró en la base
 * y apareció después del bloqueo.
 */
export type GrupoPresentacion = "SOLO_400" | "AMBAS" | "SOLO_800" | "NUEVO";

/** kg Radar de Panquecitas por día hábil y ciudad, separado por presentación. */
export interface Impacto400gDia {
  fecha: string;
  sector: Sector;
  kg400: number;
  kg800: number;
}

export interface Impacto400gCliente {
  locationId: string;
  sapCode: string;
  nombre: string;
  sector: Sector;
  municipio: string | null;
  segmento: string;
  grupo: GrupoPresentacion;
  kg400Base: number;
  kg800Base: number;
  /** Desde el bloqueo hasta la fecha de corte. */
  kg400Post: number;
  kg800Post: number;
}

export interface Impacto400gResult {
  /** Última fecha con venta Radar de Panquecitas. null = sin datos. */
  fechaCorte: string | null;
  dias: Impacto400gDia[];
  /** Clientes con compra en la base o después del bloqueo. */
  clientes: Impacto400gCliente[];
}

export interface ResumenImpacto400g {
  diasBase: number;
  /** Días hábiles desde el bloqueo hasta el corte (0 si el corte es anterior). */
  diasPost: number;
  kg400Base: number;
  kg800Base: number;
  /** % del volumen base que era 400g. */
  pct400Base: number | null;
  /** kg por día hábil en la base. */
  ritmo400Base: number;
  ritmo800Base: number;
  kg400Post: number;
  kg800Post: number;
  /** Lo que se habría vendido desde el bloqueo al ritmo base. */
  esperado400Post: number;
  esperado800Post: number;
  /** 400g que se dejó de vender: esperado − lo que todavía salió (remanente). */
  kg400NoVendido: number;
  /** Cuánto subió el 800g sobre su ritmo base (negativo = bajó). */
  ganancia800: number;
  /** ganancia800 ÷ kg400NoVendido, en %. null si no hay pérdida que medir. */
  sustitucionPct: number | null;
  /** kg400NoVendido − ganancia800. */
  perdidaNeta: number;
}

export function resumirImpacto400g(dias: Impacto400gDia[], fechaCorte: string | null): ResumenImpacto400g {
  const diasBase = contarDiasHabiles(BASE_DESDE_400G, BASE_HASTA_400G);
  const diasPost =
    fechaCorte && fechaCorte >= FECHA_BLOQUEO_400G ? contarDiasHabiles(FECHA_BLOQUEO_400G, fechaCorte) : 0;

  let kg400Base = 0;
  let kg800Base = 0;
  let kg400Post = 0;
  let kg800Post = 0;
  for (const d of dias) {
    if (d.fecha >= BASE_DESDE_400G && d.fecha <= BASE_HASTA_400G) {
      kg400Base += d.kg400;
      kg800Base += d.kg800;
    } else if (d.fecha >= FECHA_BLOQUEO_400G) {
      kg400Post += d.kg400;
      kg800Post += d.kg800;
    }
  }

  const ritmo400Base = kg400Base / diasBase;
  const ritmo800Base = kg800Base / diasBase;
  const esperado400Post = ritmo400Base * diasPost;
  const esperado800Post = ritmo800Base * diasPost;
  const kg400NoVendido = esperado400Post - kg400Post;
  const ganancia800 = kg800Post - esperado800Post;

  return {
    diasBase,
    diasPost,
    kg400Base,
    kg800Base,
    pct400Base: kg400Base + kg800Base > 0 ? (kg400Base / (kg400Base + kg800Base)) * 100 : null,
    ritmo400Base,
    ritmo800Base,
    kg400Post,
    kg800Post,
    esperado400Post,
    esperado800Post,
    kg400NoVendido,
    ganancia800,
    sustitucionPct: kg400NoVendido > 0 ? (ganancia800 / kg400NoVendido) * 100 : null,
    perdidaNeta: kg400NoVendido - ganancia800,
  };
}

/** Lunes (ISO "YYYY-MM-DD") de la semana de una fecha. */
export function lunesDe(fecha: string): string {
  const t = Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // lunes=0 .. domingo=6
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
}

