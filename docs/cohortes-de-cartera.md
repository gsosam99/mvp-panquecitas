# Cohortes de cartera — el universo del piloto con dimensión de tiempo

Hasta agosto de 2026 el piloto asumía una cartera inmutable: el denominador de todas las tasas
era la constante `UNIVERSAL_CLIENTES_PILOTO = 358` en `src/lib/dienn-queries.ts`. La cartera se
amplió dos veces, y eso rompe el supuesto de dos maneras, las dos malas:

- dejar la constante en 358 hace que los porcentajes **mientan** (hay numerador que el
  denominador no cuenta);
- subirla a mano **hunde toda la serie histórica**, porque las semanas de agosto pasan a
  dividirse entre una cartera que en esa fecha todavía no existía.

La solución implementada es darle dimensión de tiempo al universo: cada cliente registra desde
cuándo forma parte de la cartera, y cada punto de cada serie divide entre los clientes vigentes
**al cierre de ese bucket**.

## Calendario de incorporación

| Desde | Tanda | Quiénes |
|---|---|---|
| 2026-08-03 | Piloto original | Los 358 de la cartera inicial |
| 2026-08-14 | Indirecto Cumaná | PDV reales de los grupos vendedores **U27** y **U28** |
| 2026-08-24 | Ampliación | El resto del archivo de cartera consolidada |

El modelo indirecto en Cumaná no existía antes del 14-08; hasta la migración 006 los únicos
grupos vendedores de CUMANA eran U29 y U30.

Fuente: conversación con Alejandro, 21-08-2026.

## Dónde vive cada cosa

| Archivo | Rol |
|---|---|
| `supabase/migrations/020_fecha_incorporacion.sql` | Columnas `fecha_incorporacion` y `cohorte`; estampa a los que ya estaban |
| `src/lib/cohortes.ts` | Calendario, regla de asignación, `estabaIncorporado()` y `vigentesAl()` |
| `src/lib/date-buckets.ts` | `bucketEndDate()` (cierre del período) y `todayISO()` (corte de las tarjetas) |
| `src/app/api/cartera-upload/route.ts` | Asigna la tanda al cargar el archivo |
| `src/lib/sectors.ts` | Franquiciadas excluidas de la población |

Para agregar una tanda futura basta con una entrada más en `COHORTES_NUEVAS`, antes de la de
fallback.

## Regla de asignación

Se resuelve en el servidor al cargar la cartera:

```
si el cliente ya tiene fecha           → no se toca (idempotente)
si es nuevo y grupo_vendedor ∈ {U27,U28} → 2026-08-14  "Indirecto Cumaná"
si es nuevo, cualquier otro              → 2026-08-24  "Ampliación"
```

Un cliente que ya tiene fecha **nunca** se recalcula: volver a cargar el mismo archivo tiene que
ser idempotente, o cada carga reescribiría la historia y movería indicadores de meses cerrados.

La Carga de Cartera reconoce además una **columna opcional de fecha** ("Fecha de incorporación",
"Fecha de ingreso", "Fecha de alta"). Es un override explícito para el cliente suelto que no
encaja en ninguna tanda; sí pisa lo registrado, y la pantalla avisa cuántas fechas cambió.

### El orden de ejecución no se puede invertir

1. Correr la migración `020` — estampa a los clientes actuales como "Piloto original".
2. Recién después, cargar el archivo de cartera consolidada.

Si se carga el archivo primero, los 358 originales y las tandas nuevas quedan indistinguibles y
no hay forma de reconstruir quién estaba desde cuándo. Por eso la ruta de carga **rechaza el
archivo con un 409** si detecta que la migración no corrió.

## Franquiciadas: fuera de la población, dentro del volumen

Las distribuidoras intermediarias no son puntos de venta finales, así que no cuentan como
población — pero sí facturan volumen real que llega a los PDV. El código ya tenía esa separación
en dos funciones de scope, y se mantiene tal cual:

| Función (`dienn-queries.ts`) | Franquiciadas | Alimenta |
|---|---|---|
| `getUniverseLocationIds()` | **excluidas** | Población, penetración, activación, efectividad |
| `getPedidosFacturadosLocationIds()` | **incluidas** | Volumen facturado, pedido, Mix de Producto, Facturado vs Radar, Demanda Insatisfecha |

`EXCLUDED_DISTRIBUIDOR_SAP_CODES` pasó de 5 a 10 códigos. Las cinco nuevas son las franquiciadas
del modelo indirecto de Cumaná:

| Código SAP | Nombre |
|---|---|
| 22401000 | COMERCIAL VELIZ SUCRE, C.A. |
| 22403226 | KEYKA, C.A. |
| 22403689 | DISTRIBUIDORA NURCARLYS, C.A. |
| 22405444 | DISTRIBUIDORA RCY 85, C.A. |
| 22405792 | INVERSIONES C.C., C.A. |

El volumen **Radar** de las franquiciadas sigue excluido (comportamiento previo, confirmado el
21-08-2026): solo se leen para lo facturado y lo pedido.

## Numerador y denominador se recortan igual

Es la parte que más fácil se rompe. Contar a un cliente en uno y no en el otro es justamente lo
que distorsiona las tasas:

- **Denominador**: `vigentesAl(cartera, bucketEndDate(bucket))`.
- **Numerador**: se descarta toda venta, factura, pedido o visita **anterior** a la fecha de
  incorporación del cliente.

Sin el filtro del numerador, un cliente de la tanda del 24-08 con histórico previo de Harina PAN
aparecería "activado" en semanas en las que no está en el denominador, y la tasa podría pasar del
100%.

Se usa el **cierre** del bucket y no el inicio: un cliente incorporado a mitad de semana ya vendió
durante esa semana, así que tiene que estar también en el denominador de esa semana.

## Qué cambia en pantalla

Las tarjetas de "ahora mismo" cortan a `todayISO()`. Una tanda con fecha futura **no entra** hasta
que llega su día: la Ampliación no diluye ningún indicador antes del 24-08.

A partir del 24-08 el denominador crece de golpe mientras el numerador arranca en cero, así que la
activación y la penetración van a mostrar un **escalón hacia abajo** ese día. Es aritméticamente
correcto y trazable, pero conviene anotarlo en el gráfico para que no se lea como una caída de
desempeño.

## Qué falta

- **Filtro de cohorte en el dashboard** ("Cartera completa" / "Piloto original" / cada tanda) y
  marca visual de la fecha de entrada en los gráficos temporales. `VentaRecompraActivacionPoint`
  ya expone el campo `universo` por punto para poder mostrarlo.
- **Serie doble** ("piloto original" vs "cartera completa") como alternativa al escalón del 24-08.
- **Apps de campo**: `src/app/(field)/audit/page.tsx` y `promotions/page.tsx` usan
  `LOCATION_COLUMNS` (la lista base, sin `fecha_incorporacion`) y por lo tanto muestran la cartera
  completa, incluidos los clientes de una tanda cuya fecha todavía no llegó. Se dejó así a
  propósito: agregar la columna a la lista base haría que las apps de campo se rompan si se
  despliega antes de correr la migración. Si molesta que aparezcan unos días antes, hay que
  replicar el patrón de reintento de `getUniverseLocations()`.
