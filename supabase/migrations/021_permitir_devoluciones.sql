-- 021_permitir_devoluciones — las notas de crédito son cantidades negativas.
--
-- Los reportes SAP traen devoluciones como filas con cantidad NEGATIVA. En el
-- export del 24-08-2026, CITY MART devolvió 76,80 kg de Q148 y el reporte de
-- Pedidos y Facturado traía otras dos filas por -83,20 kg.
--
-- Las dos tablas exigían cantidades positivas, así que la carga no podía
-- guardarlas: el Radar descartaba la fila entera y Pedidos y Facturado la
-- recortaba a 0. El resultado es que una devolución no restaba — se perdía —
-- y el dashboard quedaba POR ENCIMA del reporte:
--
--   Radar Panquecitas   5.663,60 kg guardados vs 5.586,80 del reporte
--   Facturado           9.298,40 kg guardados vs 9.215,20 del reporte
--
-- La diferencia era exactamente el monto devuelto. Y no había forma de
-- notarlo desde el dashboard, porque el reporte nunca vuelve a mencionar la
-- fila descartada.
--
-- El check tenía sentido cuando la tabla guardaba un ACUMULADO mensual, que
-- efectivamente no puede ser negativo. Desde que guarda un movimiento por día
-- (ver migration 020 y la Carga Radar), un movimiento negativo es un dato
-- legítimo: la devolución ocurrió ese día.
--
-- Se conserva el rechazo del CERO en el Radar: una fila en cero no es un
-- movimiento, es ruido del reporte.

-- Los checks se crearon sin nombre explícito, así que Postgres les puso el
-- suyo. Se buscan por columna en vez de asumir el nombre, para que esto
-- funcione igual si en algún entorno quedaron con otro.
do $$
declare
  c record;
begin
  for c in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and con.contype = 'c'
      and (
        (rel.relname = 'sap_sell_in_records' and pg_get_constraintdef(con.oid) ilike '%quantity_kg%')
        or (rel.relname = 'sap_pedidos_facturados' and pg_get_constraintdef(con.oid) ilike '%cantidad_%_kg%')
      )
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

-- El Radar sigue sin aceptar movimientos en cero.
alter table public.sap_sell_in_records
  add constraint sap_sell_in_records_quantity_kg_check check (quantity_kg <> 0);

comment on column public.sap_sell_in_records.quantity_kg is
  'Kg del movimiento de ese día. Negativo = devolución / nota de crédito. Nunca cero.';

comment on column public.sap_pedidos_facturados.cantidad_facturada_kg is
  'Kg facturados en la fecha. Puede ser negativo: una nota de crédito resta.';
