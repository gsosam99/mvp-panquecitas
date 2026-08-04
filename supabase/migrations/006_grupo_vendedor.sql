-- ============================================================
-- 006_grupo_vendedor — Grupo vendedor por cliente (filtro Admin)
-- ============================================================
-- El perfil Administrador necesita filtrar los gráficos y las listas de
-- incidencias por grupo vendedor (ej. U29, U30), un nivel más fino que la
-- Oficina de Venta: ambos grupos pueden vivir dentro de la misma oficina
-- (confirmado: U29 y U30 son los dos de CUMANA), así que no se puede
-- derivar del sector ni del asesor.
--
-- Se llena desde la columna "Grupo vendedor" del Excel de cartera de
-- clientes (ver CARTERA_HEADER_ALIASES en src/lib/excel-parser.ts). Queda
-- nullable: los clientes cargados antes de que el archivo traiga esa
-- columna simplemente no aparecen bajo ningún grupo, y el filtro del
-- dashboard solo lista los grupos que existan en la cartera.
--
-- Corre esto manualmente en el proyecto Supabase (SQL editor o CLI).

alter table public.locations
  add column if not exists grupo_vendedor text;

create index if not exists idx_locations_grupo_vendedor on public.locations(grupo_vendedor);

comment on column public.locations.grupo_vendedor is
  'Grupo vendedor de SAP que atiende al cliente (ej. U29, U30). Subdivisión dentro de la Oficina de Venta.';
