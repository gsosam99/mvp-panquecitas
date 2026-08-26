import { getVolumenLocations, getUniverseLocations } from "@/lib/universe";
import {
  DISTRIBUIDORAS_INTERMEDIARIAS_SAP_CODES,
  FRANQUICIADAS_INDIRECTO_SAP_CODES,
  sectorGroup,
  SECTOR_LABELS,
  type Sector,
} from "@/lib/sectors";
import { COHORTES, esFueraDeCartera } from "@/lib/cohortes";
import type { Location } from "@/types";

// Cuadro informativo de la estructura del piloto (grupos vendedores,
// vendedores, franquiciados, PDV por tanda de incorporación) — pedido por el
// usuario (26-08-2026) para tener estos números a mano sin construir una
// sección nueva en el dashboard de DIENN.

export interface CohorteResumen {
  nombre: string;
  desde: string | null;
  cantidad: number;
}

export interface EsquemaAtencionResumen {
  directos: number;
  indirectos: number;
  mixtos: number;
  /** Sin "Esquema de Atención" cargado en la Cartera de Clientes. */
  sinEsquema: number;
}

export interface SectorResumen extends EsquemaAtencionResumen {
  sector: Sector;
  label: string;
  total: number;
}

export interface ResumenPiloto {
  totalPdv: number;
  pdvEnCartera: number;
  pdvFueraDeCartera: number;
  gruposVendedores: string[];
  cantidadVendedores: number;
  franquiciados: number;
  distribuidorasIntermediarias: number;
  porCohorte: CohorteResumen[];
  porSector: SectorResumen[];
}

const PILOT_SECTOR_KEYS: Sector[] = ["cumana", "barquisimeto_este"];

function contarEsquemas(locations: Location[]): EsquemaAtencionResumen {
  const resumen: EsquemaAtencionResumen = { directos: 0, indirectos: 0, mixtos: 0, sinEsquema: 0 };
  for (const l of locations) {
    const esquema = (l.esquema_atencion ?? "").trim().toLowerCase();
    if (esquema === "directo") resumen.directos++;
    else if (esquema === "indirecto") resumen.indirectos++;
    else if (esquema === "mixto") resumen.mixtos++;
    else resumen.sinEsquema++;
  }
  return resumen;
}

export async function getResumenPiloto(): Promise<ResumenPiloto> {
  // getVolumenLocations() ya excluye las distribuidoras/franquiciadas (ver
  // isExcludedDistribuidor en sectors.ts) — son fijas por código SAP, no hace
  // falta consultarlas: su cantidad es el tamaño de esas listas.
  const [volumen, universo] = await Promise.all([getVolumenLocations(), getUniverseLocations()]);

  const gruposVendedores = [...new Set(volumen.map((l) => l.grupo_vendedor).filter((g): g is string => !!g))].sort();

  const vendedores = new Set(
    volumen.map((l) => l.asesor_encargado?.trim()).filter((a): a is string => !!a)
  );

  const idsFueraDeCartera = new Set(volumen.filter((l) => esFueraDeCartera(l.cohorte)).map((l) => l.id));

  const porCohorteMap = new Map<string, number>();
  for (const l of volumen) {
    const nombre = l.cohorte ?? "Sin cohorte asignada";
    porCohorteMap.set(nombre, (porCohorteMap.get(nombre) ?? 0) + 1);
  }
  // En el orden de COHORTES (cronológico) + lo que no calce al final
  // ("Fuera de cartera", "Sin cohorte asignada", o cualquier cohorte nueva
  // que se agregue en cohortes.ts sin actualizar este archivo).
  const nombresConocidos = new Set(COHORTES.map((c) => c.nombre));
  const porCohorte: CohorteResumen[] = [
    ...COHORTES.map((c) => ({ nombre: c.nombre, desde: c.desde, cantidad: porCohorteMap.get(c.nombre) ?? 0 })),
    ...[...porCohorteMap.entries()]
      .filter(([nombre]) => !nombresConocidos.has(nombre))
      .map(([nombre, cantidad]) => ({ nombre, desde: null, cantidad })),
  ];

  // PDV por ciudad (sector) y, dentro de cada una, por esquema de atención
  // (Directo/Indirecto/Mixto) — sobre el TOTAL (volumen), igual base que la
  // tarjeta "Total PDV" de arriba, no solo cartera.
  const porSector: SectorResumen[] = PILOT_SECTOR_KEYS.map((sector) => {
    const locsSector = volumen.filter((l) => sectorGroup(l.oficina_venta) === sector);
    return {
      sector,
      label: SECTOR_LABELS[sector],
      total: locsSector.length,
      ...contarEsquemas(locsSector),
    };
  });

  return {
    totalPdv: volumen.length,
    pdvEnCartera: universo.length,
    pdvFueraDeCartera: idsFueraDeCartera.size,
    gruposVendedores,
    cantidadVendedores: vendedores.size,
    franquiciados: FRANQUICIADAS_INDIRECTO_SAP_CODES.length,
    distribuidorasIntermediarias: DISTRIBUIDORAS_INTERMEDIARIAS_SAP_CODES.length,
    porCohorte,
    porSector,
  };
}
