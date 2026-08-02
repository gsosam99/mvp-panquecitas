# Decisiones de implementación — Cambios Panquecitas (login por cédula, cartera, Mercaderista, Admin, DIENN)

Este documento resume las decisiones y supuestos tomados al implementar los cambios descritos en
"Cambios en app Panquecitas - Versión Ale" (las 3 pestañas: login/mercaderista/promotora, admin,
DIENN) más el roster de personal de campo y la cartera de clientes. Está pensado para que el
equipo lo revise y confirme/corrija donde haga falta — varios puntos no tenían una fórmula o
fuente de datos exacta en el documento original, así que se tomó la interpretación más razonable
y se documenta aquí explícitamente.



## Cartera de clientes: no se importó el archivo pegado en el chat

Se construyó la funcionalidad completa para cargar/actualizar la cartera de clientes (pantalla
Admin → "Cartera de Clientes", parser `parseCarteraExcel` en `src/lib/excel-parser.ts`), pero
**no se hizo la carga inicial con los datos que Ale pegó en el chat**. Motivo: el archivo llegó ya
convertido a tabla markdown por una herramienta externa, y esa conversión tiene errores de
codificación visibles (ej. "CUMANÃ" en vez de "CUMANÁ", "BÃ¡sico" en vez de "Básico"). Corregir
eso a ciegas fila por fila (sin poder verificar contra el archivo Excel/CSV original) es un riesgo
real de corromper datos de clientes reales (nombres, códigos SAP). Es más seguro que el equipo
suba el archivo Excel/CSV original directamente en Admin → Cartera de Clientes, donde el parser lo
procesa sin pasar por esa conversión con errores.

## Roster de personal de campo

Sí se cargó completo (son solo 4 personas, sin riesgo de codificación) en el seed de la migración
003:

| Cédula | Nombre | Rol | Oficina de Venta |
|---|---|---|---|
| 30124915 | Mariana Di Buongrazio | Promotora | Barquisimeto Este |
| 29611053 | Mikhaela Barboza | Mercaderista | Barquisimeto Este |
| 20675455 | Imalay Castro | Promotora | Cumaná |
| 1234 | Isabella Maggio | Mercaderista | Cumaná |

Se agregó una pantalla Admin ("Personal de Campo") para agregar/editar/desactivar personas sin
tocar código, ya que el documento dice "la base de datos que te enviaremos" — se asumió que esta
lista se actualiza con el tiempo.

## Decisiones de interpretación

1. **Login de campo**: se mantienen las 2 tarjetas de perfil (Promotora/Mercaderista) en la home;
   el registro pide solo cédula. El servidor la valida contra `field_workers`; si no existe, error
   "Cédula no registrada"; si existe pero con otro rol, error explicando cuál es su rol real.
   Nombre/apellido/oficina se toman del roster.

2. **Sectorización**: se reemplazó la clasificación por centro poblado (Cumaná/Marigüitar/
   Güirintal vs. Cabudare) por Oficina de Venta (`locations.oficina_venta`, valores "CUMANA" /
   "BARQUISIMETO ESTE"). Afecta: qué PDV ve cada trabajador de campo, los sectores en Admin, y el
   filtro de segmento en DIENN.

3. **Cartera de clientes → columna nueva**: se agregó `locations.oficina_venta`. La carga de
   cartera es un *upsert* por código SAP; se verificó que el upload mensual de ventas (Carga SAP)
   no la pisa, porque ese payload no incluye esa columna.

4. **"Segmento" = columna "Tipo de Cliente"** de la cartera (HIPERMERCADOS, SUPERMERCADOS,
   BODEGAS, PANADERIA/PASTELERIA, etc.), no el enum interno `LocationType` (que solo tiene 4
   valores gruesos). Se usa así en la tabla de DIENN y en las reglas de alerta de Admin, porque el
   documento de Admin menciona esos valores literalmente.

5. **Rediseño del módulo Anaquel — cambio de comportamiento real, no solo de UI**: el documento
   nuevo pide contar un **total único** de unidades en anaquel (ya no separado por presentación
   400g/800g como hacía la versión anterior). Se agregó `mercaderista_visits.total_units_anaquel`
   y **se dejó de insertar filas `ANAQUEL` en `inventory_audits`** (esa zona queda como dato
   histórico, no se borra el enum ni el constraint por seguridad, pero el código nuevo no la usa
   más). El precio por presentación (400g/800g, con opción "no disponible") ahora vive en
   `mercaderista_visits.price_400` / `price_800` (+ flags `_na`), no en `inventory_audits`.

6. **Consecuencia sobre "Mix de Producto" en DIENN**: originalmente se planteó calcular el mix
   400g/800g desde "anaquel + depósito". Al construir el punto 5 quedó claro que el anaquel nuevo
   ya no distingue presentación, así que **el mix se calcula solo desde el depósito** (bultos/
   unidades sueltas por presentación, que sí se sigue capturando). Es una aproximación de mezcla
   de inventario en depósito, no de ventas reales — no hay otra fuente disponible hoy.

7. **Alerta "% cobertura material POP"** (Admin, Bloque 1): el documento dice "Criterio de
   alerta: NO en materiales con preciadores". Se interpretó como: el material POP está presente
   (`pop_present = true`) pero su preciador no tiene el precio marcado (`pop_price_tag = false`).
   La "lista de incidencias" es el listado de esos PDV.

8. **Caras frontales** (Admin, Bloque 1): regla nueva por tipo de cliente. Si `tipo_cliente` ∈
   {HIPERMERCADOS, SUPERMERCADOS, DIST.VIVER/BEB NO AL, MAYOR VIVE/CONF/BEBI} → alerta si caras
   frontales < 4. Para el resto → alerta si no hay presencia de producto. Reemplaza la regla
   anterior de "< 2" global.

9. **"Tienda Perfecta" (Admin) vs. "Tienda Ideal" (DIENN)**: el documento da el nombre nuevo para
   Admin pero no una fórmula distinta para "Tienda Ideal" en DIENN — solo dice que debe
   incluirse ahí. Se renombró la función existente (`getIndiceTiendaPerfecta`, antes
   `getIndiceTiendaIdeal`) y se muestra el **mismo cálculo** bajo ambos nombres (Admin y DIENN)
   hasta que el equipo defina una fórmula distinta para "Tienda Ideal".

10. **Gráfico "Cobertura y Comunicación por Ciudad"** (DIENN): no existe en el sistema ningún dato
    de campañas de comunicación ni metas por ciudad. Se usa un proxy: *Cobertura* = % acumulado
    semanal de PDV visitados por mercaderista; *Comunicación* = % acumulado semanal de PDV con
    material POP presente; "Ciudad" = los 2 sectores; la "meta" es el universo total de PDV del
    sector (no hay una meta editable todavía).

11. **Columnas "% HPM vs Base" y "% HPM TOTAL"** (tabla Detalle de Clientes, DIENN): HPM = Harina
    PAN. `% HPM TOTAL` = kg de Harina PAN del segmento / kg de Harina PAN de todo el universo.
    `% HPM vs Base` = participación de Panquecitas sobre el Harina PAN de ese segmento (mismo
    cálculo que ya existía como `shareMvp` en el modelo de escalamiento, aplicado por segmento).

12. **Pedidos pendientes por entregar** (DIENN): no hay archivo de ejemplo del reporte SAP. Se
    construyó: tabla `sap_pending_orders`, un parser "best-effort" (`parsePendingOrdersExcel`)
    que busca columnas por nombre de encabezado en vez de posición fija, pantalla Admin de carga,
    y el listado en DIENN. **El layout exacto se debe ajustar cuando llegue un archivo real** —
    ver comentarios en `src/lib/excel-parser.ts`.

13. **Imágenes de referencia** (Dangler/Tent Card/Preciador, caras frontales 3/6): las fotos del
    documento están incrustadas en el PDF, no como archivos de imagen independientes, así que no
    se pudieron extraer como assets reales. Se muestran tarjetas de referencia con texto
    descriptivo en su lugar. Reemplazar por fotos reales en `public/` cuando estén disponibles
    (ver `MATERIAL_REFERENCE` en `src/components/field/AuditWizard.tsx`).

14. **Moneda en el módulo de Precio**: el documento no menciona USD/Bs. para el nuevo módulo de
    precio, pero la app ya tenía esa lógica (tasa BCV, conversión manual) en el anaquel viejo. Se
    reutilizó tal cual, ahora aplicada al nuevo módulo de precio.

15. **Horizonte de proyección "Ton → Meses"** (DIENN, tarjeta Running de Ventas): el documento no
    especifica a cuántos meses proyectar. Se usó un horizonte fijo de **3 meses** al ritmo semanal
    actual — ajustar `PROYECCION_MESES` en `src/lib/dienn-queries.ts` si el equipo prefiere otro
    horizonte.

16. **Filtro reactivo de segmento en DIENN** (Tabs TOTAL / sector): se precalculan los 3 cortes
    posibles (TOTAL, Cumaná, Barquisimeto Este) en el servidor y se le pasan todos al cliente, que
    solo cambia cuál mostrar — así el cambio de filtro es instantáneo sin ida y vuelta al
    servidor, tal como pide el documento ("re-filtrarse e instanciarse en tiempo real").

## Qué falta confirmar con el equipo

- Formato real del reporte SAP de pedidos pendientes (columnas exactas).
- Fórmula real de "Tienda Ideal" en DIENN, si debe ser distinta de "Tienda Perfecta" en Admin.
- Fuente real de metas/campañas de comunicación por ciudad (hoy es un proxy).
- Horizonte de proyección de "Ton → Meses" (hoy fijo en 3 meses).
- Confirmar la carga inicial de la cartera de clientes con el archivo Excel/CSV original (no el
  texto pegado en el chat).
