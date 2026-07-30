-- ============================================================
-- 002_indicadores — Nuevo flujo de captura de campo (Mercaderista)
-- ============================================================
-- Ver: "Modificaciones en Indicadores app Panquecitas" §5.
-- Corre esto manualmente en el proyecto Supabase (SQL editor o CLI).

-- Pregunta filtro "¿Hay presencia del producto en el local?" y, si la hay,
-- dónde se encuentra (junto a harina de trigo / otra categoría).
alter table public.mercaderista_visits
  add column if not exists product_present boolean not null default true,
  add column if not exists product_location text[] null,
  add column if not exists product_location_other text null;

-- front_faces deja de ser obligatorio: si product_present = false, el
-- wizard salta directo a depósito y no se captura caras frontales.
alter table public.mercaderista_visits
  drop constraint if exists mercaderista_visits_front_faces_check;

alter table public.mercaderista_visits
  alter column front_faces drop not null;

alter table public.mercaderista_visits
  add constraint mercaderista_visits_front_faces_check
  check (front_faces is null or front_faces >= 0);
