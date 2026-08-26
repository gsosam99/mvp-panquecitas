-- 022_radar_mavesa — Reportes "Radar" de Mavesa (Margarina y Mayonesa),
-- comparativos de comportamiento de portafolio por ciudad junto a
-- Panquecitas/Harina PAN. NO son datos de competencia (Mavesa reporta solo
-- sus propios productos) y NO deben mezclarse entre sí ni con el Radar de
-- PAN — de ahí una tabla por categoría, cada una con su propio endpoint de
-- carga y su propio radio de reemplazo (decisión con Alejandro, 26-08-2026):
-- compartir tabla/endpoint entre Margarina y Mayonesa reproduciría el mismo
-- bug que tenía radar_3m_records, donde el delete-replace de una carga no
-- filtra por producto y podría borrar la categoría contraria.
--
-- CUATRO tablas, no dos: el ratio diario (vs. promedio histórico) y las
-- barras de totales acumulados usan PERÍODOS distintos de la MISMA
-- categoría — mayo-julio de referencia contra agosto en adelante como
-- "actual". Si compartieran tabla, cargar el archivo de agosto (para las
-- barras) reemplazaría por completo el de mayo-julio (que alimenta el
-- ratio) — mismo patrón que ya existe para PAN:
--   radar_3m_records (histórico, promedio)  vs.  sap_sell_in_records (vivo)
-- Acá se duplica ese patrón por categoría:
--   radar_margarina_referencia_records  vs.  radar_margarina_actual_records
--   radar_mayonesa_referencia_records   vs.  radar_mayonesa_actual_records
--
-- A diferencia de radar_3m_records, location_id es NOT NULL en las 4: el
-- requisito es quedarse solo con clientes de la cartera del piloto,
-- descartando en el endpoint de carga cualquier fila que no resuelva a un
-- cliente en cartera (no hay concepto de "universo completo del reporte"
-- aquí, a diferencia de PAN).
--
-- Mismo patrón de migration 019: clave (sap_code, material_code,
-- date_of_sale) por si cada categoría trae varias presentaciones, y cada
-- carga REEMPLAZA la anterior de su propia tabla.

create table public.radar_margarina_referencia_records (
  id              uuid primary key default gen_random_uuid(),
  sap_code        text not null,
  material_code   text not null,
  location_id     uuid not null references public.locations(id) on delete cascade,
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

create table public.radar_margarina_actual_records (
  id              uuid primary key default gen_random_uuid(),
  sap_code        text not null,
  material_code   text not null,
  location_id     uuid not null references public.locations(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  quantity_kg     numeric(14,3) not null,
  date_of_sale    date not null,
  upload_batch_id uuid,
  created_at      timestamptz not null default now(),
  unique (sap_code, material_code, date_of_sale)
);

alter table public.radar_margarina_actual_records enable row level security;

create index idx_radar_margarina_act_location on public.radar_margarina_actual_records(location_id);
create index idx_radar_margarina_act_batch on public.radar_margarina_actual_records(upload_batch_id);
create index idx_radar_margarina_act_product on public.radar_margarina_actual_records(product_id);

create table public.radar_mayonesa_referencia_records (
  id              uuid primary key default gen_random_uuid(),
  sap_code        text not null,
  material_code   text not null,
  location_id     uuid not null references public.locations(id) on delete cascade,
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

create table public.radar_mayonesa_actual_records (
  id              uuid primary key default gen_random_uuid(),
  sap_code        text not null,
  material_code   text not null,
  location_id     uuid not null references public.locations(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  quantity_kg     numeric(14,3) not null,
  date_of_sale    date not null,
  upload_batch_id uuid,
  created_at      timestamptz not null default now(),
  unique (sap_code, material_code, date_of_sale)
);

alter table public.radar_mayonesa_actual_records enable row level security;

create index idx_radar_mayonesa_act_location on public.radar_mayonesa_actual_records(location_id);
create index idx_radar_mayonesa_act_batch on public.radar_mayonesa_actual_records(upload_batch_id);
create index idx_radar_mayonesa_act_product on public.radar_mayonesa_actual_records(product_id);

-- Productos nuevos, marca Mavesa (distinta de Primor) — solo comparativos,
-- nunca se mezclan con los cálculos de Panquecitas/Harina PAN. IDs fijos:
-- ver PRODUCT_IDS en src/data/catalog.ts.
insert into public.products (id, name, brand) values
  ('00000000-0000-0000-0000-000000000003', 'Margarina', 'Mavesa'),
  ('00000000-0000-0000-0000-000000000004', 'Mayonesa', 'Mavesa');
