-- 016_segmento_cliente — segmentación de cartera por cliente.
--
-- Campo "Segmento de Clientes 2" del reporte de Cartera Consolidada. Es una
-- segmentación distinta de tipo_cliente (que es el giro del negocio:
-- panadería, supermercado…) y es la que pidió DIENN para el ranking de
-- volumen por segmento (punto 2 del documento de cambios, 18-08-2026).
--
-- Se llena desde la Carga de Cartera. Los clientes que no traigan el campo
-- quedan en null y el ranking los agrupa como "Sin segmento".

alter table public.locations
  add column if not exists segmento_cliente text;

create index if not exists idx_locations_segmento
  on public.locations(segmento_cliente);
