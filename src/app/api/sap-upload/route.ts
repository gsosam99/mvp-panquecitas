import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import {
  PRODUCT_IDS,
  SAP_RADAR_MATERIAL_PRODUCT_MAP,
  SAP_RADAR_MATERIAL_VARIANT_MAP,
  SAP_MATERIAL_PRODUCT_MAP,
  SAP_MATERIAL_VARIANT_MAP,
} from "@/data/catalog";
import { mapLocationType } from "@/lib/excel-parser";
import { isExcludedDistribuidor } from "@/lib/sectors";
import type { ParsedSapRadarRow, ParsedSapFacturacionRow } from "@/types";

type RadarFecha = { sap_code: string; material_code: string; fecha: string };

type SapUploadBody =
  // Reporte "Radar" (Harina PAN + Panquecitas) — acumulado del mes, un
  // archivo MHTML por producto ("Radar HPM.xls" / "Radar panquecitas.xls").
  // `fechas` = todas las fechas distintas con venta (para la recompra), aparte
  // del acumulado que va en `rows`.
  | { format: "radar"; rows: ParsedSapRadarRow[]; batchId: string; fechas?: RadarFecha[] }
  // Reporte "Pedidos y Facturado" (Panquecitas, Cantidad Pedido/Facturada por día).
  | { format: "facturacion"; rows: ParsedSapFacturacionRow[]; batchId: string };

// Misma fila (cliente + fecha + producto/presentación) → misma llave. null se
// normaliza a un string fijo porque el radar de HPM nunca trae variant_id.
function dedupeKey(location_id: string, product_id: string, variant_id: string | null | undefined, date: string) {
  return `${location_id}|${product_id}|${variant_id ?? "null"}|${date}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

// Los errores de supabase-js (PostgrestError) traen message/details/hint/code
// en vez de un Error normal. Los aplanamos a un string legible para
// devolverlo en el 500 — esto es una ruta solo-admin (hasDashboardSession),
// así que exponer el detalle real de la BD ayuda a diagnosticar sin filtrar
// nada sensible a usuarios finales.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorDetail(error: any): string {
  if (error && typeof error === "object") {
    const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  return String(error);
}

// El reporte Radar (SAP) NO crea clientes nuevos — solo puede alimentar
// ventas de clientes que ya viven en `locations` (cargados vía Cartera de
// Clientes, el universo cerrado del piloto). Un client_code de SAP que no
// esté en la cartera se ignora por completo. Ver decisión con Alejandro
// (06-08-2026): el reporte de Pedidos y Facturado trae clientes
// (distribuidoras) que no son puntos de venta reales y no deben contarse.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveKnownLocationIds(supabase: any, sapCodes: string[]): Promise<Map<string, string>> {
  if (!sapCodes.length) return new Map();

  // Por lotes, no de una: un `.in()` con cientos de códigos arma una URL
  // enorme (PostgREST filtra por querystring) y además la respuesta se corta
  // en 1000 filas. Cualquiera de las dos cosas deja clientes sin resolver, y
  // un cliente sin resolver se ignora en silencio — su volumen no se guarda.
  const LOTE = 200;
  const out = new Map<string, string>();

  for (let i = 0; i < sapCodes.length; i += LOTE) {
    const lote = sapCodes.slice(i, i + LOTE);
    const { data, error } = await supabase.from("locations").select("id, sap_code").in("sap_code", lote);
    if (error) throw error;
    for (const l of data as { id: string; sap_code: string }[]) out.set(l.sap_code, l.id);
  }

  return out;
}

export async function POST(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const body = (await req.json()) as SapUploadBody;
    if (!body?.rows?.length || !body.batchId) {
      return Response.json({ error: "Datos inválidos" }, { status: 400 });
    }

    if (body.format === "facturacion") {
      return await handleFacturacionUpload(supabase, body.rows, body.batchId);
    }
    if (body.format === "radar") {
      return await handleRadarUpload(supabase, body.rows, body.batchId, body.fechas ?? []);
    }
    return Response.json({ error: "Formato de reporte desconocido" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/sap-upload]", error);
    return Response.json(
      { error: "Error interno del servidor", detail: errorDetail(error) },
      { status: 500 }
    );
  }
}

// ── Reporte "Radar" (Harina PAN + Panquecitas) — una fila por día ──────────
// Cada fila del reporte es la venta real DESPACHADA de UN cliente + material
// en UN día, y así se guarda en `sap_sell_in_records`: mismo grano que el
// reporte. El total de un mes es la suma de sus días.
//
// El archivo trae el período completo, así que la carga REEMPLAZA los meses
// que trae (para los clientes y productos que aparecen en él) en vez de
// actualizar fila por fila: se borra y se reinserta. Volver a subir el mismo
// archivo es idempotente, y una corrección queda reflejada en vez de convivir
// con el dato viejo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRadarUpload(supabase: any, rows: ParsedSapRadarRow[], batchId: string, fechas: RadarFecha[]) {
  // ── 1. Resolver clientes contra la cartera ya cargada (no se crean nuevos) ──
  const uniqueByCode = new Map<string, ParsedSapRadarRow>();
  for (const row of rows) uniqueByCode.set(row.sap_code, row);

  const knownLocationIds = await resolveKnownLocationIds(supabase, [...uniqueByCode.keys()]);
  const clientesFueraCartera = [...uniqueByCode.keys()].filter((c) => !knownLocationIds.has(c)).length;

  const locationsToRefresh = [...uniqueByCode.entries()]
    .filter(([sap_code]) => knownLocationIds.has(sap_code))
    .map(([sap_code, row]) => ({
      sap_code,
      name: row.client_name,
      type: mapLocationType(row.tipo_cliente),
      tipo_cliente: row.tipo_cliente || null,
      esquema_atencion: row.esquema_atencion || null,
      grupo_vendedor: row.grupo_vendedor || null,
      region: row.region || null,
      oficina_venta: row.oficina_venta || null,
      zona_venta: row.zona_venta || null,
    }));

  let locationsUpdated = 0;
  if (locationsToRefresh.length > 0) {
    const { data: upsertedLocs, error: locError } = await supabase
      .from("locations")
      .upsert(locationsToRefresh, { onConflict: "sap_code", ignoreDuplicates: false })
      .select("id");
    if (locError) throw locError;
    locationsUpdated = (upsertedLocs ?? []).length;
  }

  // ── 2. Resolver product_id + variant_id por material — solo clientes conocidos ──
  const unknownMaterials = new Set<string>();
  const sellInRows: { location_id: string; product_id: string; variant_id: string | null; quantity_kg: number; date_of_sale: string }[] = [];
  for (const row of rows) {
    const location_id = knownLocationIds.get(row.sap_code);
    if (!location_id) continue; // cliente fuera de la cartera → se ignora

    const product_id = SAP_RADAR_MATERIAL_PRODUCT_MAP[row.material_code];
    if (!product_id) {
      unknownMaterials.add(`${row.material_code} (${row.material_name})`);
      continue;
    }
    const variant_id = SAP_RADAR_MATERIAL_VARIANT_MAP[row.material_code] ?? null;

    sellInRows.push({ location_id, product_id, variant_id, quantity_kg: row.quantity_kg, date_of_sale: row.fecha });
  }

  if (unknownMaterials.size > 0) {
    return Response.json({
      error: `Materiales SAP no mapeados: ${[...unknownMaterials].join(", ")}. Actualiza SAP_RADAR_MATERIAL_PRODUCT_MAP en catalog.ts.`,
    }, { status: 422 });
  }

  // ── 3. Una fila por cliente + producto + presentación + DÍA ──────────
  //
  // El grano de `sap_sell_in_records` es el DÍA, igual que el del reporte
  // (N7_V_SD88_WEB_001 trae una fila por cliente + material + día, con la
  // venta de ESE día: 787 filas y 787 llaves distintas en el export del
  // 21-08-2026).
  //
  // Antes se guardaba una fila por MES. Primero con el kg del último día,
  // que descartaba 1,21 de 5,42 toneladas. Después con la suma del mes pero
  // fechada en el último día: el total quedaba bien y el reparto por día
  // mal, porque TODO el volumen mensual de un cliente aterrizaba en la
  // fecha de su última compra. Cumaná mostraba 659,20 kg el 21-08 contra
  // los 390,40 reales, y el gráfico de rendimiento diario vs. promedio 3M
  // salía deformado.
  //
  // Guardar por día arregla las dos cosas: el total del mes es la suma de
  // sus días y la serie diaria es la real. De paso, la "primera compra" del
  // perfil Admin pasa a ser la fecha real y no el último día del mes.
  //
  // Si un export repitiera cliente+material+día gana la última fila: no se
  // suma, porque sería el mismo dato dos veces.
  const byDay = new Map<string, (typeof sellInRows)[number]>();
  let nonPositiveSkipped = 0;
  for (const r of sellInRows) {
    // sap_sell_in_records exige quantity_kg > 0 (ver schema.sql). Una fila
    // en cero o negativa (crédito/devolución) no se inserta; como el paso 4
    // borra el mes antes de reinsertar, eso equivale a eliminarla.
    if (r.quantity_kg <= 0) {
      nonPositiveSkipped++;
      continue;
    }
    byDay.set(dedupeKey(r.location_id, r.product_id, r.variant_id, r.date_of_sale), r);
  }
  const filasNuevas = [...byDay.values()];

  // ── 4. Reemplazar los MESES que trae el archivo ──────────────────────
  //
  // El export del Radar trae el PERÍODO COMPLETO de un producto para toda la
  // cartera, así que es la única verdad de esos meses: se borra el mes entero
  // de ese producto y se insertan las filas del archivo.
  //
  // El borrado NO se acota a los clientes del archivo, y esa es la parte que
  // importa. Antes sí lo hacía, y por eso un cliente que aparecía en una carga
  // vieja y ya no viene en el reporte —porque su venta se anuló o se corrigió—
  // conservaba sus filas para siempre: sobrevivía a todas las recargas y
  // sumaba de más. El total quedaba por encima del archivo sin que nada lo
  // explicara (5,65 ton contra 5,59 del reporte del 24-08-2026).
  //
  // Sigue acotado por PRODUCTO y por MES, que es lo que hace seguro el
  // borrado: el Radar se sube en dos archivos, uno de Harina PAN y otro de
  // Panquecitas, así que cargar uno no toca al otro; y subir septiembre no
  // toca agosto.
  //
  // Supuesto explícito: el archivo cubre el mes entero. Si alguna vez se
  // exporta un Radar recortado a unos pocos días, cargarlo borraría el resto
  // del mes. El contador `deleted` que devuelve la carga sirve justo para
  // notarlo: si borra mucho más de lo que inserta, algo no cuadra.
  const mesesPorProducto = new Map<string, Set<string>>();
  for (const r of filasNuevas) {
    if (!mesesPorProducto.has(r.product_id)) mesesPorProducto.set(r.product_id, new Set());
    mesesPorProducto.get(r.product_id)!.add(monthKey(r.date_of_sale));
  }

  let deleted = 0;
  for (const [productId, meses] of mesesPorProducto) {
    for (const mes of meses) {
      const [anio, mm] = mes.split("-").map(Number);
      const desde = `${mes}-01`;
      // Día 0 del mes siguiente = último día de este.
      const hasta = new Date(Date.UTC(anio, mm, 0)).toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("sap_sell_in_records")
        .delete()
        .eq("product_id", productId)
        .gte("date_of_sale", desde)
        .lte("date_of_sale", hasta)
        .select("id");
      if (error) throw error;
      deleted += (data ?? []).length;
    }
  }

  // Insert por lotes: un solo insert con miles de filas puede pasarse del
  // límite de tamaño del request.
  const LOTE_INSERT = 500;
  let inserted = 0;
  for (let i = 0; i < filasNuevas.length; i += LOTE_INSERT) {
    const lote = filasNuevas.slice(i, i + LOTE_INSERT);
    const { error: insertError } = await supabase
      .from("sap_sell_in_records")
      .insert(lote.map((r) => ({ uploaded_by: null, upload_batch_id: batchId, ...r })));
    if (insertError) throw insertError;
    inserted += lote.length;
  }

  // ── 5. Fechas de venta Radar (para la recompra) → radar_ventas_fechas ──
  // Distintas por (cliente, producto, fecha). Solo clientes de la cartera y
  // materiales mapeados. NO es crítico: si la tabla no existe todavía (falta
  // correr el migration 013) o falla el insert, se registra y se sigue — la
  // carga del acumulado no se rompe.
  //
  // REEMPLAZO, NO ACUMULACIÓN (decisión con DIENN, 18-08-2026): el reporte
  // Radar se exporta con todo el período, así que las fechas del archivo recién
  // cargado son la única verdad. Antes cada carga hacía upsert y nunca se
  // borraba nada, ni siquiera al borrar el batch — las fechas de reportes
  // corregidos seguían contando y la recompra subía sola.
  //
  // Orden a propósito: primero se insertan/marcan las nuevas y DESPUÉS se
  // borran las que quedaron de cargas anteriores. Así, si el insert falla, no
  // se pierde lo que ya había (no hay transacción vía REST).
  let fechasInserted = 0;
  let fechasEliminadas = 0;
  try {
    const seen = new Set<string>();
    const fechaRows: { location_id: string; product_id: string; fecha: string; upload_batch_id: string }[] = [];
    for (const f of fechas) {
      const location_id = knownLocationIds.get(f.sap_code);
      const product_id = SAP_RADAR_MATERIAL_PRODUCT_MAP[f.material_code];
      if (!location_id || !product_id) continue; // cliente fuera de cartera o material no mapeado
      const key = `${location_id}|${product_id}|${f.fecha}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fechaRows.push({ location_id, product_id, fecha: f.fecha, upload_batch_id: batchId });
    }
    if (fechaRows.length > 0) {
      // ignoreDuplicates:false → una fecha que ya existía queda marcada con el
      // batch nuevo, y por eso no la borra el paso siguiente.
      const { error: fechasError } = await supabase
        .from("radar_ventas_fechas")
        .upsert(fechaRows, { onConflict: "location_id,product_id,fecha", ignoreDuplicates: false });
      if (fechasError) throw fechasError;
      fechasInserted = fechaRows.length;

      // Todo lo que no vino en este archivo (batch anterior o filas viejas sin
      // batch) se elimina, acotado a los productos que sí trae el archivo.
      const productIds = [...new Set(fechaRows.map((r) => r.product_id))];
      const { data: borradas, error: staleError } = await supabase
        .from("radar_ventas_fechas")
        .delete()
        .in("product_id", productIds)
        .or(`upload_batch_id.is.null,upload_batch_id.neq.${batchId}`)
        .select("id");
      if (staleError) throw staleError;
      fechasEliminadas = (borradas ?? []).length;
    }
  } catch (fechasErr) {
    console.error("[handleRadarUpload] no se pudieron guardar las fechas de recompra (no crítico):", fechasErr);
  }

  return Response.json({
    format: "radar",
    // `inserted` son las filas diarias del archivo; `deleted`, las que se
    // reemplazaron de esos mismos meses. En una recarga del mismo archivo los
    // dos números son iguales. Ya no hay `updated` ni `stale_skipped`: el mes
    // se reemplaza entero, no se actualiza fila por fila.
    inserted,
    deleted,
    fechas_registradas: fechasInserted,
    fechas_eliminadas: fechasEliminadas,
    non_positive_skipped: nonPositiveSkipped,
    clientes_fuera_cartera: clientesFueraCartera,
    locations_upserted: locationsUpdated,
  });
}

// ── Reporte "Pedidos y Facturado" (Panquecitas): Pedido/Entregado/Facturado ─
// Escribe EXCLUSIVAMENTE en sap_pedidos_facturados — nunca en
// sap_sell_in_records (esa tabla es solo de "Carga Radar"). Ambas cifras
// crudas del reporte (Cantidad Pedido y Cantidad Facturada) se guardan
// juntas por cliente+material+fecha, porque DIENN necesita mostrarlas como
// dos tarjetas independientes que NO se pueden sumar entre sí ni con el
// Radar — son procesos de venta distintos. Ver decisión con Alejandro
// (07-08-2026) y migración 010.
//
// Es un reporte diario (una fila por cliente+material+fecha), así que a
// diferencia del Radar (acumulado mensual) aquí una fila repetida sí es un
// duplicado real y se descarta, no se reemplaza.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFacturacionUpload(supabase: any, rows: ParsedSapFacturacionRow[], batchId: string) {
  // ── 1. Resolver clientes contra la cartera ya cargada. Excepción: las
  // distribuidoras intermediarias conocidas (isExcludedDistribuidor) SÍ se
  // crean/actualizan aquí — su volumen facturado cuenta para las métricas
  // de Pedidos y Facturado (ayudan a llegar el producto al PDV vía Radar),
  // pero quedan excluidas del universo real en getUniverseLocations(), así
  // que nunca cuentan como clientes para mercaderistas/promotoras ni para
  // penetración. Ver decisión con Alejandro (08-08-2026).
  const uniqueByCode = new Map<string, ParsedSapFacturacionRow>();
  for (const row of rows) uniqueByCode.set(row.sap_code, row);

  const knownLocationIds = await resolveKnownLocationIds(supabase, [...uniqueByCode.keys()]);
  const clientesFueraCartera = [...uniqueByCode.keys()].filter(
    (c) => !knownLocationIds.has(c) && !isExcludedDistribuidor(c)
  ).length;

  const locationsToUpsert = [...uniqueByCode.entries()]
    .filter(([sap_code]) => knownLocationIds.has(sap_code) || isExcludedDistribuidor(sap_code))
    .map(([sap_code, row]) => ({
      sap_code,
      name: row.client_name,
      type: mapLocationType(row.tipo_cliente),
      tipo_cliente: row.tipo_cliente || null,
      esquema_atencion: row.esquema_atencion || null,
      grupo_vendedor: row.grupo_vendedor || null,
      region: row.region || null,
      oficina_venta: row.oficina_venta || null,
      zona_venta: row.zona_venta || null,
    }));

  let locationsUpdated = 0;
  if (locationsToUpsert.length > 0) {
    const { data: upsertedLocs, error: locError } = await supabase
      .from("locations")
      .upsert(locationsToUpsert, { onConflict: "sap_code", ignoreDuplicates: false })
      .select("id, sap_code");
    if (locError) throw locError;
    locationsUpdated = (upsertedLocs ?? []).length;
    // Las distribuidoras recién creadas no estaban en knownLocationIds — se
    // agregan ahora para que la fila 2 (pedidoFacturadoRows) las reconozca.
    for (const l of upsertedLocs as { id: string; sap_code: string }[]) {
      knownLocationIds.set(l.sap_code, l.id);
    }
  }

  // ── 2. Resolver product_id + variant_id por material. variant_id es lo
  // que alimenta el Mix de Producto de DIENN (400g/800g).
  const unknownMaterials = new Set<string>();
  const pedidoFacturadoRows: {
    upload_batch_id: string;
    location_id: string;
    product_id: string;
    variant_id: string | null;
    cantidad_pedido_kg: number;
    cantidad_facturada_kg: number;
    fecha: string;
  }[] = [];

  for (const row of rows) {
    const location_id = knownLocationIds.get(row.sap_code);
    if (!location_id) continue; // cliente fuera de la cartera → se ignora

    const product_id = SAP_MATERIAL_PRODUCT_MAP[row.material_code];
    if (!product_id) {
      unknownMaterials.add(`${row.material_code} (${row.material_name})`);
      continue;
    }
    const variant_id = SAP_MATERIAL_VARIANT_MAP[row.material_code] ?? null;

    // La tabla exige cantidad_pedido_kg / cantidad_facturada_kg >= 0 (CHECK
    // de la migración 010). En el reporte SAP un valor negativo representa un
    // dato nulo/sin cantidad, así que cuenta como 0. Insertarlo tal cual
    // violaba el CHECK y hacía fallar TODA la carga con un 500. Se recorta a 0
    // por columna, de forma independiente entre pedido y facturado.
    const cantidad_pedido_kg = Math.max(0, row.cantidad_pedido_kg);
    const cantidad_facturada_kg = Math.max(0, row.cantidad_facturada_kg);
    if (cantidad_pedido_kg <= 0 && cantidad_facturada_kg <= 0) continue; // fila sin datos útiles

    pedidoFacturadoRows.push({
      upload_batch_id: batchId,
      location_id,
      product_id,
      variant_id,
      cantidad_pedido_kg,
      cantidad_facturada_kg,
      fecha: row.fecha,
    });
  }

  if (unknownMaterials.size > 0) {
    return Response.json({
      error: `Materiales SAP no mapeados: ${[...unknownMaterials].join(", ")}. Actualiza SAP_MATERIAL_PRODUCT_MAP en catalog.ts.`,
    }, { status: 422 });
  }

  // ── 3. Agregar por cliente + producto + presentación + fecha ──────────
  // El reporte puede traer VARIAS filas por esa llave — distintas
  // facturas/pedidos del mismo día — que NO son duplicados: se SUMAN.
  const aggByKey = new Map<string, (typeof pedidoFacturadoRows)[number]>();
  for (const r of pedidoFacturadoRows) {
    const key = dedupeKey(r.location_id, r.product_id, r.variant_id, r.fecha);
    const acc = aggByKey.get(key);
    if (acc) {
      acc.cantidad_pedido_kg += r.cantidad_pedido_kg;
      acc.cantidad_facturada_kg += r.cantidad_facturada_kg;
    } else {
      aggByKey.set(key, { ...r });
    }
  }
  const filasNuevas = [...aggByKey.values()];

  // ── 4. Reemplazar el PERÍODO que trae el archivo ─────────────────────
  //
  // Antes se descartaba toda fila cuya llave ya existiera en la base, para
  // que recargar fuera idempotente. Pero este reporte NO es inmutable: un
  // pedido del día 13 se factura días después, así que la misma llave
  // (cliente, material, fecha) cambia de valor entre un export y el
  // siguiente — `Cantidad Facturada` pasa de 0 al valor final. Saltarla
  // como "duplicado" congelaba el dato viejo: en el export del 24-08-2026
  // el reporte traía 9.215,20 kg facturados y el dashboard mostraba 7.750,
  // 1,46 toneladas menos, sin ningún aviso.
  //
  // Ahora se reemplaza: se borran los MESES que cubre el archivo para ese
  // producto y se reinserta. El archivo es la verdad de su período, así que
  // una factura corregida —o un pedido anulado— queda reflejada. Recargar el
  // mismo archivo sigue siendo idempotente.
  //
  // El borrado NO se acota a los clientes del archivo, por el mismo motivo
  // que en la Carga Radar: un cliente que venía en una carga vieja y ya no
  // aparece conservaría sus filas para siempre y sumaría de más en cada
  // recarga. Se acota por producto y por mes, que es lo que lo hace seguro.
  //
  // Se borra el mes completo y no solo el rango de fechas con filas, porque
  // si una fecha desaparece del reporte —el pedido de ese día se anuló— sus
  // filas viejas tienen que irse también.
  const productos = [...new Set(filasNuevas.map((r) => r.product_id))];
  const meses = [...new Set(filasNuevas.map((r) => monthKey(r.fecha)))];

  let deleted = 0;
  for (const productId of productos) {
    for (const mes of meses) {
      const [anio, mm] = mes.split("-").map(Number);
      const desde = `${mes}-01`;
      const hasta = new Date(Date.UTC(anio, mm, 0)).toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("sap_pedidos_facturados")
        .delete()
        .eq("product_id", productId)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .select("id");
      if (error) throw error;
      deleted += (data ?? []).length;
    }
  }

  // ── 5. Insert por lotes ──────────────────────────────────────────────
  const LOTE_INSERT = 500;
  let inserted = 0;
  for (let i = 0; i < filasNuevas.length; i += LOTE_INSERT) {
    const lote = filasNuevas.slice(i, i + LOTE_INSERT);
    const { error } = await supabase.from("sap_pedidos_facturados").insert(lote);
    if (error) throw error;
    inserted += lote.length;
  }

  return Response.json({
    format: "facturacion",
    locations_upserted: locationsUpdated,
    inserted,
    deleted,
    // Los meses que se reemplazaron, que es lo que el borrado realmente
    // abarca (no el rango de fechas con filas).
    periodo: [...meses].sort().join(", "),
    clientes_fuera_cartera: clientesFueraCartera,
  });
}

export async function DELETE(req: Request) {
  try {
    if (!(await hasDashboardSession())) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    const supabase = createSupabaseServiceClient();

    const { batchId } = await req.json() as { batchId: string };
    if (!batchId) return Response.json({ error: "batchId requerido" }, { status: 400 });

    // Un batch pertenece a Carga Radar (sap_sell_in_records) o a Pedidos y
    // Facturado (sap_pedidos_facturados), nunca a ambas — borrar en las dos
    // es inofensivo porque el id no calza en la tabla que no le corresponde.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [sellInResult, pedidosFacturadosResult, fechasResult] = await Promise.all([
      (supabase as any).from("sap_sell_in_records").delete().eq("upload_batch_id", batchId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("sap_pedidos_facturados").delete().eq("upload_batch_id", batchId),
      // Las fechas de recompra de ese mismo cargue: sin esto quedaban huérfanas
      // y seguían inflando la tasa de recompra aunque el batch ya no exista.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("radar_ventas_fechas").delete().eq("upload_batch_id", batchId),
    ]);

    if (sellInResult.error) throw sellInResult.error;
    if (pedidosFacturadosResult.error) throw pedidosFacturadosResult.error;
    // No crítico: si falta el migration 015 la columna no existe todavía y el
    // borrado del batch no tiene por qué fallar por eso.
    if (fechasResult.error) {
      console.error("[DELETE /api/sap-upload] no se pudieron borrar las fechas de recompra:", fechasResult.error);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/sap-upload]", error);
    return Response.json(
      { error: "Error interno del servidor", detail: errorDetail(error) },
      { status: 500 }
    );
  }
}
