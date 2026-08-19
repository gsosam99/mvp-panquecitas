-- 018_radar_3m_todos_los_clientes — el reporte de 3 meses se guarda COMPLETO.
--
-- La 017 exigía location_id (FK a locations), así que las filas de clientes que
-- no están en la cartera del piloto se descartaban al cargar. El promedio de
-- referencia salía calculado sobre una fracción del reporte: DIENN espera la
-- venta acumulada COMPLETA de los 3 meses (1.183.991 kg), no solo la parte que
-- calza con los 358 clientes.
--
-- Ahora la clave es el sap_code del reporte y location_id queda opcional: se
-- llena cuando el cliente sí está en la cartera, que es lo que permite el
-- filtro "PAN Cliente" (solo quienes compran Panquecitas). Sin él, la fila
-- igual cuenta para "PAN Universo".
--
-- Se recrea la tabla en vez de parchear la constraint: es una caché que se
-- reemplaza entera en cada carga, no hay dato que preservar.

drop table if exists public.radar_3m_records;

create table public.radar_3m_records (
  id              uuid primary key default gen_random_uuid(),
  sap_code        text not null,
  location_id     uuid references public.locations(id) on delete set null,
  product_id      uuid not null references public.products(id) on delete cascade,
  quantity_kg     numeric(14,3) not null,
  date_of_sale    date not null,
  upload_batch_id uuid,
  created_at      timestamptz not null default now(),
  unique (sap_code, product_id, date_of_sale)
);

alter table public.radar_3m_records enable row level security;

create index if not exists idx_radar3m_location on public.radar_3m_records(location_id);
create index if not exists idx_radar3m_batch on public.radar_3m_records(upload_batch_id);
