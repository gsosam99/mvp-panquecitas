-- 024_radar_3m_ventas_dia — "Radar últimos 3 Meses" guardado por DÍA.
--
-- radar_3m_records colapsa el reporte a una fila por cliente+material+MES (el
-- último corte), y así lo sigue haciendo: de esa tabla sale el gráfico de
-- rendimiento diario vs. promedio 3M, que DIENN verificó a mano y NO se toca.
--
-- El gráfico ADICIONAL "solo segmentos foco y solo recompra" (DIENN,
-- 14-09-2026) necesita saber cuál fue la PRIMERA compra de Harina PAN de cada
-- cliente para descartarla, y con una fila por mes esa fecha ya no existe. Esta
-- tabla guarda cada fila del archivo tal como la lee hoy el parser: una por
-- cliente + material + día, con su kg.
--
-- Se puebla desde la misma carga (/api/radar-3m-upload) y cada carga la
-- REEMPLAZA entera, igual que radar_3m_records. Hay que volver a subir el
-- reporte de 3 meses después de correr este migration.

create table if not exists public.radar_3m_ventas_dia (
  id              uuid primary key default gen_random_uuid(),
  sap_code        text not null,
  material_code   text not null,
  product_id      uuid not null references public.products(id) on delete cascade,
  quantity_kg     numeric(14,3) not null,
  date_of_sale    date not null,
  upload_batch_id uuid,
  created_at      timestamptz not null default now(),
  unique (sap_code, material_code, date_of_sale)
);

-- RLS habilitado sin políticas: solo service-role accede, igual que
-- radar_3m_records.
alter table public.radar_3m_ventas_dia enable row level security;

create index if not exists idx_radar3m_dia_product on public.radar_3m_ventas_dia(product_id);
create index if not exists idx_radar3m_dia_batch on public.radar_3m_ventas_dia(upload_batch_id);
