import type { Sector } from "@/lib/sectors";

// Constantes y tipos de "Clientes sin Recompra" sin dependencia de Supabase,
// para poder importarse desde el Client Component. La query y el criterio
// están en src/lib/clientes-sin-recompra.ts.

/** Días corridos sin pedir a partir de los cuales el cliente está en alerta. */
export const DIAS_SIN_RECOMPRA = 14;

export type MotivoAlerta = "UNA_COMPRA" | "SIN_RECOMPRA" | "AMBOS";

export interface ClienteAlertaRow {
  locationId: string;
  sapCode: string;
  nombre: string;
  sector: Sector;
  municipio: string | null;
  segmento: string;
  cohorte: string | null;
  motivo: MotivoAlerta;
  /** Fechas distintas con venta Radar de Panquecitas. */
  compras: number;
  primeraCompra: string;
  ultimaCompra: string;
  /** Días corridos entre la última compra y la fecha de corte. */
  diasSinPedir: number;
  /** Radar acumulado de Panquecitas (kg). */
  kgAcumulado: number;
}

export interface ClientesSinRecompraResult {
  /** Última fecha con venta Radar en los datos cargados. null = sin datos. */
  fechaCorte: string | null;
  /** Clientes de la cartera con al menos una compra, por sector. */
  compradores: Record<Sector, number>;
  clientes: ClienteAlertaRow[];
}
