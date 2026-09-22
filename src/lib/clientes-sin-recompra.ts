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

// ── Clientes en alerta de recompra (DIENN, 22-09-2026) ────────────────
// Clientes de la cartera que YA compraron Panquecitas pero no se consolidan:
//
//   - "Solo 1 compra": una sola fecha de venta Radar en todo el histórico.
//   - "+2 semanas sin pedir": su última fecha de venta Radar tiene 14 días o
//     más respecto de la FECHA DE CORTE (la última fecha que trae el Radar
//     cargado, no hoy: si el reporte se carga con atraso, todos parecerían
//     parados).
//
// Un cliente puede cumplir las dos (compró una sola vez y hace +2 semanas):
// se clasifica en "Ambos". Las tres categorías son excluyentes y su suma es el
// total en alerta.
//
// Fuente de las compras: radar_ventas_fechas (una fila por cliente + producto
// + fecha con venta Radar, migration 013) — la misma que usa la tasa de
// recompra. Se cuentan TODAS las fechas del cliente, también las anteriores a
// su incorporación: para saber si el PDV repone lo que importa es su historia
// real de pedidos, no la ventana de las tasas.
//
// Universo: la cartera vigente hoy (sin "Fuera de cartera"). Los inactivos
// (cero compras) no entran — ya tienen su tarjeta en "Clientes Inactivos por
// Segmento".

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
    const unaCompra = ordenadas.length === 1;
    const sinRecompra = diasSinPedir >= DIAS_SIN_RECOMPRA;
    if (!unaCompra && !sinRecompra) continue;

    clientes.push({
      locationId: l.id,
      sapCode: l.sap_code,
      nombre: l.name,
      sector,
      municipio: l.municipio,
      segmento: l.segmento_cliente?.trim() || SEGMENTO_SIN_DATO,
      cohorte: l.cohorte,
      motivo: unaCompra && sinRecompra ? "AMBOS" : unaCompra ? "UNA_COMPRA" : "SIN_RECOMPRA",
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
