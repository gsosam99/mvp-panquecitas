-- 025_bqto_3m_ventas — Harina PAN de 3 meses de BARQUISIMETO COMPLETO.
--
-- Módulo aparte (DIENN, 24-09-2026): proyecta la meta del 4% y la activación
-- del piloto sobre toda la ciudad. NO es cartera ni piloto: no se cruza con
-- `locations`, no toca radar_3m_records ni sap_sell_in_records y no alimenta
-- nada del Dashboard principal. Solo lo lee la página /bqto-completo.
--
-- El reporte es el mismo Radar N7_V_SD88_WEB_001 (una fila por cliente +
-- material + día, con la venta de ese día), así que se guarda tal cual, sin
-- colapsar: el total es la suma de las filas. El tipo de cliente viaja con
-- cada fila porque de él sale el corte de segmentos foco (ver
-- src/lib/bqto-completo.ts) — el archivo no trae "Segmento de Clientes 2".
--
-- Cada carga REEMPLAZA la anterior (upload_batch_id + borrado de lo viejo),
-- igual que radar_3m_records.

create table if not exists public.bqto_3m_ventas (
  id              uuid primary key default gen_random_uuid(),
  sap_code        text not null,
  client_name     text,
  tipo_cliente    text,
  esquema_atencion text,
  oficina_venta   text,
  material_code   text not null,
  quantity_kg     numeric(14,3) not null,
  date_of_sale    date not null,
  upload_batch_id uuid,
  created_at      timestamptz not null default now(),
  unique (sap_code, material_code, date_of_sale)
);

-- RLS habilitado sin políticas: solo service-role accede, igual que
-- radar_3m_records.
alter table public.bqto_3m_ventas enable row level security;

create index if not exists idx_bqto3m_batch on public.bqto_3m_ventas(upload_batch_id);
