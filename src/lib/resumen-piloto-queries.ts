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

export interface CohorteResumen extends EsquemaAtencionResumen {
  nombre: string;
  desde: string | null;
  cantidad: number;
}

export interface EsquemaAtencionResumen {
  /** Incluye "Mixto" (decisión del usuario, 26-08-2026: "toma lo mixto como directo"). */
  directos: number;
  indirectos: number;
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
  const resumen: EsquemaAtencionResumen = { directos: 0, indirectos: 0, sinEsquema: 0 };
  for (const l of locations) {
    const esquema = (l.esquema_atencion ?? "").trim().toLowerCase();
    // "Mixto" cuenta como directo (decisión del usuario, 26-08-2026).
    if (esquema === "directo" || esquema === "mixto") resumen.directos++;
    else if (esquema === "indirecto") resumen.indirectos++;
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

  // Por cohorte (tanda de incorporación) — con su propio desglose de esquema
  // de atención adentro, para poder cruzar los dos: "cohorte" es CUÁNDO entró
  // el cliente a la cartera (una tanda puntual), "esquema_atencion" es CÓMO se
  // le atiende (Directo/Indirecto/Mixto) — son campos independientes, así que
  // un PDV de la tanda "Indirecto Cumaná" no necesariamente tiene
  // esquema_atencion="Indirecto" cargado (o viceversa: hay PDV "Indirecto" en
  // Cumaná que ya estaban desde el "Piloto original", antes de esa tanda).
  const locsPorCohorte = new Map<string, Location[]>();
  for (const l of volumen) {
    const nombre = l.cohorte ?? "Sin cohorte asignada";
    const grupo = locsPorCohorte.get(nombre);
    if (grupo) grupo.push(l);
    else locsPorCohorte.set(nombre, [l]);
  }
  // En el orden de COHORTES (cronológico) + lo que no calce al final
  // ("Fuera de cartera", "Sin cohorte asignada", o cualquier cohorte nueva
  // que se agregue en cohortes.ts sin actualizar este archivo).
  const nombresConocidos = new Set(COHORTES.map((c) => c.nombre));
  const armarCohorte = (nombre: string, desde: string | null): CohorteResumen => {
    const locs = locsPorCohorte.get(nombre) ?? [];
    return { nombre, desde, cantidad: locs.length, ...contarEsquemas(locs) };
  };
  const porCohorte: CohorteResumen[] = [
    ...COHORTES.map((c) => armarCohorte(c.nombre, c.desde)),
    ...[...locsPorCohorte.keys()].filter((nombre) => !nombresConocidos.has(nombre)).map((nombre) => armarCohorte(nombre, null)),
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
