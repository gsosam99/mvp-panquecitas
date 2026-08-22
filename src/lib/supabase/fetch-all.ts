// Lectura paginada para las queries que traen "toda la tabla".
//
// PostgREST corta las respuestas en 1000 filas por defecto y NO avisa: la
// query devuelve `data` con 1000 elementos y sin error, así que el recorte
// pasa totalmente inadvertido. Peor: como el recorte depende del orden que
// devuelva la base, castiga sistemáticamente a unos clientes sobre otros.
//
// Esto no era un problema con 358 clientes de cartera. Al ampliarse a más de
// 1100 (agosto 2026), `locations` pasó el tope y el dashboard empezó a
// calcular sobre 1000 de 1112 clientes — el volumen de los 112 restantes
// simplemente desaparecía, y el número bajaba cada vez que la cartera crecía.
//
// Regla: cualquier query cuyo número de filas crezca con la cartera, con los
// meses cargados o con las visitas de campo tiene que pasar por acá.

/** Tamaño de página. Coincide con el tope por defecto de Supabase. */
const PAGINA = 1000;

/**
 * Ejecuta la query construida por `build` tantas veces como haga falta y
 * devuelve TODAS las filas.
 *
 * `build` se llama una vez por página y tiene que devolver una query nueva
 * cada vez: los builders de supabase-js son mutables y reutilizar uno acumula
 * los `.range()` de las llamadas anteriores.
 *
 * `orderBy` debe ser una columna con valores únicos y estables (por defecto
 * "id", que todas estas tablas tienen). Sin un orden determinista, PostgREST
 * no garantiza que las páginas no se solapen ni que no se salteen filas.
 *
 * El cliente de service-role no está tipado (ver createSupabaseServiceClient),
 * así que el builder entra como `any` y el tipo de la fila lo pone quien llama
 * — igual que en el resto de estas queries.
 */
/**
 * Igual que fetchAllRows pero para queries que filtran con `.in(col, ids)`
 * sobre una lista larga.
 *
 * PostgREST filtra por querystring, así que un `.in()` con 1100 UUID arma una
 * URL de ~40 KB y el servidor la rechaza. Antes no pasaba porque la cartera
 * eran 358 clientes; con la cartera ampliada sí. Se parte la lista en lotes y
 * se concatenan los resultados.
 *
 * `build` recibe cada lote y devuelve la query correspondiente.
 */
export async function fetchAllRowsChunked<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (lote: string[]) => any,
  ids: string[],
  orderBy = "id",
  tamanoLote = 200
): Promise<T[]> {
  const filas: T[] = [];

  for (let i = 0; i < ids.length; i += tamanoLote) {
    const lote = ids.slice(i, i + tamanoLote);
    filas.push(...(await fetchAllRows<T>(() => build(lote), orderBy)));
  }

  return filas;
}

export async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => any,
  orderBy = "id"
): Promise<T[]> {
  const filas: T[] = [];

  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await build()
      .order(orderBy, { ascending: true })
      .range(desde, desde + PAGINA - 1);

    if (error) throw error;

    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    // Una página incompleta significa que no hay más: evita una consulta extra.
    if (pagina.length < PAGINA) break;
  }

  return filas;
}
