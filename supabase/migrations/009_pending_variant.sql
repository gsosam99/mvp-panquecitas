-- ============================================================
-- 009_pending_variant — Presentación (400g/800g) en pedidos pendientes
-- ============================================================
-- La gráfica "Pedido vs Ventas Panquecitas" de DIENN necesita el desglose
-- por presentación también de lo pedido: Pedida = Facturada + Pendiente
-- por material (CR/Q147 = 400g, CR/Q148 = 800g). Hasta ahora
-- sap_pending_orders solo guardaba product_id.
--
-- Corre esto manualmente en el proyecto Supabase (SQL editor o CLI).
-- Requiere que 008_sell_in_variant.sql ya esté aplicada (misma idea de
-- variant_id) y que se vuelva a cargar el reporte de facturación para
-- llenar las filas nuevas.

alter table public.sap_pending_orders
  add column if not exists variant_id uuid references public.variants(id);

create index if not exists idx_pending_orders_variant_id on public.sap_pending_orders(variant_id);

comment on column public.sap_pending_orders.variant_id is
  'Presentación pedida aún no facturada (400g/800g) cuando el reporte SAP lo trae por material.';
