-- ============================================================
-- 012_dias_visita — plan de visita por día de la semana en locations
-- ============================================================
-- El maestro de clientes de SAP (N7_V_SD56) y el maestro de indirectos traen,
-- por cliente, en qué días de la semana está programada su visita ("X" en las
-- columnas Lunes..Domingo). Ese plan es el denominador de la "tasa de
-- efectividad" de los gráficos de cartera por ciudad×modelo (decisión con
-- Alejandro, 12-08-2026): efectividad = clientes con ventas (Radar / facturado)
-- ÷ clientes que tocaba visitar ese día.
--
-- Se guarda como texto: los días ISO programados separados por coma
-- (1=Lunes … 7=Domingo). Ej: "1,3,5". Vacío/null = sin plan cargado.
--
-- Corre esto manualmente en el proyecto Supabase (SQL editor o CLI).

alter table public.locations add column if not exists dias_visita text;

comment on column public.locations.dias_visita is
  'Plan de visita: días de la semana programados (ISO 1=Lun..7=Dom) separados por coma, ej "1,3,5". Se carga desde el Modelo de Atención (N7_V_SD56 / maestro de indirectos).';
