import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PRODUCT_IDS } from "@/data/catalog";
import { getSellInTotalsByLocation, getUniverseLocations, sectorGroup, vigentesAl, type Sector } from "@/lib/universe";
import { todayISO } from "@/lib/date-buckets";
import { SEGMENTO_SIN_DATO } from "@/lib/segmentos";
import {
  DIAS_SIN_RECOMPRA,
  type ClienteAlertaRow,
  type ClientesSinRecompraResult,
  type MotivoAlerta,
} from "@/lib/clientes-sin-recompra-utils";

// ── Clientes en alerta de recompra (DIENN, 22-09-2026; ajuste 22-09-2026) ─
// Clientes de la cartera que YA compraron Panquecitas pero no se consolidan.
// Umbral común: la última compra tiene 14+ días respecto de la FECHA DE CORTE
// (última fecha del Radar cargado, no "hoy"). Quien compró hace menos de 14
// días NO entra en alerta — aunque solo tenga una compra.
//
// Categorías excluyentes (su suma = total en alerta):
//   - "Solo 1 compra": exactamente una fecha Radar y esa compra hace 14+ días.
//   - "+2 semanas sin pedir": 2 o más fechas Radar y la última hace 14+ días.
//
// "Ambos" ya no se usa: antes mezclaba "1 compra + 14 días" (que es Solo 1
// compra) con un cruce que dejaba a los de 1 compra reciente como alerta.
//
// Fuente: radar_ventas_fechas (migration 013), misma que la tasa de recompra.
// Universo: cartera vigente hoy. Cero compras no entran (van a Inactivos).

export type { ClienteAlertaRow, ClientesSinRecompraResult, MotivoAlerta };

const DIA_MS = 24 * 60 * 60 * 1000;
const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);

export async function getClientesSinRecompra(): Promise<ClientesSinRecompraResult> {
  const vacio: ClientesSinRecompraResult = {
    fechaCorte: null,
    compradores: { cumana: 0, barquisimeto_este: 0 },
    clientes: [],
  };

  const universo = vigentesAl(await getUniverseLocations(), todayISO());
  if (universo.length === 0) return vacio;

  const supabase = createSupabaseServiceClient();
  const [fechasData, kgPorCliente] = await Promise.all([
    fetchAllRows<{ location_id: string; fecha: string }>(() =>
      supabase.from("radar_ventas_fechas").select("location_id, fecha").eq("product_id", PRODUCT_IDS.PANQUECITAS)
    ),
    getSellInTotalsByLocation(PRODUCT_IDS.PANQUECITAS),
  ]);

  const fechasPorCliente = new Map<string, Set<string>>();
  let fechaCorte: string | null = null;
  for (const r of fechasData ?? []) {
    const fecha = r.fecha.slice(0, 10);
    if (!fechaCorte || fecha > fechaCorte) fechaCorte = fecha;
    let set = fechasPorCliente.get(r.location_id);
    if (!set) fechasPorCliente.set(r.location_id, (set = new Set()));
    set.add(fecha);
  }
  if (!fechaCorte) return vacio;

  const compradores: Record<Sector, number> = { cumana: 0, barquisimeto_este: 0 };
  const clientes: ClienteAlertaRow[] = [];

  for (const l of universo) {
    const sector = sectorGroup(l.oficina_venta);
    const fechas = fechasPorCliente.get(l.id);
    if (!sector || !fechas || fechas.size === 0) continue;
    compradores[sector] += 1;

    const ordenadas = [...fechas].sort();
    const ultimaCompra = ordenadas[ordenadas.length - 1];
    const diasSinPedir = diasEntre(ultimaCompra, fechaCorte);
    // Sin alerta si aún está dentro de la ventana de 14 días desde la última compra.
    if (diasSinPedir < DIAS_SIN_RECOMPRA) continue;

    const unaCompra = ordenadas.length === 1;
    clientes.push({
      locationId: l.id,
      sapCode: l.sap_code,
      nombre: l.name,
      sector,
      municipio: l.municipio,
      segmento: l.segmento_cliente?.trim() || SEGMENTO_SIN_DATO,
      cohorte: l.cohorte,
      // 1 compra + 14 días → Solo 1 compra; 2+ compras + 14 días → sin pedir.
      motivo: unaCompra ? "UNA_COMPRA" : "SIN_RECOMPRA",
      compras: ordenadas.length,
      primeraCompra: ordenadas[0],
      ultimaCompra,
      diasSinPedir,
      kgAcumulado: Math.round((kgPorCliente.get(l.id) ?? 0) * 10) / 10,
    });
  }

  clientes.sort((a, b) => b.diasSinPedir - a.diasSinPedir || a.nombre.localeCompare(b.nombre));
  return { fechaCorte, compradores, clientes };
}
