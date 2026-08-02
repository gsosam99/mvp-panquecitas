-- ============================================================
-- 005_sell_out — Motor de Sell-Out, Mix de Producto por presentación,
-- Sell-Out reportado por Cadenas (B2B), filtros Zona/Asesor
-- ============================================================
-- Ver: "Arreglos app Panquecitas" §Perfil DIENN (puntos 6, 7) y
-- docs/decisiones-implementacion.md para el detalle de cada decisión.
-- Corre esto manualmente en el SQL Editor de Supabase.

-- ─── Anaquel por presentación ──────────────────────────────────────
-- Se mantiene total_units_anaquel (pregunta "cuenta el total", pedida en
-- el documento anterior) y se agrega el desglose por presentación que
-- ahora hace falta para el motor de Sell-Out y el Mix de Producto — ver
-- decisión #1 de esta ronda en docs/decisiones-implementacion.md.
alter table public.mercaderista_visits
  add column if not exists anaquel_400_units int null,
  add column if not exists anaquel_800_units int null;

alter table public.mercaderista_visits
  add constraint mercaderista_visits_anaquel_400_check
  check (anaquel_400_units is null or anaquel_400_units >= 0);

alter table public.mercaderista_visits
  add constraint mercaderista_visits_anaquel_800_check
  check (anaquel_800_units is null or anaquel_800_units >= 0);

alter table public.mercaderista_visits
  add constraint mercaderista_visits_anaquel_split_check
  check (
    anaquel_400_units is null or anaquel_800_units is null
    or total_units_anaquel is null
    or (anaquel_400_units + anaquel_800_units) = total_units_anaquel
  );

-- ─── Locations: Asesor y fuente de Sell-Out ────────────────────────
alter table public.locations
  add column if not exists asesor_encargado text,
  add column if not exists fuente_sell_out text not null default 'Calculado';

alter table public.locations
  add constraint locations_fuente_sell_out_check
  check (fuente_sell_out in ('Calculado', 'Reportado_B2B'));

create index if not exists idx_locations_asesor on public.locations(asesor_encargado);

-- ─── Despachos SAP con fecha real (para el corte D-1) ──────────────
-- Independiente de sap_sell_in_records (que es mensual agregado, sin
-- fecha real por despacho — ver decisión #2 de esta ronda). El motor de
-- Sell-Out se calcula sobre esta tabla, no sobre la de Carga SAP.
-- Formato del reporte aún no confirmado: parser "best-effort" igual que
-- sap_pending_orders, a ajustar cuando llegue un archivo real.
create table if not exists public.sap_dispatches (
  id               uuid primary key default gen_random_uuid(),
  upload_batch_id  uuid not null,
  location_id      uuid not null references public.locations(id),
  variant_id       uuid references public.variants(id),
  quantity         numeric(12,2) not null check (quantity >= 0),
  dispatch_date    date not null,
  created_at       timestamptz not null default now()
);

alter table public.sap_dispatches enable row level security;
create index if not exists idx_dispatches_location on public.sap_dispatches(location_id);
create index if not exists idx_dispatches_date on public.sap_dispatches(dispatch_date);
create index if not exists idx_dispatches_batch on public.sap_dispatches(upload_batch_id);

-- ─── Sell-Out reportado por Cadenas (Key Accounts) ─────────────────
-- Columnas conocidas (a diferencia de sap_dispatches, aquí sí se dio el
-- layout exacto): Nº cliente, Fecha Inicio, Fecha Fin, Volumen/Unidades,
-- SKU opcional.
create table if not exists public.sell_out_reportado (
  id               uuid primary key default gen_random_uuid(),
  upload_batch_id  uuid not null,
  location_id      uuid not null references public.locations(id),
  variant_id       uuid references public.variants(id),
  fecha_inicio     date not null,
  fecha_fin        date not null,
  volumen          numeric(12,2) not null check (volumen >= 0),
  created_at       timestamptz not null default now()
);

alter table public.sell_out_reportado enable row level security;
create index if not exists idx_sell_out_reportado_location on public.sell_out_reportado(location_id);
create index if not exists idx_sell_out_reportado_fechas on public.sell_out_reportado(fecha_inicio, fecha_fin);

-- ─── Grants ─────────────────────────────────────────────────────────
grant all on public.sap_dispatches to anon, authenticated, service_role;
grant all on public.sell_out_reportado to anon, authenticated, service_role;
