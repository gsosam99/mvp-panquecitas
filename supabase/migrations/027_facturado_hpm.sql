-- 027_facturado_hpm — "Pedidos y Facturado" de Harina PAN, por DÍA.
--
-- Alimenta el botón "Facturado" del gráfico "Rendimiento Diario vs. Baseline
-- de Harina PAN" de DIENN y sus tarjetas por tramo (DIENN, 05-10-2026): la
-- Panquecitas facturada (sap_pedidos_facturados) contra la Harina PAN
-- facturada de esta tabla, en los baselines mayo–julio, julio–septiembre y
-- agosto–septiembre.
--
-- Va en su propia tabla y no en sap_pedidos_facturados, que es solo de
-- Panquecitas y la leen el volumen facturado, el Mix de Producto, la demanda
-- insatisfecha y la carga de Efectividad.
--
-- Se guarda por SAP_CODE, como radar_3m_ventas_dia: el cliente se resuelve
-- contra la cartera al LEER, así que una tanda nueva de cartera entra sola
-- sin volver a subir el reporte. Solo se guardan los clientes que existen en
-- `locations` (cartera, fuera de cartera, distribuidoras y franquiciadas) y
-- los materiales de Harina PAN (H187, H439).
--
-- Se puebla desde /api/facturado-hpm-upload (menú "Facturado Harina PAN").
-- Cada carga REEMPLAZA los meses que trae el archivo, así que se puede subir
-- mes por mes o todo junto.

create table if not exists public.facturado_hpm_dia (
  id                    uuid primary key default gen_random_uuid(),
  sap_code              text not null,
  material_code         text not null,
  -- Negativos permitidos: las notas de crédito restan (igual que la 021).
  cantidad_pedido_kg    numeric(14,3) not null default 0,
  cantidad_facturada_kg numeric(14,3) not null default 0,
  fecha                 date not null,
  upload_batch_id       uuid,
  created_at            timestamptz not null default now(),
  unique (sap_code, material_code, fecha)
);

-- RLS habilitado sin políticas: solo service-role accede, igual que
-- radar_3m_ventas_dia.
alter table public.facturado_hpm_dia enable row level security;

create index if not exists idx_facturado_hpm_fecha on public.facturado_hpm_dia(fecha);
create index if not exists idx_facturado_hpm_batch on public.facturado_hpm_dia(upload_batch_id);
