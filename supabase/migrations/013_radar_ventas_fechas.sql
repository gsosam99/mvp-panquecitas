-- 013_radar_ventas_fechas — fechas de venta Radar por cliente, para la tasa de
-- recompra.
--
-- sap_sell_in_records colapsa a UN acumulado por cliente+presentación+MES (se
-- queda con el último corte "Día"), así que pierde las fechas intermedias. Esta
-- tabla guarda cada FECHA distinta con venta Radar por cliente+producto — sin
-- kg, solo la fecha — para poder contar la recompra: cliente que aparece en
-- ≥2 fechas distintas tiene compras repetidas.
--
-- Se puebla desde la Carga Radar (route /api/sap-upload, format "radar"). Como
-- la clave es única por (location_id, product_id, fecha), recargar el mismo mes
-- no duplica; cargar meses nuevos agrega fechas. No se guarda nada sensible.

create table if not exists public.radar_ventas_fechas (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  fecha        date not null,
  created_at   timestamptz not null default now(),
  unique (location_id, product_id, fecha)
);

-- RLS habilitado sin políticas: solo service-role (Carga SAP y lecturas del
-- dashboard) accede, igual que sap_sell_in_records.
alter table public.radar_ventas_fechas enable row level security;

create index if not exists idx_radar_fechas_location on public.radar_ventas_fechas(location_id);
create index if not exists idx_radar_fechas_product on public.radar_ventas_fechas(product_id);
