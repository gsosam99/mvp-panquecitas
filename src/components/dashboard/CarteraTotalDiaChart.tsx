"use client";

import dynamic from "next/dynamic";

export interface CarteraTotalDiaChartPoint {
  label: string;
  radarKgDia: number;
  radarKgDiaDirecto: number; // parte del volumen del período del modelo Directo
  radarKgDiaIndirecto: number; // parte del volumen del período del modelo Indirecto
  // Parte del volumen del período de cada ciudad (solo el gráfico global las provee).
  radarKgDiaCumana?: number;
  radarKgDiaCabudare?: number;
  programados: number;
  efectividad: number; // %
  efectividadDirecto: number; // % activación Radar modelo Directo
  efectividadIndirecto: number; // % activación Radar modelo Indirecto
  // Capas por ciudad (solo el gráfico global las provee; null = hueco en la línea).
  efectCumanaAcum?: number | null;
  efectCumanaDia?: number | null;
  efectCabudareAcum?: number | null;
  efectCabudareDia?: number | null;
  /**
   * Activación acumulada "a escala": el mismo numerador contra la cartera SIN
   * los inactivos de segmentos no vendibles (licorerías, CS, farmacias,
   * mascotas, animales). Ver SEGMENTOS_SIN_ALIMENTOS.
   */
  efectCumanaEscala?: number | null;
  efectCabudareEscala?: number | null;
  /** Misma activación "a escala" pero del total del piloto (las dos ciudades). */
  efectTotalEscala?: number | null;
  /**
   * Activación acumulada "aterrizada": la de siempre, pero contra la cartera de hoy
   * completa desde el día 1 (sin saltos por ampliación de cartera). Total y por ciudad.
   */
  efectTotalAterrizada?: number | null;
  efectCumanaAterrizada?: number | null;
  efectCabudareAterrizada?: number | null;
  /** Aterrizada por modelo (Directo / Indirecto), contra la cartera de hoy de cada modelo. */
  efectDirectoAterrizada?: number | null;
  efectIndirectoAterrizada?: number | null;
}

function formatKg(value: number): string {
  return `${value.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
}

const Inner = dynamic(
  async () => {
    const { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } =
      await import("recharts");

    function CarteraTotalDiaInner({
      data,
      showEfectividad,
      showDirecto,
      showIndirecto,
      efectividadColor,
      showVentasDirecto,
      showVentasIndirecto,
      showVentasCumana,
      showVentasCabudare,
      showCiudadAcum,
      showCiudadDia,
      showCumana,
      showEscalaCumana,
      showEscalaCabudare,
      showEscalaTotal,
      showAterrizadaTotal,
      showAterrizadaCumana,
      showAterrizadaCabudare,
      showAterrizadaDirecto,
      showAterrizadaIndirecto,
      showCabudare,
    }: {
      data: CarteraTotalDiaChartPoint[];
      showEfectividad: boolean;
      showDirecto: boolean;
      showIndirecto: boolean;
      efectividadColor: string;
      showVentasDirecto: boolean;
      showVentasIndirecto: boolean;
      showVentasCumana: boolean;
      showVentasCabudare: boolean;
      showCiudadAcum: boolean;
      showCiudadDia: boolean;
      showCumana: boolean;
      showEscalaCumana: boolean;
      showEscalaCabudare: boolean;
      showEscalaTotal: boolean;
      showAterrizadaTotal: boolean;
      showAterrizadaCumana: boolean;
      showAterrizadaCabudare: boolean;
      showAterrizadaDirecto: boolean;
      showAterrizadaIndirecto: boolean;
      showCabudare: boolean;
    }) {
      // Con cualquier desglose de barras prendido (modelo o ciudad) se oculta la
      // barra del total, para no sumar dos veces el mismo volumen.
      const hayDesglose = showVentasDirecto || showVentasIndirecto || showVentasCumana || showVentasCabudare;

      // Margen superior del gráfico: hace falta para reconstruir dónde cae cada
      // ratio en píxeles (ver tramoKg).
      const MARGEN_TOP = 32;

      // Distancia (px) del centro de las etiquetas de Directo / Indirecto
      // aterrizado a su línea: van pegadas, Directo arriba e Indirecto abajo.
      const ETIQUETA_MODELO_PX = 14;

      // Los kg del total van en DOS renglones horizontales: el número arriba y
      // "kg" debajo. En un solo renglón un "1.266 kg" es más ancho que la barra
      // (~35 px con un mes de días) y los de barras vecinas se encimaban; en
      // vertical no se leían bien. Así todas las barras llevan su kg.
      const KG_FONT = 10;
      const KG_RENGLON = 11;
      const KG_MARGEN = 3;
      const KG_ALTO = KG_RENGLON * 2;
      const numeroKg = (kg: number) => kg.toLocaleString("es-VE", { maximumFractionDigits: 0 });

      /**
       * Tramo vertical [desde, hasta] (px) que ocupan los kg del total en una
       * barra, en el extremo — base o tope — que quede más lejos de los ratios
       * de ese día. Lo usan la etiqueta de kg y las etiquetas de % (para
       * esquivarlo), así que ambas calculan exactamente el mismo lugar.
       *
       * Los % viven en el eje 0–100 y los kg en el suyo, así que la distancia
       * entre ambos cambia día a día: no hay posición fija que sirva siempre.
       */
      function tramoKg(index: number, base: number, altoArea: number) {
        const punto = data[index];
        if (hayDesglose || !(punto.radarKgDia > 0) || kgMax <= 0) return null;
        const pixelDeRatio = (pct: number) => base - (pct / 100) * altoArea;
        const largo = KG_ALTO;
        const tope = base - (punto.radarKgDia / kgMax) * altoArea;

        const ratios: number[] = [];
        if (showEfectividad) ratios.push(punto.efectividad);
        if (showDirecto) ratios.push(punto.efectividadDirecto);
        if (showIndirecto) ratios.push(punto.efectividadIndirecto);
        if (showCiudadAcum && showCumana && punto.efectCumanaAcum != null) ratios.push(punto.efectCumanaAcum);
        if (showCiudadAcum && showCabudare && punto.efectCabudareAcum != null) ratios.push(punto.efectCabudareAcum);
        if (showCiudadDia && showCumana && punto.efectCumanaDia != null) ratios.push(punto.efectCumanaDia);
        if (showCiudadDia && showCabudare && punto.efectCabudareDia != null) ratios.push(punto.efectCabudareDia);
        // Las "a escala" también ocupan lugar: sin contarlas acá, la etiqueta
        // de kg elegía un extremo que en realidad estaba ocupado y los números
        // salían encimados.
        if (showEscalaCumana && punto.efectCumanaEscala != null) ratios.push(punto.efectCumanaEscala);
        if (showEscalaCabudare && punto.efectCabudareEscala != null) ratios.push(punto.efectCabudareEscala);
        if (showEscalaTotal && punto.efectTotalEscala != null) ratios.push(punto.efectTotalEscala);
        if (showAterrizadaTotal && punto.efectTotalAterrizada != null) ratios.push(punto.efectTotalAterrizada);
        if (showAterrizadaCumana && punto.efectCumanaAterrizada != null) ratios.push(punto.efectCumanaAterrizada);
        if (showAterrizadaCabudare && punto.efectCabudareAterrizada != null) ratios.push(punto.efectCabudareAterrizada);
        if (showAterrizadaDirecto && punto.efectDirectoAterrizada != null) ratios.push(punto.efectDirectoAterrizada);
        if (showAterrizadaIndirecto && punto.efectIndirectoAterrizada != null) ratios.push(punto.efectIndirectoAterrizada);
        // Las etiquetas de las aterrizadas por modelo van pegadas a su línea
        // (Directo arriba, Indirecto abajo): su texto también ocupa lugar.
        const etiquetasPx: number[] = [];
        if (showAterrizadaDirecto && punto.efectDirectoAterrizada != null)
          etiquetasPx.push(pixelDeRatio(punto.efectDirectoAterrizada) - ETIQUETA_MODELO_PX);
        if (showAterrizadaIndirecto && punto.efectIndirectoAterrizada != null)
          etiquetasPx.push(pixelDeRatio(punto.efectIndirectoAterrizada) + ETIQUETA_MODELO_PX);

        // Abajo: desde la base hacia arriba (si la barra es baja, sobresale por
        // encima — el halo blanco lo mantiene legible). Arriba: desde el tope
        // hacia abajo, solo si el texto cabe dentro de la barra.
        const abajo = { desde: base - KG_MARGEN - largo, hasta: base - KG_MARGEN, lado: "abajo" as const };
        const arriba = { desde: tope + KG_MARGEN, hasta: tope + KG_MARGEN + largo, lado: "arriba" as const };
        const cabeArriba = arriba.hasta <= base - KG_MARGEN;

        // Sin nada visible que esquivar se deja abajo. Se esquivan las líneas y
        // también las etiquetas pegadas a su línea (aterrizadas por modelo).
        const ocupados = [...ratios.map((r) => pixelDeRatio(r)), ...etiquetasPx];
        const holgura = (t: { desde: number; hasta: number }) =>
          ocupados.length === 0
            ? Infinity
            : Math.min(...ocupados.map((p) => (p < t.desde ? t.desde - p : p > t.hasta ? p - t.hasta : 0)));
        return cabeArriba && holgura(arriba) > holgura(abajo) ? arriba : abajo;
      }

      function etiquetaKgDosRenglones(props: unknown) {
        const { x, y, width, height, index, value } = props as {
          x: number;
          y: number;
          width: number;
          height: number;
          index: number;
          value: number;
        };
        if (!value) return null;
        const base = y + height; // la base de la barra ES la línea del eje X
        const tramo = tramoKg(index, base, Math.max(base - MARGEN_TOP, 1));
        if (!tramo) return null;

        // Número en el primer renglón del tramo y "kg" en el segundo.
        const cx = x + width / 2;
        const centro1 = tramo.desde + KG_RENGLON / 2;
        return (
          <text
            x={cx}
            y={centro1}
            dy="0.35em"
            textAnchor="middle"
            fill="#1e3a8a"
            fontSize={KG_FONT}
            stroke="#ffffff"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {numeroKg(Number(value))}
            <tspan x={cx} dy={KG_RENGLON}>
              kg
            </tspan>
          </text>
        );
      }

      // Tope del eje de kg fijado a mano (redondeado hacia arriba) en vez del
      // automático de Recharts: así se sabe en qué píxel cae el kg de cada
      // barra y las etiquetas de las aterrizadas por ciudad pueden esquivarlo.
      const kgMaxDatos = data.reduce((max, p) => {
        let m = max;
        if (!hayDesglose) m = Math.max(m, p.radarKgDia);
        if (showVentasDirecto || showVentasIndirecto)
          m = Math.max(
            m,
            (showVentasDirecto ? p.radarKgDiaDirecto : 0) + (showVentasIndirecto ? p.radarKgDiaIndirecto : 0)
          );
        if (showVentasCumana || showVentasCabudare)
          m = Math.max(
            m,
            (showVentasCumana ? p.radarKgDiaCumana ?? 0 : 0) + (showVentasCabudare ? p.radarKgDiaCabudare ?? 0 : 0)
          );
        return m;
      }, 0);
      const kgMax = (() => {
        if (kgMaxDatos <= 0) return 0;
        const paso = 10 ** Math.floor(Math.log10(kgMaxDatos));
        const m = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((f) => f * paso >= kgMaxDatos) ?? 10;
        return m * paso;
      })();

      /**
       * Etiqueta de una aterrizada por ciudad pegada a su línea: justo arriba o
       * justo abajo del punto, del lado que no pise los kg de las barras ni los
       * puntos de las otras líneas de ese día. Si ninguno de los dos lados cercanos
       * está libre, prueba un poco más lejos y se queda con el más despejado.
       */
      function etiquetaPegadaALinea(
        propio: "efectTotalAterrizada" | "efectCumanaAterrizada" | "efectCabudareAterrizada",
        color: string
      ) {
        return function EtiquetaPegada(props: unknown) {
          const lp = props as {
            x?: number;
            y?: number;
            viewBox?: { x?: number; y?: number };
            index: number;
            value: number | null;
          };
          const x = lp.x ?? lp.viewBox?.x;
          const y = lp.y ?? lp.viewBox?.y;
          const { index, value } = lp;
          if (value == null || x == null || y == null) return null;
          const punto = data[index];

          // Píxeles del área de trazado reconstruidos desde este mismo punto
          // (eje % de 0 a 100 que arranca en MARGEN_TOP).
          const pct = Number(value);
          const altoArea = pct < 99 ? (y - MARGEN_TOP) / (1 - pct / 100) : null;
          const base = altoArea != null ? MARGEN_TOP + altoArea : null;

          // Obstáculos: centro vertical de cada cosa escrita o dibujada en esta
          // columna, con su media altura (los kg ocupan dos renglones).
          const obstaculos: { py: number; medio: number }[] = [];
          if (base != null && altoArea != null) {
            const pixelKg = (kg: number) => (kgMax > 0 ? base - (kg / kgMax) * altoArea : base);
            const pixelPct = (p: number) => base - (p / 100) * altoArea;
            const kgEnCentro = (desde: number, kg: number) => {
              if (kg > 0) obstaculos.push({ py: pixelKg(desde + kg / 2), medio: 12 });
            };
            // Los kg del total (dos renglones): se esquiva el tramo exacto que ocupan.
            const tramo = tramoKg(index, base, altoArea);
            if (tramo) obstaculos.push({ py: (tramo.desde + tramo.hasta) / 2, medio: (tramo.hasta - tramo.desde) / 2 });
            const dir = showVentasDirecto ? punto.radarKgDiaDirecto : 0;
            if (showVentasDirecto) kgEnCentro(0, dir);
            if (showVentasIndirecto) kgEnCentro(dir, punto.radarKgDiaIndirecto);
            const cum = showVentasCumana ? punto.radarKgDiaCumana ?? 0 : 0;
            if (showVentasCumana) kgEnCentro(0, cum);
            if (showVentasCabudare) kgEnCentro(cum, punto.radarKgDiaCabudare ?? 0);

            const otrasLineas: (number | null | undefined)[] = [];
            if (showEfectividad) otrasLineas.push(punto.efectividad);
            if (showDirecto) otrasLineas.push(punto.efectividadDirecto);
            if (showIndirecto) otrasLineas.push(punto.efectividadIndirecto);
            if (showCiudadAcum && showCumana) otrasLineas.push(punto.efectCumanaAcum);
            if (showCiudadAcum && showCabudare) otrasLineas.push(punto.efectCabudareAcum);
            if (showCiudadDia && showCumana) otrasLineas.push(punto.efectCumanaDia);
            if (showCiudadDia && showCabudare) otrasLineas.push(punto.efectCabudareDia);
            if (showEscalaCumana) otrasLineas.push(punto.efectCumanaEscala);
            if (showEscalaCabudare) otrasLineas.push(punto.efectCabudareEscala);
            if (showEscalaTotal) otrasLineas.push(punto.efectTotalEscala);
            if (showAterrizadaTotal && propio !== "efectTotalAterrizada") otrasLineas.push(punto.efectTotalAterrizada);
            if (showAterrizadaCumana && propio !== "efectCumanaAterrizada") otrasLineas.push(punto.efectCumanaAterrizada);
            if (showAterrizadaCabudare && propio !== "efectCabudareAterrizada")
              otrasLineas.push(punto.efectCabudareAterrizada);
            if (showAterrizadaDirecto) otrasLineas.push(punto.efectDirectoAterrizada);
            if (showAterrizadaIndirecto) otrasLineas.push(punto.efectIndirectoAterrizada);
            for (const p of otrasLineas) if (p != null) obstaculos.push({ py: pixelPct(p), medio: 4 });
          }

          const MEDIO_TEXTO = 6;
          const holgura = (py: number) =>
            obstaculos.length === 0
              ? Infinity
              : Math.min(...obstaculos.map((o) => Math.abs(o.py - py) - o.medio - MEDIO_TEXTO));
          // Centro del texto: pegado arriba / abajo, y luego un poco más lejos.
          // Los días pares prefieren arriba y los impares abajo: un "66.1%" es
          // casi tan ancho como el espacio entre dos días, así que alternar
          // evita que los % de días vecinos se toquen.
          const candidatos = index % 2 === 0 ? [y - 11, y + 12, y - 24, y + 25] : [y + 12, y - 11, y + 25, y - 24];
          const libre = candidatos.find((c) => holgura(c) >= 1);
          const yCentro = libre ?? candidatos.reduce((a, b) => (holgura(b) > holgura(a) ? b : a));

          return (
            <text
              x={x}
              y={yCentro}
              dy="0.35em"
              textAnchor="middle"
              fill={color}
              fontSize={10}
              fontWeight={700}
              stroke="#ffffff"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {`${pct}%`}
            </text>
          );
        };
      }

      return (
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={data} margin={{ top: MARGEN_TOP, right: 12, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={16} />
            {/* Ejes ocultos: escalan las series pero no muestran números. */}
            <YAxis yAxisId="kg" hide domain={kgMax > 0 ? [0, kgMax] : undefined} />
            <YAxis yAxisId="pct" hide domain={[0, 100]} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(value, name) => {
                if (name === "efectividad") return [`${Number(value ?? 0)}%`, "Efectividad"];
                if (name === "efectividadDirecto") return [`${Number(value ?? 0)}%`, "Activación Radar — Directo"];
                if (name === "efectividadIndirecto") return [`${Number(value ?? 0)}%`, "Activación Radar — Indirecto"];
                if (name === "radarKgDia") return [formatKg(Number(value ?? 0)), "Volumen Radar"];
                if (name === "radarKgDiaDirecto") return [formatKg(Number(value ?? 0)), "Volumen Radar — Directo"];
                if (name === "radarKgDiaIndirecto") return [formatKg(Number(value ?? 0)), "Volumen Radar — Indirecto"];
                if (name === "radarKgDiaCumana") return [formatKg(Number(value ?? 0)), "Volumen Radar — Cumaná"];
                if (name === "radarKgDiaCabudare") return [formatKg(Number(value ?? 0)), "Volumen Radar — Cabudare"];
                if (name === "efectCumanaAcum") return [`${Number(value ?? 0)}%`, "Cumaná (acum)"];
                if (name === "efectCumanaDia") return [`${Number(value ?? 0)}%`, "Cumaná (día)"];
                if (name === "efectCabudareAcum") return [`${Number(value ?? 0)}%`, "Cabudare (acum)"];
                if (name === "efectCabudareDia") return [`${Number(value ?? 0)}%`, "Cabudare (día)"];
                if (name === "efectCumanaEscala")
                  return [`${Number(value ?? 0)}%`, "Cumaná a escala (sin no vendibles)"];
                if (name === "efectCabudareEscala")
                  return [`${Number(value ?? 0)}%`, "Cabudare a escala (sin no vendibles)"];
                if (name === "efectTotalEscala")
                  return [`${Number(value ?? 0)}%`, "Activación total a escala (segmentos foco)"];
                if (name === "efectTotalAterrizada")
                  return [`${Number(value ?? 0)}%`, "Activación total aterrizada (cartera de hoy desde el día 1)"];
                if (name === "efectCumanaAterrizada")
                  return [`${Number(value ?? 0)}%`, "Cumaná aterrizada (cartera de hoy desde el día 1)"];
                if (name === "efectCabudareAterrizada")
                  return [`${Number(value ?? 0)}%`, "Cabudare aterrizada (cartera de hoy desde el día 1)"];
                if (name === "efectDirectoAterrizada")
                  return [`${Number(value ?? 0)}%`, "Directo aterrizada (cartera de hoy desde el día 1)"];
                if (name === "efectIndirectoAterrizada")
                  return [`${Number(value ?? 0)}%`, "Indirecto aterrizada (cartera de hoy desde el día 1)"];
                return [String(value ?? ""), String(name ?? "")];
              }}
            />
            <Legend
              formatter={(value: string) =>
                value === "radarKgDia"
                  ? "Volumen Radar (por período)"
                  : value === "radarKgDiaDirecto"
                  ? "Volumen Radar — Directo"
                  : value === "radarKgDiaIndirecto"
                  ? "Volumen Radar — Indirecto"
                  : value === "radarKgDiaCumana"
                  ? "Volumen Radar — Cumaná"
                  : value === "radarKgDiaCabudare"
                  ? "Volumen Radar — Cabudare"
                  : value === "efectividad"
                  ? "Efectividad"
                  : value === "efectividadDirecto"
                  ? "Activación Radar — Directo"
                  : value === "efectividadIndirecto"
                  ? "Activación Radar — Indirecto"
                  : value === "efectCumanaAcum"
                  ? "Cumaná (acum)"
                  : value === "efectCumanaDia"
                  ? "Cumaná (día)"
                  : value === "efectCabudareAcum"
                  ? "Cabudare (acum)"
                  : value === "efectCabudareDia"
                  ? "Cabudare (día)"
                  : value === "efectCumanaEscala"
                  ? "Cumaná a escala"
                  : value === "efectCabudareEscala"
                  ? "Cabudare a escala"
                  : value === "efectTotalEscala"
                  ? "Total a escala"
                  : value === "efectTotalAterrizada"
                  ? "Total aterrizado"
                  : value === "efectCumanaAterrizada"
                  ? "Cumaná aterrizado"
                  : value === "efectCabudareAterrizada"
                  ? "Cabudare aterrizado"
                  : value === "efectDirectoAterrizada"
                  ? "Directo aterrizado"
                  : value === "efectIndirectoAterrizada"
                  ? "Indirecto aterrizado"
                  : value
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            {/* Barras: total del período por defecto; con los toggles se muestran los
                desgloses por modelo (Directo/Indirecto) y/o por ciudad (Cumaná/Cabudare),
                apilados dentro de su propio stack. Condicionales hermanos (no un
                Fragment) para que Recharts detecte los Bar. */}
            {!hayDesglose && (
              <Bar yAxisId="kg" dataKey="radarKgDia" fill="#bfdbfe" radius={[3, 3, 0, 0]}>
                {/* Los kg se colocan en el extremo de la barra que le deje espacio
                    al ratio, decidido punto por punto (ver tramoKg).
                    Una posición fija no sirve: los % viven en otro eje, así que en
                    unos días caen cerca del tope de la barra y en otros cerca de la
                    base — el 17 de agosto tapaban el ratio del modelo. */}
                <LabelList dataKey="radarKgDia" content={etiquetaKgDosRenglones} />
              </Bar>
            )}
            {showVentasDirecto && (
              <Bar yAxisId="kg" dataKey="radarKgDiaDirecto" stackId="modelo" fill="#9db99f" radius={[2, 2, 0, 0]}>
                <LabelList
                  dataKey="radarKgDiaDirecto"
                  position="center"
                  fill="#2c4634"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) =>
                    Number(v ?? 0) > 0
                      ? `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`
                      : ""
                  }
                />
              </Bar>
            )}
            {showVentasIndirecto && (
              <Bar yAxisId="kg" dataKey="radarKgDiaIndirecto" stackId="modelo" fill="#cbb894" radius={[2, 2, 0, 0]}>
                <LabelList
                  dataKey="radarKgDiaIndirecto"
                  position="center"
                  fill="#4d3c1f"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) =>
                    Number(v ?? 0) > 0
                      ? `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`
                      : ""
                  }
                />
              </Bar>
            )}
            {/* Barras de volumen Radar del período por CIUDAD. Stack propio ("ciudad")
                para que, si además se prendió un desglose por modelo, queden columnas
                lado a lado en vez de sumarse en la misma pila. La etiqueta lleva solo
                los kg (sin el nombre de la ciudad) — se identifican por color. */}
            {showVentasCumana && (
              <Bar yAxisId="kg" dataKey="radarKgDiaCumana" stackId="ciudad" fill="#b4d0e7" radius={[2, 2, 0, 0]}>
                <LabelList
                  dataKey="radarKgDiaCumana"
                  position="center"
                  fill="#1f4e79"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) =>
                    Number(v ?? 0) > 0
                      ? `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`
                      : ""
                  }
                />
              </Bar>
            )}
            {showVentasCabudare && (
              <Bar yAxisId="kg" dataKey="radarKgDiaCabudare" stackId="ciudad" fill="#5a89b8" radius={[2, 2, 0, 0]}>
                {/* Texto OSCURO, no blanco: el halo de las etiquetas es blanco y
                    un relleno blanco encima de un contorno blanco desaparecía —
                    las barras de Cabudare se veían con un borrón en vez del kg. */}
                <LabelList
                  dataKey="radarKgDiaCabudare"
                  position="center"
                  fill="#12365c"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) =>
                    Number(v ?? 0) > 0
                      ? `${Number(v ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })} kg`
                      : ""
                  }
                />
              </Bar>
            )}
            {/* Efectividad principal (color según la métrica elegida) — se puede apagar. */}
            {showEfectividad && (
              <Line
                yAxisId="pct"
                dataKey="efectividad"
                stroke={efectividadColor}
                strokeWidth={2}
                dot={{ r: 2, fill: efectividadColor }}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectividad"
                  position="top"
                  offset={10}
                  fill={efectividadColor}
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => `${Number(v ?? 0)}%`}
                />
              </Line>
            )}
            {/* Activación Radar — Directo (serie opcional). */}
            {showDirecto && (
              <Line
                yAxisId="pct"
                dataKey="efectividadDirecto"
                stroke="#4f7a5c"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 2, fill: "#4f7a5c" }}
                isAnimationActive={false}
              >
                {/* Etiqueta ENCIMA de su propia línea verde. Antes iba debajo del
                    punto y el número del Indirecto —que va arriba de su línea,
                    con offset 24— le caía justo encima: para separarse hacía
                    falta que las dos líneas quedaran a más de ~38 px, y no lo
                    están. Con las dos etiquetas por encima de su respectiva
                    línea, la separación necesaria baja a ~14 px y los dos
                    números se leen. */}
                <LabelList
                  dataKey="efectividadDirecto"
                  position="top"
                  offset={10}
                  fill="#4f7a5c"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => `${Number(v ?? 0)}%`}
                />
              </Line>
            )}
            {/* Activación Radar — Indirecto (serie opcional). */}
            {showIndirecto && (
              <Line
                yAxisId="pct"
                dataKey="efectividadIndirecto"
                stroke="#8a6d3b"
                strokeWidth={2}
                strokeDasharray="2 3"
                dot={{ r: 2, fill: "#8a6d3b" }}
                isAnimationActive={false}
              >
                {/* Etiqueta más arriba para separarla de las otras dos series. */}
                <LabelList
                  dataKey="efectividadIndirecto"
                  position="top"
                  offset={24}
                  fill="#8a6d3b"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => `${Number(v ?? 0)}%`}
                />
              </Line>
            )}
            {/* Efectividad por ciudad ACUMULADA (línea sólida) — con % visible. */}
            {showCiudadAcum && showCumana && (
              <Line
                yAxisId="pct"
                dataKey="efectCumanaAcum"
                stroke="#3e7cb1"
                strokeWidth={2}
                dot={{ r: 2, fill: "#3e7cb1" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCumanaAcum"
                  position="top"
                  offset={34}
                  fill="#3e7cb1"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {showCiudadAcum && showCabudare && (
              <Line
                yAxisId="pct"
                dataKey="efectCabudareAcum"
                stroke="#1f4e79"
                strokeWidth={2}
                dot={{ r: 2, fill: "#1f4e79" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCabudareAcum"
                  position="bottom"
                  offset={26}
                  fill="#1f4e79"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {/* Efectividad por ciudad DIARIA (línea punteada) — con % visible. */}
            {showCiudadDia && showCumana && (
              <Line
                yAxisId="pct"
                dataKey="efectCumanaDia"
                stroke="#3e7cb1"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2, fill: "#3e7cb1" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCumanaDia"
                  position="top"
                  offset={48}
                  fill="#3e7cb1"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {showCiudadDia && showCabudare && (
              <Line
                yAxisId="pct"
                dataKey="efectCabudareDia"
                stroke="#1f4e79"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2, fill: "#1f4e79" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCabudareDia"
                  position="bottom"
                  offset={40}
                  fill="#1f4e79"
                  fontSize={9}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {/* Activación ACUMULADA "a escala": mismo numerador, denominador sin
                los inactivos de segmentos no vendibles. Línea gruesa y sólida
                para que se distinga de la acumulada normal, que va sobre el
                mismo eje y es siempre más baja. */}
            {showEscalaCumana && (
              <Line
                yAxisId="pct"
                dataKey="efectCumanaEscala"
                stroke="#0d9488"
                strokeWidth={3}
                dot={{ r: 3, fill: "#0d9488" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCumanaEscala"
                  position="top"
                  offset={58}
                  fill="#0d9488"
                  fontSize={10}
                  fontWeight={700}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {showEscalaCabudare && (
              <Line
                yAxisId="pct"
                dataKey="efectCabudareEscala"
                stroke="#0f766e"
                strokeWidth={3}
                strokeDasharray="8 3"
                dot={{ r: 3, fill: "#0f766e" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCabudareEscala"
                  position="bottom"
                  offset={52}
                  fill="#0f766e"
                  fontSize={10}
                  fontWeight={700}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {/* Activación TOTAL a escala: la del piloto completo contra la
                cartera de segmentos foco (sin los inactivos no vendibles).
                Verde esmeralda oscuro, más gruesa que las de ciudad, para que
                se lea como la línea resumen de la familia "a escala". Etiqueta
                abajo con offset corto: ese hueco no lo usa ninguna otra serie. */}
            {showEscalaTotal && (
              <Line
                yAxisId="pct"
                dataKey="efectTotalEscala"
                stroke="#065f46"
                strokeWidth={3.5}
                dot={{ r: 3, fill: "#065f46" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectTotalEscala"
                  position="bottom"
                  offset={14}
                  fill="#065f46"
                  fontSize={10}
                  fontWeight={700}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {/* Activación ATERRIZADA del total: la cartera de hoy como si existiera
                desde el día 1. Violeta y punteada para distinguirla de la acumulada
                normal y de la "a escala". La etiqueta va pegada a la línea (antes
                flotaba 70 px arriba y no se sabía a qué punto correspondía). */}
            {showAterrizadaTotal && (
              <Line
                yAxisId="pct"
                dataKey="efectTotalAterrizada"
                stroke="#6d28d9"
                strokeWidth={3}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: "#6d28d9" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectTotalAterrizada"
                  content={etiquetaPegadaALinea("efectTotalAterrizada", "#6d28d9")}
                />
              </Line>
            )}
            {/* Activación ATERRIZADA por ciudad: misma idea que la del total, cada
                ciudad contra su cartera de hoy. Violeta claro (Cumaná) y oscuro
                (Cabudare), punteadas como la del total. */}
            {showAterrizadaCumana && (
              <Line
                yAxisId="pct"
                dataKey="efectCumanaAterrizada"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={{ r: 2.5, fill: "#8b5cf6" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectCumanaAterrizada"
                  content={etiquetaPegadaALinea("efectCumanaAterrizada", "#8b5cf6")}
                />
              </Line>
            )}
            {showAterrizadaCabudare && (
              <Line
                yAxisId="pct"
                dataKey="efectCabudareAterrizada"
                stroke="#4c1d95"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={{ r: 2.5, fill: "#4c1d95" }}
                connectNulls
                isAnimationActive={false}
              >
                {/* Etiqueta pegada a la línea, del lado libre de kg y de otros puntos. */}
                <LabelList
                  dataKey="efectCabudareAterrizada"
                  content={etiquetaPegadaALinea("efectCabudareAterrizada", "#4c1d95")}
                />
              </Line>
            )}
            {/* Activación ATERRIZADA por modelo: los colores de Directo e Indirecto,
                con trazo punteado corto. Etiquetas pegadas a su línea (Directo
                arriba, Indirecto abajo) para que se lea a cuál corresponde cada %. */}
            {showAterrizadaDirecto && (
              <Line
                yAxisId="pct"
                dataKey="efectDirectoAterrizada"
                stroke="#4f7a5c"
                strokeWidth={2.5}
                strokeDasharray="2 3"
                dot={{ r: 2.5, fill: "#4f7a5c" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectDirectoAterrizada"
                  position="top"
                  offset={6}
                  fill="#4f7a5c"
                  fontSize={10}
                  fontWeight={700}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
            {showAterrizadaIndirecto && (
              <Line
                yAxisId="pct"
                dataKey="efectIndirectoAterrizada"
                stroke="#8a6d3b"
                strokeWidth={2.5}
                strokeDasharray="2 3"
                dot={{ r: 2.5, fill: "#8a6d3b" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="efectIndirectoAterrizada"
                  position="bottom"
                  offset={6}
                  fill="#8a6d3b"
                  fontSize={10}
                  fontWeight={700}
                  stroke="#ffffff"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v) => (v == null ? "" : `${Number(v)}%`)}
                />
              </Line>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return CarteraTotalDiaInner;
  },
  {
    ssr: false,
    loading: () => <div className="h-[400px] bg-slate-50 rounded-lg animate-pulse" />,
  }
);

export function CarteraTotalDiaChart({
  data,
  showEfectividad = true,
  showDirecto = false,
  showIndirecto = false,
  efectividadColor = "#dc2626",
  showVentasDirecto = false,
  showVentasIndirecto = false,
  showVentasCumana = false,
  showVentasCabudare = false,
  showCiudadAcum = false,
  showCiudadDia = false,
  showCumana = true,
  showEscalaCumana = false,
  showEscalaCabudare = false,
  showEscalaTotal = false,
  showAterrizadaTotal = false,
  showAterrizadaCumana = false,
  showAterrizadaCabudare = false,
  showAterrizadaDirecto = false,
  showAterrizadaIndirecto = false,
  showCabudare = true,
}: {
  data: CarteraTotalDiaChartPoint[];
  showEfectividad?: boolean;
  showDirecto?: boolean;
  showIndirecto?: boolean;
  efectividadColor?: string;
  showVentasDirecto?: boolean;
  showVentasIndirecto?: boolean;
  showVentasCumana?: boolean;
  showVentasCabudare?: boolean;
  showCiudadAcum?: boolean;
  showCiudadDia?: boolean;
  showCumana?: boolean;
  showEscalaCumana?: boolean;
  showEscalaCabudare?: boolean;
  showEscalaTotal?: boolean;
  showAterrizadaTotal?: boolean;
  showAterrizadaCumana?: boolean;
  showAterrizadaCabudare?: boolean;
  showAterrizadaDirecto?: boolean;
  showAterrizadaIndirecto?: boolean;
  showCabudare?: boolean;
}) {
  return (
    <Inner
      data={data}
      showEfectividad={showEfectividad}
      showDirecto={showDirecto}
      showIndirecto={showIndirecto}
      efectividadColor={efectividadColor}
      showVentasDirecto={showVentasDirecto}
      showVentasIndirecto={showVentasIndirecto}
      showVentasCumana={showVentasCumana}
      showVentasCabudare={showVentasCabudare}
      showCiudadAcum={showCiudadAcum}
      showCiudadDia={showCiudadDia}
      showCumana={showCumana}
      showEscalaCumana={showEscalaCumana}
      showEscalaCabudare={showEscalaCabudare}
      showEscalaTotal={showEscalaTotal}
      showAterrizadaTotal={showAterrizadaTotal}
      showAterrizadaCumana={showAterrizadaCumana}
      showAterrizadaCabudare={showAterrizadaCabudare}
      showAterrizadaDirecto={showAterrizadaDirecto}
      showAterrizadaIndirecto={showAterrizadaIndirecto}
      showCabudare={showCabudare}
    />
  );
}
