-- 020_fecha_incorporacion — el universo del piloto deja de ser un número fijo.
--
-- Hasta ahora el denominador de todas las tasas (penetración, activación,
-- efectividad) era la constante UNIVERSAL_CLIENTES_PILOTO = 358 en
-- src/lib/dienn-queries.ts: la cartera se asumía inmutable. Al incorporar
-- clientes nuevos eso rompe de dos maneras, las dos malas:
--
--   - si la constante se deja en 358, los porcentajes mienten (numerador con
--     clientes que el denominador no cuenta);
--   - si se sube a mano, TODA la serie histórica se hunde de golpe, porque
--     las semanas de agosto pasan a dividirse entre una cartera que en esa
--     fecha todavía no existía.
--
-- La solución es darle dimensión de tiempo al universo: cada cliente sabe
-- desde cuándo forma parte de la cartera, y cada punto de cada serie divide
-- entre los clientes vigentes AL CIERRE DE ESE BUCKET. Las semanas viejas
-- siguen dividiendo entre 358; las nuevas, entre la cartera ampliada.
--
-- Calendario de incorporación (Alejandro, 21-08-2026):
--   2026-08-03  Piloto original — los 358 de la cartera actual.
--   2026-08-14  Indirecto Cumaná — PDV reales de los grupos vendedores U27
--               y U28 (el modelo indirecto en Cumaná no existía antes).
--   2026-08-24  Ampliación — el resto del archivo de cartera consolidada.
--
-- Las reglas de asignación viven en src/lib/cohortes.ts y se aplican en la
-- Carga de Cartera. Este migration solo estampa a los que YA están.

alter table public.locations
  add column if not exists fecha_incorporacion date;

alter table public.locations
  add column if not exists cohorte text;

comment on column public.locations.fecha_incorporacion is
  'Fecha desde la que el cliente cuenta en el universo del piloto. Los indicadores lo ignoran (numerador Y denominador) en cualquier bucket anterior a esta fecha. NULL = todavía sin cohorte asignada; la Carga de Cartera la resuelve por regla (ver src/lib/cohortes.ts).';

comment on column public.locations.cohorte is
  'Nombre legible de la tanda de incorporación ("Piloto original", "Indirecto Cumaná", "Ampliación"). Solo para mostrar y auditar; los cálculos usan fecha_incorporacion.';

create index if not exists idx_locations_fecha_incorporacion
  on public.locations(fecha_incorporacion);

-- ── Backfill del piloto original ──────────────────────────────────
-- Se estampan SOLO los clientes que hoy caen en un sector piloto, que son
-- los que forman el universo actual. Las filas de `locations` que quedaron
-- de cargas viejas de reportes fuera de esos sectores se dejan en NULL a
-- propósito: si alguna aparece en el archivo consolidado como cliente nuevo,
-- debe recibir la fecha de SU tanda, no la del piloto original.
--
-- El LIKE cubre "CUMANA" y "CUMANÁ" (la cartera viene sin tilde, pero el
-- roster de personal y algunas cargas traen la forma acentuada) — mismo
-- criterio que sectorGroup() en src/lib/sectors.ts.
update public.locations
set fecha_incorporacion = date '2026-08-03',
    cohorte             = 'Piloto original'
where fecha_incorporacion is null
  and (
    upper(oficina_venta) like 'CUMAN%'
    or upper(oficina_venta) like 'BARQUISIMETO ESTE%'
  );
