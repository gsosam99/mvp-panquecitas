-- 017_radar_3m — "Radar últimos 3 Meses" (Harina PAN, mayo–julio).
--
-- Carga SEPARADA de la Carga Radar normal (decisión con DIENN, 18-08-2026):
-- este reporte alimenta únicamente el gráfico de rendimiento diario vs.
-- promedio histórico y no debe mezclarse con sap_sell_in_records, que es la
-- venta viva del piloto. Por eso tabla propia en vez de una bandera.
--
-- Se guarda por cliente para poder calcular las dos poblaciones que pide el
-- filtro del gráfico: PAN Cliente (solo clientes con Panquecitas) y PAN
-- Universo (los 358). El promedio diario sale de dividir el total entre los
-- días que cubre el reporte.
--
-- Cada carga REEMPLAZA la anterior (upload_batch_id + borrado de lo viejo),
-- igual que radar_ventas_fechas: el reporte se exporta completo.

create table if not exists public.radar_3m_records (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references public.locations(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  quantity_kg     numeric(14,3) not null,
  date_of_sale    date not null,
  upload_batch_id uuid,
  created_at      timestamptz not null default now(),
  unique (location_id, product_id, date_of_sale)
);

alter table public.radar_3m_records enable row level security;

create index if not exists idx_radar3m_location on public.radar_3m_records(location_id);
create index if not exists idx_radar3m_batch on public.radar_3m_records(upload_batch_id);
