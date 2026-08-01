-- ============================================================
-- 003_sectores_roster_pop — Login por cédula, sectorización por
-- Oficina de Venta, nuevas preguntas Mercaderista, pedidos pendientes
-- ============================================================
-- Ver: "Cambios en app Panquecitas - Versión Ale" (todas las pestañas) y
-- docs/decisiones-implementacion.md para el detalle de cada decisión.
-- Corre esto manualmente en el proyecto Supabase (SQL editor o CLI).

-- ─── Locations: sectorización por Oficina de Venta ───────────────
-- Reemplaza el filtrado por 4 centros poblados (Cabudare/Cumaná/
-- Marigüitar/Güirintal) por 2 sectores de Oficina de Venta
-- ("CUMANA" / "BARQUISIMETO ESTE"). Se conserva centro_poblado para
-- referencia/visualización, pero el universo/filtrado usa este campo.
alter table public.locations
  add column if not exists oficina_venta text;

create index if not exists idx_locations_oficina_venta on public.locations(oficina_venta);

-- ─── Field workers: roster autorizado de personal de campo ───────
-- El login de Promotora/Mercaderista deja de aceptar nombre/apellido
-- libres: solo cédula, validada contra este roster (decisión #1/#2 en
-- docs/decisiones-implementacion.md).
create table if not exists public.field_workers (
  id             uuid primary key default gen_random_uuid(),
  cedula         text not null unique,
  first_name     text not null,
  last_name      text not null,
  role           user_role not null,
  oficina_venta  text not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint field_workers_role_check check (role in ('MERCADERISTA', 'PROMOTORA'))
);

alter table public.field_workers enable row level security;
-- Sin políticas anon/authenticated → solo service-role (route handlers),
-- mismo patrón que mercaderista_visits / promotion_activities.
create index if not exists idx_field_workers_cedula on public.field_workers(cedula);

insert into public.field_workers (cedula, first_name, last_name, role, oficina_venta) values
  ('30124915', 'Mariana',  'Di Buongrazio', 'PROMOTORA',    'BARQUISIMETO ESTE'),
  ('29611053', 'Mikhaela', 'Barboza',       'MERCADERISTA', 'BARQUISIMETO ESTE'),
  ('20675455', 'Imalay',   'Castro',        'PROMOTORA',    'CUMANA'),
  ('1234',     'Isabella', 'Maggio',        'MERCADERISTA', 'CUMANA')
on conflict (cedula) do update set
  first_name    = excluded.first_name,
  last_name     = excluded.last_name,
  role          = excluded.role,
  oficina_venta = excluded.oficina_venta;

-- ─── Mercaderista visits: nuevas preguntas del wizard ─────────────
-- Mensaje central del POP, preciador con precio marcado, materiales
-- visibles, módulo de precio por presentación (con "no disponible") y
-- módulo de conteo en anaquel (total único + caras frontales + caras
-- de harina de trigo). Ver decisión #6: el conteo por presentación en
-- anaquel (400g/800g por separado) se retira — total_units_anaquel es
-- ahora un único agregado, ya no se insertan filas ANAQUEL en
-- inventory_audits (esa zona queda como legado histórico no destructivo).
alter table public.mercaderista_visits
  add column if not exists pop_message           text null,
  add column if not exists pop_price_tag         boolean null,
  add column if not exists pop_materials         text[] null,
  add column if not exists pop_materials_other   text null,
  add column if not exists price_400             numeric(10,2) null,
  add column if not exists price_400_na          boolean not null default false,
  add column if not exists price_800             numeric(10,2) null,
  add column if not exists price_800_na          boolean not null default false,
  add column if not exists total_units_anaquel   int null,
  add column if not exists harina_trigo_faces    int null;

alter table public.mercaderista_visits
  add constraint mercaderista_visits_pop_message_check
  check (pop_message is null or pop_message in ('SIEMPRE_GANAS', 'ALIMENTA_IDEAS'));

alter table public.mercaderista_visits
  add constraint mercaderista_visits_total_units_anaquel_check
  check (total_units_anaquel is null or total_units_anaquel >= 0);

alter table public.mercaderista_visits
  add constraint mercaderista_visits_harina_trigo_faces_check
  check (harina_trigo_faces is null or harina_trigo_faces >= 0);

-- ─── Pedidos pendientes por entregar (DIENN) ──────────────────────
-- Formato del reporte SAP aún no confirmado (ver decisión #13):
-- tabla y parser genéricos, a ajustar cuando llegue un archivo real.
create table if not exists public.sap_pending_orders (
  id               uuid primary key default gen_random_uuid(),
  upload_batch_id  uuid not null,
  location_id      uuid not null references public.locations(id),
  product_id       uuid references public.products(id),
  quantity         numeric(12,2) not null check (quantity >= 0),
  order_date       date null,
  notes            text null,
  created_at       timestamptz not null default now()
);

alter table public.sap_pending_orders enable row level security;
-- Sin políticas anon/authenticated → solo service-role, mismo patrón
-- que sap_sell_in_records.
create index if not exists idx_pending_orders_location on public.sap_pending_orders(location_id);
create index if not exists idx_pending_orders_batch on public.sap_pending_orders(upload_batch_id);

-- ─── Grants (mismo motivo que en schema.sql: RLS filtra filas, pero
-- el rol necesita primero el privilegio de tabla) ─────────────────
grant all on public.field_workers to anon, authenticated, service_role;
grant all on public.sap_pending_orders to anon, authenticated, service_role;
