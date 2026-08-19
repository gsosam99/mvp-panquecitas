-- 019_radar_3m_material — guardar el reporte de 3 meses por MATERIAL.
--
-- La 018 tenía la clave en (sap_code, product_id, date_of_sale), así que un
-- cliente con varias presentaciones del mismo producto colapsaba en una sola
-- fila y se perdía el volumen de las demás. No es hipotético: Harina PAN tiene
-- DOS materiales en el Radar (H187 de 1 kg y H439 de 2 kg), y la Carga Radar
-- normal sí los separa (dedupeKey incluye variant_id).
--
-- Esto es lo que DIENN describió como "todas las ventas acumuladas de estos
-- clientes aunque estén repetidos en el reporte" (18-08-2026).
--
-- Se recrea la tabla: es una caché que se reemplaza entera en cada carga.

drop table if exists public.radar_3m_records;

create table public.radar_3m_records (
  id              uuid primary key default gen_random_uuid(),
  sap_code        text not null,
  material_code   text not null,
  location_id     uuid references public.locations(id) on delete set null,
  product_id      uuid not null references public.products(id) on delete cascade,
  quantity_kg     numeric(14,3) not null,
  date_of_sale    date not null,
  upload_batch_id uuid,
  created_at      timestamptz not null default now(),
  unique (sap_code, material_code, date_of_sale)
);

alter table public.radar_3m_records enable row level security;

create index if not exists idx_radar3m_location on public.radar_3m_records(location_id);
create index if not exists idx_radar3m_batch on public.radar_3m_records(upload_batch_id);
create index if not exists idx_radar3m_product on public.radar_3m_records(product_id);
