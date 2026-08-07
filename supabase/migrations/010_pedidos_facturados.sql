-- ============================================================
-- 010_pedidos_facturados — separa "Pedidos y Facturado" de "Carga Radar"
-- ============================================================
-- Hasta ahora, la carga de "Pedidos y Facturado" (reporte SAP de Cantidad
-- Pedido/Facturada de Panquecitas) escribía su parte facturada en
-- sap_sell_in_records — la MISMA tabla que alimenta "Carga Radar" — y su
-- parte pendiente en sap_pending_orders. Eso mezclaba dos procesos de venta
-- distintos (lo que SAP factura vs. lo que el Radar confirma que realmente
-- llegó al anaquel) en una sola cifra, cuando DIENN necesita verlos por
-- separado y sin poder sumarse entre sí. Ver conversación con Alejandro
-- (07-08-2026).
--
-- A partir de ahora:
--   - sap_sell_in_records  → EXCLUSIVO de "Carga Radar" (Harina PAN +
--     Panquecitas, acumulado real despachado).
--   - sap_pedidos_facturados (esta tabla) → EXCLUSIVO de "Pedidos y
--     Facturado" (Panquecitas), con ambas cifras crudas del reporte
--     (Cantidad Pedido y Cantidad Facturada) por cliente+material+fecha.
--
-- sap_pending_orders queda en desuso (ya no se escribe ni se lee) — no se
-- borra por si hay reportes o exports externos que aún la consulten
-- directamente, pero el código de la app ya no la toca.
--
-- Corre esto manualmente en el proyecto Supabase (SQL editor o CLI).

create table if not exists public.sap_pedidos_facturados (
  id                      uuid primary key default gen_random_uuid(),
  upload_batch_id         uuid not null,
  location_id             uuid not null references public.locations(id),
  product_id              uuid not null references public.products(id),
  variant_id              uuid references public.variants(id),
  cantidad_pedido_kg      decimal(10,3) not null default 0 check (cantidad_pedido_kg >= 0),
  cantidad_facturada_kg   decimal(10,3) not null default 0 check (cantidad_facturada_kg >= 0),
  fecha                   date not null,
  created_at              timestamptz not null default now()
);

comment on table public.sap_pedidos_facturados is
  'Reporte SAP "Pedidos y Facturado" (Panquecitas): Cantidad Pedido y Cantidad Facturada crudas por cliente+material+fecha. No se mezcla con sap_sell_in_records (Carga Radar).';

alter table public.sap_pedidos_facturados enable row level security;
-- Sin políticas anon/authenticated → solo service-role, mismo patrón que sap_sell_in_records.

create index if not exists idx_pedidos_facturados_location on public.sap_pedidos_facturados(location_id);
create index if not exists idx_pedidos_facturados_product on public.sap_pedidos_facturados(product_id);
create index if not exists idx_pedidos_facturados_fecha on public.sap_pedidos_facturados(fecha);
create index if not exists idx_pedidos_facturados_batch on public.sap_pedidos_facturados(upload_batch_id);

grant all on public.sap_pedidos_facturados to anon, authenticated, service_role;
