-- ============================================================
-- 011_motivos_no_venta — Reporte SAP de Efectividad de Visita / Motivos de
-- No Venta (N7_V_SD85_WEB_001_OP).
-- ============================================================
-- Export "Web Page, Single File" de SAP BW (MHTML con extensión .xls). Una
-- fila por cliente + material + justificación, con 3 porcentajes de
-- efectividad (visita / pedidos / ventas). La "Justificación" es el motivo:
--   - "Venta Efectiva"  → hubo venta.
--   - "NVE ..."         → No Venta Efectiva (el motivo de no venta).
--
-- El reporte NO trae fecha: es un snapshot. Por ahora no se maneja fecha —
-- cada carga REEMPLAZA por completo la anterior (la tabla siempre refleja el
-- último reporte montado, sin acumular ni duplicar).
--
-- Clasificación No Activación vs No Recompra (se calcula al cargar, ver
-- decisión con Alejandro 11-08-2026): se cruza cada cliente contra el
-- historial de facturación (sap_pedidos_facturados, cantidad_facturada > 0):
--   - NO_ACTIVACION → cliente que nunca ha facturado.
--   - NO_RECOMPRA   → cliente que ya facturó antes pero aquí no vendió.
--   - VENTA_EFECTIVA → filas de "Venta Efectiva" (no son motivo de no venta,
--     se guardan para la métrica de efectividad de visita).
--
-- Corre esto manualmente en el proyecto Supabase (SQL editor o CLI).

create table if not exists public.sap_motivos_no_venta (
  id                   uuid primary key default gen_random_uuid(),
  upload_batch_id      uuid not null,
  -- Nullable: un cliente del reporte puede no estar en la cartera. Se
  -- conservan sap_code + client_name crudos para no perder la fila.
  location_id          uuid references public.locations(id),
  sap_code             text not null,
  client_name          text,
  material_name        text,
  justificacion        text not null,   -- motivo crudo del reporte
  tipo                 text not null check (tipo in ('NO_ACTIVACION','NO_RECOMPRA','VENTA_EFECTIVA')),
  efectividad_visita   decimal(5,2),
  efectividad_pedidos  decimal(5,2),
  efectividad_ventas   decimal(5,2),
  created_at           timestamptz not null default now()  -- momento de la carga
);

comment on table public.sap_motivos_no_venta is
  'Reporte SAP N7_V_SD85 (Efectividad de Visita / Motivos de No Venta). tipo se calcula al cargar cruzando con el historial de facturación. Cada carga reemplaza por completo la anterior (sin acumular).';

alter table public.sap_motivos_no_venta enable row level security;
-- Sin políticas anon/authenticated → solo service-role, mismo patrón que sap_pedidos_facturados.

create index if not exists idx_motivos_no_venta_location on public.sap_motivos_no_venta(location_id);
create index if not exists idx_motivos_no_venta_tipo on public.sap_motivos_no_venta(tipo);
create index if not exists idx_motivos_no_venta_batch on public.sap_motivos_no_venta(upload_batch_id);

grant all on public.sap_motivos_no_venta to anon, authenticated, service_role;
