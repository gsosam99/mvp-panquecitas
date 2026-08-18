-- 015_radar_fechas_batch — marca de qué carga viene cada fecha de Radar.
--
-- radar_ventas_fechas se llenaba acumulando: cada carga hacía upsert y nada
-- borraba las filas viejas, ni siquiera borrar el batch desde la pantalla de
-- carga (el DELETE solo limpiaba sap_sell_in_records y sap_pedidos_facturados).
-- Resultado: fechas de reportes corregidos o eliminados seguían contando y la
-- tasa de recompra subía sola entre un día y otro.
--
-- Decisión con DIENN (18-08-2026): el reporte Radar se exporta con TODO el
-- período, así que la última carga es la única verdad. Con esta columna, la
-- carga marca sus filas y borra las que quedaron de cargas anteriores.

alter table public.radar_ventas_fechas
  add column if not exists upload_batch_id uuid;

create index if not exists idx_radar_fechas_batch
  on public.radar_ventas_fechas(upload_batch_id);
