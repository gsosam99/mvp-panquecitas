-- ============================================================
-- Panquecitas MVP — Schema completo
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────
create type user_role as enum ('ADMIN', 'MERCADERISTA', 'PROMOTORA', 'DIENN');
create type location_type as enum ('SUPERMERCADO', 'ABASTO', 'BODEGA', 'OTRO');
create type variant_type as enum ('UNIDAD', 'BULTO');
create type audit_zone as enum ('BODEGA', 'ANAQUEL');

-- ─── Profiles (extiende auth.users) ──────────────────────────
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  role       user_role not null default 'MERCADERISTA',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Helper SECURITY DEFINER: evita la recursión infinita en RLS.
-- Una política sobre `profiles` que haga `select ... from profiles` recurre
-- (ERROR 42P17). Como esta función es definer (owner postgres), salta RLS al
-- leer profiles, rompiendo el ciclo. Usar SIEMPRE esta función en políticas de
-- admin, nunca un subquery directo a profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN'
  );
$$;

-- Usuario lee y edita solo su propio row
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Admin lee todos (vía is_admin() para no recurrir)
create policy "profiles_admin_select" on public.profiles
  for select using (public.is_admin());

-- Trigger: crear profile automáticamente al registrar usuario
-- IMPORTANTE: `set search_path = public` es obligatorio. GoTrue (supabase_auth_admin)
-- ejecuta el trigger sin `public` en su search_path; sin esto falla con
-- "type user_role does not exist" → "Database error creating new user".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'MERCADERISTA'::public.user_role)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Locations ───────────────────────────────────────────────
create table public.locations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  type           location_type not null default 'SUPERMERCADO',
  sap_code       text unique not null,       -- N Cliente de la cartera
  address        text,
  region         text,
  centro_poblado text,                        -- Cabudare / Cumaná / Gürintal / Marigüitar
  municipio      text,
  tipo_cliente   text,                        -- valor crudo del Excel (BODEGAS, ABASTOS…)
  lat            decimal(10, 7),
  lng            decimal(10, 7),
  created_at     timestamptz not null default now()
);

alter table public.locations enable row level security;

-- Catálogo de lectura pública: los Server Components de campo no tienen sesión
-- Supabase (el MVP no usa Supabase Auth). La escritura solo ocurre vía route
-- handlers con service-role (que salta RLS).
create policy "locations_public_select" on public.locations
  for select using (true);

create index idx_locations_sap_code on public.locations(sap_code);
create index idx_locations_region on public.locations(region);
create index idx_locations_centro_poblado on public.locations(centro_poblado);

-- ─── Products ────────────────────────────────────────────────
create table public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  brand      text not null,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "products_public_select" on public.products
  for select using (true);

-- ─── Variants ────────────────────────────────────────────────
create table public.variants (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete cascade,
  name             text not null,
  type             variant_type not null,
  presentation_kg  decimal(5, 3) not null,
  units_per_bulk   int not null default 1,
  image_url        text,
  created_at       timestamptz not null default now()
);

alter table public.variants enable row level security;

create policy "variants_public_select" on public.variants
  for select using (true);

create index idx_variants_product_id on public.variants(product_id);

-- ─── SAP Sell-In Records ─────────────────────────────────────
-- Todos los KPIs se miden en KG (no por SKU/variante).
-- El reporte SAP entrega KG aggregados por cliente y mes, no por presentación.
create table public.sap_sell_in_records (
  id               uuid primary key default gen_random_uuid(),
  uploaded_by      uuid references public.profiles(id),  -- nullable: carga sin cuenta
  upload_batch_id  uuid not null,
  location_id      uuid not null references public.locations(id),
  product_id       uuid not null references public.products(id),
  quantity_kg      decimal(10,3) not null check (quantity_kg > 0),
  date_of_sale     date not null,
  created_at       timestamptz not null default now()
);

-- RLS habilitado sin políticas para anon/authenticated → acceso bloqueado.
-- La carga (Carga SAP) y las lecturas del dashboard usan service-role, que salta RLS.
alter table public.sap_sell_in_records enable row level security;

create index idx_sap_records_location_id on public.sap_sell_in_records(location_id);
create index idx_sap_records_product_id on public.sap_sell_in_records(product_id);
create index idx_sap_records_date_of_sale on public.sap_sell_in_records(date_of_sale);
create index idx_sap_records_batch on public.sap_sell_in_records(upload_batch_id);

-- ─── Mercaderista Visits ─────────────────────────────────────
-- El personal de campo no tiene cuenta: la identidad (nombre/apellido/cédula)
-- se declara por sesión y se denormaliza en cada registro. Los datos a nivel de
-- visita (Material POP, caras frontales, acceso a depósito) viven aquí.
create table public.mercaderista_visits (
  id                     uuid primary key default gen_random_uuid(),
  worker_first_name      text not null,
  worker_last_name       text not null,
  worker_cedula          text not null,
  location_id            uuid not null references public.locations(id),
  pop_present            boolean not null,
  -- Pregunta filtro: si no hay presencia del producto, el wizard salta
  -- directo a depósito y front_faces/product_location quedan sin capturar.
  product_present        boolean not null default true,
  product_location       text[] null,  -- 'HARINA_TRIGO' | 'OTRA_CATEGORIA'
  product_location_other text null,    -- texto libre si eligió OTRA_CATEGORIA
  front_faces            int null check (front_faces is null or front_faces >= 0),
  deposit_access         boolean not null,
  created_at             timestamptz not null default now()
);

-- RLS sin políticas anon/authenticated → solo service-role (route handlers).
alter table public.mercaderista_visits enable row level security;
create index idx_merc_visits_location on public.mercaderista_visits(location_id);
create index idx_merc_visits_created on public.mercaderista_visits(created_at);

-- ─── Inventory Audits ────────────────────────────────────────
create table public.inventory_audits (
  id                    uuid primary key default gen_random_uuid(),
  visit_id              uuid not null references public.mercaderista_visits(id) on delete cascade,
  location_id           uuid not null references public.locations(id),
  variant_id            uuid not null references public.variants(id),
  zone                  audit_zone not null,
  quantity              int not null check (quantity >= 0),
  unit_price_observed   decimal(10, 2),  -- solo en ANAQUEL
  calculated_value      decimal(12, 2),  -- solo en BODEGA
  created_at            timestamptz not null default now(),
  constraint anaquel_requires_price check (
    zone != 'ANAQUEL' or unit_price_observed is not null
  )
);

-- RLS sin políticas anon/authenticated → solo service-role.
alter table public.inventory_audits enable row level security;
create index idx_inventory_audits_visit on public.inventory_audits(visit_id);
create index idx_inventory_audits_location_variant on public.inventory_audits(location_id, variant_id);
create index idx_inventory_audits_zone on public.inventory_audits(zone);
create index idx_inventory_audits_created_at on public.inventory_audits(created_at);

-- ─── Promotion Activities ────────────────────────────────────
create table public.promotion_activities (
  id                  uuid primary key default gen_random_uuid(),
  worker_first_name   text not null,
  worker_last_name    text not null,
  worker_cedula       text not null,
  location_id         uuid not null references public.locations(id),
  report_date         date not null,
  samples_given       int not null check (samples_given >= 0),
  conversions_tracked int not null check (conversions_tracked >= 0),
  created_at          timestamptz not null default now()
);

-- RLS sin políticas anon/authenticated → solo service-role.
alter table public.promotion_activities enable row level security;
create index idx_promo_activities_location on public.promotion_activities(location_id);
create index idx_promo_activities_date on public.promotion_activities(report_date);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Productos
insert into public.products (id, name, brand) values
  ('00000000-0000-0000-0000-000000000001', 'Harina PAN',  'Empresas Polar'),
  ('00000000-0000-0000-0000-000000000002', 'Panquecitas',  'Empresas Polar');

-- Variantes con unidades por bulto confirmadas
insert into public.variants (id, product_id, name, type, presentation_kg, units_per_bulk) values
  -- Harina PAN
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'PAN 1kg Bulto',  'BULTO',  1.0, 20),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'PAN 2kg Bulto',  'BULTO',  2.0, 10),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'PAN 1kg Unidad', 'UNIDAD', 1.0, 1),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'PAN 2kg Unidad', 'UNIDAD', 2.0, 1),
  -- Panquecitas
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Panquecitas 0.4kg Bulto',  'BULTO',  0.4, 16),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Panquecitas 0.8kg Bulto',  'BULTO',  0.8, 12),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'Panquecitas 0.4kg Unidad', 'UNIDAD', 0.4, 1),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Panquecitas 0.8kg Unidad', 'UNIDAD', 0.8, 1);

-- Localidades: se cargan automáticamente desde el Excel SAP (reporte N7_V_SD88_WEB_001)
-- vía la página Admin > Carga SAP. El upsert usa sap_code como clave única.

-- ============================================================
-- GRANTS A ROLES DE API (OBLIGATORIO)
-- ============================================================
-- Sin estos GRANT base, supabase-js falla con "permission denied for table"
-- aunque las RLS estén correctas: RLS filtra filas, pero el rol necesita primero
-- el privilegio de tabla. Supabase normalmente los aplica solo, pero al crear el
-- schema vía migración hay que declararlos explícitamente. RLS sigue protegiendo
-- el acceso a nivel de fila.
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

-- Objetos futuros heredan los grants automáticamente
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;
