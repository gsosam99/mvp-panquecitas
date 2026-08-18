-- 014_bcv_rates — histórico de la tasa BCV por fecha.
--
-- El wizard de campo ya deja capturar el precio en Bs y lo convierte a USD
-- antes de guardarlo (/api/bcv-rate). Pero cuando el mercaderista deja el
-- selector en USD y teclea el monto en Bs, el precio entra crudo: valores de
-- cientos de Bs contra objetivos de 1,2–2,85 USD. Esa corrección se hace al
-- leer (ver src/lib/bcv.ts) y necesita la tasa DEL DÍA DE LA VISITA, no la de
-- hoy — de ahí este histórico.
--
-- La API pública del BCV solo expone la tasa vigente (no hay endpoint
-- histórico), así que la tabla se va llenando sola: cada carga de dashboard
-- guarda la tasa del día si todavía no está. Para fechas anteriores a la
-- primera fila se usa la tasa conocida más cercana (ver rateAt()).

create table if not exists public.bcv_rates (
  fecha      date primary key,
  tasa       numeric(14,4) not null check (tasa > 0),
  fuente     text not null default 've.dolarapi.com/v1/dolares/oficial',
  created_at timestamptz not null default now()
);

-- RLS habilitado sin políticas: solo service-role, igual que el resto de las
-- tablas que alimentan los dashboards.
alter table public.bcv_rates enable row level security;
