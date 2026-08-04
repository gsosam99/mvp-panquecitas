// Lista única de columnas de `locations` para los .select() de Supabase.
//
// Estaba repetida literal en 5 archivos y se desincronizó: los selects no
// pedían `asesor_encargado` ni `fuente_sell_out`, aunque el tipo Location
// los declara y el motor de Sell-Out los lee (computeSellOut → los clientes
// Reportado_B2B nunca entraban por su rama, y el filtro por asesor de DIENN
// no encontraba a nadie). Centralizarlo evita que vuelva a pasar al agregar
// columnas nuevas.
export const LOCATION_COLUMNS =
  "id, name, type, sap_code, address, region, centro_poblado, municipio, tipo_cliente, oficina_venta, grupo_vendedor, asesor_encargado, fuente_sell_out, lat, lng";
