-- ============================================================
-- 007_sap_facturacion_pedidos — Esquema de Atención y Zona de Ventas
-- ============================================================
-- El reporte real de SAP para Panquecitas (N7_V_SD83_WEB_001, el que trae
-- Cantidad Pedido/Entregada/Facturada) incluye dos campos de cliente que
-- todavía no vivían en locations:
--   - Esquema de Atención (Directo / Mixto / Indirecto)
--   - Zona de Ventas (ej. V07N01, V44N02) — nivel más fino que Área de
--     Ventas (Ofic. Vta), que ya se guarda en oficina_venta.
--
-- Se llenan desde la carga de "Carga SAP" (ver parseSapFacturacionMhtml en
-- src/lib/sap-mhtml-parser.ts). Quedan nullable por la misma razón que
-- grupo_vendedor (ver 006): los clientes cargados antes de que el reporte
-- trajera estas columnas simplemente no las tienen.
--
-- Corre esto manualmente en el proyecto Supabase (SQL editor o CLI).

alter table public.locations
  add column if not exists esquema_atencion text;

alter table public.locations
  add column if not exists zona_venta text;

comment on column public.locations.esquema_atencion is
  'Esquema de Atención de SAP (Directo / Mixto / Indirecto).';

comment on column public.locations.zona_venta is
  'Zona de Ventas de SAP (ej. V07N01, V44N02) — subdivisión dentro de la Oficina de Venta, distinta de grupo_vendedor.';
