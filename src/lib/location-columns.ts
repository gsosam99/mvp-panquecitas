// Lista única de columnas de `locations` para los .select() de Supabase.
//
// Estaba repetida literal en 5 archivos y se desincronizó: los selects no
// pedían `asesor_encargado` ni `fuente_sell_out`, aunque el tipo Location
// los declara y el motor de Sell-Out los lee (computeSellOut → los clientes
// Reportado_B2B nunca entraban por su rama, y el filtro por asesor de DIENN
// no encontraba a nadie). Centralizarlo evita que vuelva a pasar al agregar
// columnas nuevas.
export const LOCATION_COLUMNS =
  "id, name, type, sap_code, address, region, centro_poblado, municipio, tipo_cliente, oficina_venta, grupo_vendedor, esquema_atencion, dias_visita, zona_venta, asesor_encargado, fuente_sell_out, lat, lng";

// Igual que la anterior más `segmento_cliente` (migration 016), que solo
// necesita el ranking por segmento de DIENN.
//
// Va aparte a propósito: si se pide una columna que la base todavía no tiene,
// Supabase falla la query ENTERA y quien la use se queda sin datos — el
// dashboard sin universo y las apps de campo sin lista de PDV. Dejando la
// lista base como la de siempre, un deploy anterior a correr el migration solo
// afecta al ranking por segmento, y getUniverseLocations() ni siquiera eso
// porque reintenta con la lista base.
export const LOCATION_COLUMNS_CON_SEGMENTO = `${LOCATION_COLUMNS}, segmento_cliente`;
