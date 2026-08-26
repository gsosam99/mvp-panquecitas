-- 023_radar_mavesa_referencia_universo — el promedio de referencia de
-- Margarina/Mayonesa debe ser el UNIVERSO completo del reporte (mayo-julio),
-- no solo los clientes de la cartera del piloto (decisión del usuario,
-- 26-08-2026: "para el de los ratios toma el universo").
--
-- Mismo criterio que ya usa radar_3m_records para Harina PAN (migration 018):
-- location_id queda OPCIONAL. Se llena cuando el cliente sí resuelve contra
-- una location conocida (cartera o no); sin él, la fila igual cuenta para el
-- total/promedio, solo que no se le puede asignar ciudad. Antes estas tablas
-- exigían location_id NOT NULL y el endpoint de carga descartaba cualquier
-- fila fuera de cartera — eso hacía que el promedio de referencia saliera
-- artificialmente bajo.
--
-- Las tablas "_actual" (que alimentan las barras de totales, comparando
-- contra Panquecitas de la MISMA cartera) NO cambian: ahí sí corresponde
-- seguir acotado a cartera, para que la comparación sea manzanas con
-- manzanas.
--
-- Se recrean en vez de alterar la constraint: son cachés que se reemplazan
-- enteras en cada carga, no hay dato que preservar (y el que había se
-- calculó con la lógica vieja, hay que resubir los archivos igual).

drop table if exists public.radar_margarina_referencia_records;

create table public.radar_margarina_referencia_records (
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

alter table public.radar_margarina_referencia_records enable row level security;

create index idx_radar_margarina_ref_location on public.radar_margarina_referencia_records(location_id);
create index idx_radar_margarina_ref_batch on public.radar_margarina_referencia_records(upload_batch_id);
create index idx_radar_margarina_ref_product on public.radar_margarina_referencia_records(product_id);

drop table if exists public.radar_mayonesa_referencia_records;

create table public.radar_mayonesa_referencia_records (
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

alter table public.radar_mayonesa_referencia_records enable row level security;

create index idx_radar_mayonesa_ref_location on public.radar_mayonesa_referencia_records(location_id);
create index idx_radar_mayonesa_ref_batch on public.radar_mayonesa_referencia_records(upload_batch_id);
create index idx_radar_mayonesa_ref_product on public.radar_mayonesa_referencia_records(product_id);
