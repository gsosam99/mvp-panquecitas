-- ============================================================
-- 008_sell_in_variant — Presentación (400g/800g) en Sell-In SAP
-- ============================================================
-- El Mix de Producto de DIENN se calcula a partir de la cantidad facturada
-- por presentación (reporte N7_V_SD83_WEB_001 → sap_sell_in_records).
-- Hasta ahora esa tabla solo guardaba product_id (Panquecitas), sin el
-- desglose 400g/800g que sí trae el material (CR/Q147 = 400g, CR/Q148 =
-- 800g). Se agrega variant_id nullable: las cargas mensuales de Harina
-- PAN y los seeds antiguos quedan sin presentación; las filas nuevas de
-- facturación Panquecitas sí la llevan.
--
-- Corre esto manualmente en el proyecto Supabase (SQL editor o CLI).

alter table public.sap_sell_in_records
  add column if not exists variant_id uuid references public.variants(id);

create index if not exists idx_sap_records_variant_id on public.sap_sell_in_records(variant_id);

comment on column public.sap_sell_in_records.variant_id is
  'Presentación facturada (400g/800g) cuando el reporte SAP lo trae por material. Null en cargas mensuales agregadas o filas sin SKU reconocible.';
