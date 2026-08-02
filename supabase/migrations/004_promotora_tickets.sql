-- ============================================================
-- 004_promotora_tickets — Sistema de tickets para Promotora
-- ============================================================
-- Reemplaza "muestras entregadas" / "compras confirmadas" por un sistema
-- de tickets físicos (rollo de 80): tickets entregados, tickets recibidos
-- (redimidos por un regalo) y tickets intactos (sobrantes). Ver "Arreglos
-- app Panquecitas" §Perfil promotora y docs/decisiones-implementacion.md.
-- Corre esto manualmente en el SQL Editor de Supabase.

alter table public.promotion_activities
  rename column samples_given to tickets_entregados;

alter table public.promotion_activities
  rename column conversions_tracked to tickets_recibidos;

alter table public.promotion_activities
  add column if not exists tickets_intactos int not null default 0 check (tickets_intactos >= 0);

comment on column public.promotion_activities.tickets_entregados is
  'Tickets entregados a consumidores en la degustación (antes: samples_given)';
comment on column public.promotion_activities.tickets_recibidos is
  'Tickets recibidos/redimidos por un regalo (antes: conversions_tracked)';
comment on column public.promotion_activities.tickets_intactos is
  'Tickets sobrantes al final del día. tickets_entregados + tickets_intactos debe ser 80 (validado en la app, no a nivel de DB, para no atar el esquema al tamaño del rollo actual).';
