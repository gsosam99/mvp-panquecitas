-- 026_ciudad_completa — bqto_3m_ventas pasa a guardar varias ciudades.
--
-- El módulo "Barquisimeto completo" (migration 025) se extiende a Cumaná y a
-- la suma de las dos (DIENN, 24-09-2026). Mismo reporte, misma tabla: cada
-- fila lleva su ciudad y cada carga reemplaza SOLO la de su ciudad.
--
-- Las filas que ya estaban son de Barquisimeto: el default las marca así, no
-- hay que volver a subir ese archivo.

alter table public.bqto_3m_ventas
  add column if not exists ciudad text not null default 'barquisimeto';

-- La llave única incluye la ciudad: un cliente + material + día no choca con
-- el de otra ciudad.
alter table public.bqto_3m_ventas
  drop constraint if exists bqto_3m_ventas_sap_code_material_code_date_of_sale_key;

alter table public.bqto_3m_ventas
  add constraint bqto_3m_ventas_ciudad_sap_code_material_code_date_of_sale_key
  unique (ciudad, sap_code, material_code, date_of_sale);

create index if not exists idx_bqto3m_ciudad on public.bqto_3m_ventas(ciudad);
