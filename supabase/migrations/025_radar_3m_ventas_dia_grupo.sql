-- 025_radar_3m_ventas_dia_grupo — grupo vendedor en las filas diarias del 3M.
--
-- La tabla de Combinaciones del Piloto mide la Harina PAN de mayo–julio por
-- GRUPO VENDEDOR con todos los clientes que el Radar trae en ese grupo, estén
-- o no en la cartera (DIENN, 17-09-2026). La cartera solo sabe el grupo de sus
-- propios PDV, así que el grupo tiene que venir del archivo.
--
-- Nullable: las filas cargadas antes de este migration no lo tienen, y la
-- consulta las resuelve contra la cartera. Hay que volver a subir el reporte
-- de 3 meses para llenarlo.

alter table public.radar_3m_ventas_dia
  add column if not exists grupo_vendedor text;

create index if not exists idx_radar3m_dia_grupo on public.radar_3m_ventas_dia(grupo_vendedor);
