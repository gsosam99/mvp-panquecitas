// Combinaciones del piloto: precio × comunicación × ciudad (DIENN, 08-09-2026).
//
// Puro, sin dependencias de servidor, para poder importarse también desde
// Client Components — mismo criterio que sectors.ts, cohortes.ts y
// segmentos.ts.
//
// El piloto no corrió una sola dinámica: cada grupo vendedor trabajó con un
// precio y un eje de comunicación distintos. Comparar el total de Cumaná
// contra el de Cabudare mezcla las dos variables; la unidad de análisis real
// es la COMBINACIÓN.
//
// El grupo vendedor es lo que identifica a cada una — es el único campo de la
// cartera que las distingue, porque precio y comunicación no viven en ninguna
// tabla: son la configuración del experimento.
//
// Los 8 grupos de la cartera están cubiertos: U27, U28, U29, U30 en Cumaná y
// W01, W02, W03, W05 en Cabudare. Un grupo nuevo que no esté acá no cae en
// ninguna combinación y se reporta aparte, para que no desaparezca en silencio.

import type { Sector } from "@/lib/sectors";

export type EjeComunicacion = "Practicidad" | "Nutrición";

export interface CombinacionPiloto {
  /** Orden y etiqueta: "Combinación 1". */
  numero: number;
  sector: Sector;
  /**
   * Precio de CADA presentación. Son dos, no una: el piloto vende la de 800 g
   * y la de 400 g, y el precio de la combinación es el par completo. Con solo
   * el de 800 g la tabla decía media verdad (DIENN, 08-09-2026).
   */
  precio800: number;
  precio400: number;
  comunicacion: EjeComunicacion;
  /** Grupos vendedores de SAP que corrieron esta combinación. */
  gruposVendedores: readonly string[];
}

export const COMBINACIONES: readonly CombinacionPiloto[] = [
  {
    numero: 1,
    sector: "cumana",
    precio800: 2.2,
    precio400: 1.2,
    comunicacion: "Practicidad",
    gruposVendedores: ["U27", "U28", "U30"],
  },
  {
    numero: 2,
    sector: "cumana",
    precio800: 2.2,
    precio400: 1.2,
    comunicacion: "Nutrición",
    gruposVendedores: ["U29"],
  },
  {
    numero: 3,
    sector: "barquisimeto_este",
    precio800: 2.85,
    precio400: 1.6,
    comunicacion: "Practicidad",
    gruposVendedores: ["W03", "W05"],
  },
  {
    numero: 4,
    sector: "barquisimeto_este",
    precio800: 2.85,
    precio400: 1.6,
    comunicacion: "Nutrición",
    gruposVendedores: ["W01", "W02"],
  },
];

/** Etiqueta para los PDV cuyo grupo vendedor no cae en ninguna combinación. */
export const COMBINACION_SIN_ASIGNAR = "Sin combinación";

// Índice grupo vendedor (normalizado) → número de combinación. Se arma una
// sola vez: la búsqueda se hace por cliente y son miles.
const COMBINACION_POR_GRUPO = new Map<string, number>();
for (const c of COMBINACIONES) {
  for (const g of c.gruposVendedores) COMBINACION_POR_GRUPO.set(g.trim().toUpperCase(), c.numero);
}

/**
 * Combinación de un cliente según su grupo vendedor, o `null` si su grupo no
 * está en ninguna.
 *
 * Con trim y mayúsculas porque el grupo sale de un Excel: "w03" y " W03 " son
 * el mismo grupo y comparar literal los dejaría fuera sin avisar.
 */
export function combinacionDeGrupo(grupoVendedor: string | null | undefined): number | null {
  return COMBINACION_POR_GRUPO.get((grupoVendedor ?? "").trim().toUpperCase()) ?? null;
}

/** "Combinación 3". */
export function nombreCombinacion(numero: number): string {
  return `Combinación ${numero}`;
}
