import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Bqto3MDropzone } from "@/components/admin/Bqto3MDropzone";
import { getBqto3MFilas, getReferenciasPiloto } from "@/lib/bqto-queries";
import {
  CIUDADES,
  CIUDADES_COMPLETAS,
  DIAS_HABILES_MES,
  MESES_PROYECCION,
  META_PCT,
  esCiudadCompleta,
  proyectar,
  resumenBqto,
  resumenCombinado,
  sumarEscenarios,
  TIPOS_NO_FOCO,
  type BqtoResumen,
  type CiudadCompleta,
  type EscenarioProyeccion,
  type ReferenciaActivacion,
} from "@/lib/bqto-completo";

export const metadata: Metadata = { title: "Ciudades completas — Panquecitas" };

// Módulo aparte de DIENN (24-09-2026): ratios de ciudades completas con la
// Harina PAN de 3 meses de toda la ciudad — Barquisimeto, Cumaná y las dos
// juntas. No sale en el Dashboard principal ni se mezcla con los datos del
// piloto. El cálculo vive en src/lib/bqto-completo.ts.

type Vista = CiudadCompleta | "ambas";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const kg = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 0 });
const pct = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 1 });
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "—");
const mes = (yyyymm: string) => `${MESES[Number(yyyymm.slice(5, 7)) - 1] ?? yyyymm} ${yyyymm.slice(0, 4)}`;

const COLOR_META = "#16a34a";
const COLOR_PROYECCION = "#1a65bd";

interface Escenario {
  referencia: string;
  poblacion: string;
  e: EscenarioProyeccion;
}

interface FilaMeta {
  label: string;
  clientes: number;
  panMes: number;
  destacada?: boolean;
}

/** Barra horizontal rotulada con su kg; el ancho es relativo a `max`. */
function Barra({ valor, max, color, texto }: { valor: number; max: number; color: string; texto: string }) {
  // Se escala al 75% del ancho para que el rótulo quepa a la derecha de la barra más larga.
  const ancho = max > 0 ? Math.max(0.5, (valor / max) * 75) : 0;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-5 rounded shrink-0" style={{ width: `${ancho}%`, background: color }} />
      <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{texto}</span>
    </div>
  );
}

/** Los dos escenarios (todos / foco) de una población con una activación de referencia. */
function escenariosCon(r: BqtoResumen, ref: ReferenciaActivacion): [EscenarioProyeccion, EscenarioProyeccion] {
  return [
    proyectar(r.clientes, ref.activacionPct, ref.kgPorActivoMes, r.promedioMesKg),
    proyectar(r.clientesFoco, ref.activacionFocoPct, ref.kgPorActivoMes, r.promedioMesFocoKg),
  ];
}

function CajaReferencia({ referencia: ref }: { referencia: ReferenciaActivacion }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{ref.etiqueta}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Activación total</span>
          <span className="font-bold text-slate-900">
            {pct(ref.activacionPct)}%{" "}
            <span className="text-xs font-normal text-slate-400">
              ({ref.activos.toLocaleString("es-VE")} de {ref.cartera.toLocaleString("es-VE")})
            </span>
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Activación segmentos foco</span>
          <span className="font-bold text-slate-900">
            {pct(ref.activacionFocoPct)}%{" "}
            <span className="text-xs font-normal text-slate-400">
              ({ref.activos.toLocaleString("es-VE")} de {ref.carteraFoco.toLocaleString("es-VE")})
            </span>
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Panquecitas por cliente activo</span>
          <span className="font-bold text-slate-900">
            {pct(ref.kgPorActivoMes)} kg/mes{" "}
            <span className="text-xs font-normal text-slate-400">
              ({kg(ref.kgActivos)} kg ÷ {pct(ref.mesesCliente)} meses-cliente)
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function VistaResumen({
  nombre,
  r,
  filasMeta,
  referencias,
  escenarios,
  notaPromedios,
  notaProyeccion,
}: {
  nombre: string;
  r: BqtoResumen;
  filasMeta: FilaMeta[];
  referencias: ReferenciaActivacion[];
  escenarios: Escenario[];
  /** Cómo se calcularon los promedios, bajo las tarjetas mensual y diaria. */
  notaPromedios: { mes: string; dia: string };
  notaProyeccion: string;
}) {
  const maxBarra = Math.max(0, ...escenarios.flatMap(({ e }) => [e.metaMes, e.kgMes]));
  const tiposNoFoco = r.porTipo.filter((t) => !t.foco);

  return (
    <>
      {/* ── 1. Venta de Harina PAN ───────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title={`Venta 3 meses · ${nombre}`}
          value={`${kg(r.totalKg)} kg`}
          annotation={`${pct(r.totalKg / 1000)} Ton · ${r.clientes.toLocaleString("es-VE")} clientes`}
          subtitle={`Harina PAN · ${fecha(r.desde)} a ${fecha(r.hasta)}`}
          product="pan"
        />
        <KpiCard
          title="Venta promedio mensual"
          value={`${kg(r.promedioMesKg)} kg`}
          annotation={r.porMes.map((m) => `${mes(m.mes)}: ${kg(m.kg)} kg`)}
          subtitle={notaPromedios.mes}
          product="pan"
        />
        <KpiCard
          title="Venta promedio diaria"
          value={`${kg(r.promedioDiaKg)} kg`}
          subtitle={notaPromedios.dia}
          product="pan"
        />
      </div>

      {/* ── 2. Meta del 4% ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Meta 4% — {nombre}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-semibold">Población</th>
                  <th className="py-2 pr-4 font-semibold text-right">Clientes</th>
                  <th className="py-2 pr-4 font-semibold text-right">Harina PAN / mes</th>
                  <th className="py-2 pr-4 font-semibold text-right">Meta 4% / mes</th>
                  <th className="py-2 font-semibold text-right">Meta 4% · {MESES_PROYECCION} meses</th>
                </tr>
              </thead>
              <tbody>
                {filasMeta.map((f) => (
                  <tr key={f.label} className={`border-b last:border-0 ${f.destacada ? "bg-slate-50" : ""}`}>
                    <td className={`py-2 pr-4 text-slate-900 ${f.destacada ? "font-bold" : "font-medium"}`}>
                      {f.label}
                    </td>
                    <td className="py-2 pr-4 text-right">{f.clientes.toLocaleString("es-VE")}</td>
                    <td className="py-2 pr-4 text-right">{kg(f.panMes)} kg</td>
                    <td className="py-2 pr-4 text-right font-bold" style={{ color: COLOR_META }}>
                      {kg(f.panMes * META_PCT)} kg
                    </td>
                    <td className="py-2 text-right font-bold" style={{ color: COLOR_META }}>
                      {kg(f.panMes * META_PCT * MESES_PROYECCION)} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Segmentos foco = todos los tipos de cliente menos {TIPOS_NO_FOCO.join(", ")} (el archivo no trae el
            segmento de la cartera, así que el corte se hace por tipo de cliente).
            {tiposNoFoco.length > 0 &&
              ` Quedan fuera: ${tiposNoFoco
                .map((t) => `${t.tipo} (${t.clientes.toLocaleString("es-VE")} clientes, ${kg(t.kg)} kg)`)
                .join(" · ")}.`}
          </p>
        </CardContent>
      </Card>

      {/* ── 3. Proyección con la activación del piloto ───────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Proyección: {nombre} completo con la activación de hoy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className={`grid gap-4 ${referencias.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {referencias.map((ref) => (
              <CajaReferencia key={ref.etiqueta} referencia={ref} />
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Activación de</th>
                  <th className="py-2 pr-3 font-semibold">Población</th>
                  <th className="py-2 pr-3 font-semibold text-right">Clientes</th>
                  <th className="py-2 pr-3 font-semibold text-right">Activación</th>
                  <th className="py-2 pr-3 font-semibold text-right">Activados</th>
                  <th className="py-2 pr-3 font-semibold text-right">Volumen / mes</th>
                  <th className="py-2 pr-3 font-semibold text-right">Meta 4% / mes</th>
                  <th className="py-2 pr-3 font-semibold text-right">% de la meta</th>
                  <th className="py-2 pr-3 font-semibold text-right">Volumen {MESES_PROYECCION} meses</th>
                  <th className="py-2 font-semibold text-right">Meta {MESES_PROYECCION} meses</th>
                </tr>
              </thead>
              <tbody>
                {escenarios.map(({ referencia, poblacion, e }) => (
                  <tr key={`${referencia}|${poblacion}`} className="border-b last:border-0">
                    <td className="py-2 pr-3 text-slate-500">{referencia}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">{poblacion}</td>
                    <td className="py-2 pr-3 text-right">{e.clientesBase.toLocaleString("es-VE")}</td>
                    <td className="py-2 pr-3 text-right">{pct(e.activacionPct)}%</td>
                    <td className="py-2 pr-3 text-right">{e.clientesActivados.toLocaleString("es-VE")}</td>
                    <td className="py-2 pr-3 text-right font-bold" style={{ color: COLOR_PROYECCION }}>
                      {kg(e.kgMes)} kg
                    </td>
                    <td className="py-2 pr-3 text-right" style={{ color: COLOR_META }}>
                      {kg(e.metaMes)} kg
                    </td>
                    <td className="py-2 pr-3 text-right font-bold">{pct(e.pctMeta)}%</td>
                    <td className="py-2 pr-3 text-right font-bold" style={{ color: COLOR_PROYECCION }}>
                      {kg(e.kgPeriodo)} kg
                    </td>
                    <td className="py-2 text-right" style={{ color: COLOR_META }}>
                      {kg(e.metaPeriodo)} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Comparación visual mensual: meta 4% vs. volumen proyectado. */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_META }} /> Meta 4% / mes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: COLOR_PROYECCION }} /> Volumen proyectado /
                mes
              </span>
            </div>
            {escenarios.map(({ referencia, poblacion, e }) => (
              <div key={`barra|${referencia}|${poblacion}`} className="space-y-1">
                <p className="text-sm font-medium text-slate-900">
                  {poblacion} <span className="font-normal text-slate-500">· activación de {referencia}</span>
                </p>
                <Barra valor={e.metaMes} max={maxBarra} color={COLOR_META} texto={`${kg(e.metaMes)} kg`} />
                <Barra
                  valor={e.kgMes}
                  max={maxBarra}
                  color={COLOR_PROYECCION}
                  texto={`${kg(e.kgMes)} kg · ${pct(e.pctMeta)}% de la meta`}
                />
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-400">
            {notaProyeccion} Todos los clientes usan la activación total (activos ÷ cartera) y los segmentos foco la
            activación a escala (activos ÷ cartera sin los inactivos de segmentos no vendibles), las mismas del
            Dashboard. Los kg por cliente activo cuentan a cada cliente desde su primera compra hasta el último Radar (
            {fecha(referencias[0]?.corte ?? null)}), en meses de {DIAS_HABILES_MES} días hábiles. La meta es el 4% de
            la Harina PAN mensual de esa misma población.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

export default async function CiudadesCompletasPage({
  searchParams,
}: {
  searchParams: Promise<{ ciudad?: string }>;
}) {
  const session = await requireDashboard();
  if (session.role !== "DIENN") redirect("/dashboard");

  const { ciudad: param } = await searchParams;
  const vista: Vista = param === "ambas" ? "ambas" : esCiudadCompleta(param) ? param : "barquisimeto";

  const [{ filas, error }, refs] = await Promise.all([getBqto3MFilas(), getReferenciasPiloto()]);
  const filasPorCiudad: Record<CiudadCompleta, typeof filas> = {
    barquisimeto: filas.filter((f) => f.ciudad === "barquisimeto"),
    cumana: filas.filter((f) => f.ciudad === "cumana"),
  };
  const resumenes: Record<CiudadCompleta, BqtoResumen | null> = {
    barquisimeto: resumenBqto(filasPorCiudad.barquisimeto),
    cumana: resumenBqto(filasPorCiudad.cumana),
  };
  const cargadas = CIUDADES.filter((c) => resumenes[c] !== null);

  const pestanas: { vista: Vista; label: string }[] = [
    ...CIUDADES.map((c) => ({ vista: c as Vista, label: CIUDADES_COMPLETAS[c].nombre })),
    { vista: "ambas", label: "Barquisimeto + Cumaná" },
  ];

  let contenido: React.ReactNode;
  if (vista === "ambas") {
    const r = resumenCombinado(CIUDADES.map((c) => filasPorCiudad[c]));
    if (!r) {
      contenido = (
        <Alert>
          <AlertDescription>Todavía no hay ninguna ciudad cargada.</AlertDescription>
        </Alert>
      );
    } else {
      // Cada ciudad con la activación de SU sector piloto, y el resultado sumado.
      const porCiudad = cargadas.map((c) => escenariosCon(resumenes[c]!, refs[CIUDADES_COMPLETAS[c].sector]));
      const [totalTodos, totalFoco] = escenariosCon(r, refs.total);
      const cadaUna = `Cada ciudad la suya (${cargadas
        .map((c) => `${CIUDADES_COMPLETAS[c].nombre} con ${refs[CIUDADES_COMPLETAS[c].sector].etiqueta}`)
        .join(", ")})`;
      contenido = (
        <>
          {cargadas.length < CIUDADES.length && (
            <Alert>
              <AlertDescription>
                Falta cargar {CIUDADES.filter((c) => !cargadas.includes(c)).map((c) => CIUDADES_COMPLETAS[c].nombre).join(", ")}:
                la suma solo incluye {cargadas.map((c) => CIUDADES_COMPLETAS[c].nombre).join(", ")}.
              </AlertDescription>
            </Alert>
          )}
          <VistaResumen
            nombre="Barquisimeto + Cumaná"
            r={r}
            filasMeta={[
              ...cargadas.flatMap((c) => {
                const rc = resumenes[c]!;
                const nombre = CIUDADES_COMPLETAS[c].nombre;
                return [
                  { label: `${nombre} · todos los clientes`, clientes: rc.clientes, panMes: rc.promedioMesKg },
                  { label: `${nombre} · segmentos foco`, clientes: rc.clientesFoco, panMes: rc.promedioMesFocoKg },
                ];
              }),
              { label: "Total · todos los clientes", clientes: r.clientes, panMes: r.promedioMesKg, destacada: true },
              { label: "Total · segmentos foco", clientes: r.clientesFoco, panMes: r.promedioMesFocoKg, destacada: true },
            ]}
            referencias={[refs.total, refs.barquisimeto_este, refs.cumana]}
            escenarios={[
              { referencia: refs.total.etiqueta, poblacion: "Todos los clientes", e: totalTodos },
              { referencia: refs.total.etiqueta, poblacion: "Segmentos foco", e: totalFoco },
              { referencia: cadaUna, poblacion: "Todos los clientes", e: sumarEscenarios(porCiudad.map(([t]) => t)) },
              { referencia: cadaUna, poblacion: "Segmentos foco", e: sumarEscenarios(porCiudad.map(([, f]) => f)) },
            ]}
            notaPromedios={{
              mes: "Suma de los promedios mensuales de cada ciudad",
              dia: "Suma de los promedios diarios de cada ciudad (venta ÷ días con venta de su archivo)",
            }}
            notaProyeccion={`Clientes de las dos ciudades × activación de hoy = clientes activados; × kg de Panquecitas por cliente activo al mes = volumen mensual, y × ${MESES_PROYECCION} para el período. "Cada ciudad la suya" proyecta cada ciudad con la activación de su sector piloto y suma el resultado; la activación que muestra es la efectiva (activados ÷ clientes).`}
          />
        </>
      );
    }
  } else {
    const r = resumenes[vista];
    const { nombre, sector } = CIUDADES_COMPLETAS[vista];
    const referencias = [refs.total, refs[sector]];
    contenido = !r ? (
      <Card>
        <CardHeader>
          <CardTitle>Cargar Radar de Harina PAN de 3 meses — {nombre} completo</CardTitle>
        </CardHeader>
        <CardContent>
          <Bqto3MDropzone ciudad={vista} />
        </CardContent>
      </Card>
    ) : (
      <>
        <VistaResumen
          nombre={nombre}
          r={r}
          filasMeta={[
            { label: "Todos los clientes", clientes: r.clientes, panMes: r.promedioMesKg },
            { label: "Segmentos foco", clientes: r.clientesFoco, panMes: r.promedioMesFocoKg },
          ]}
          referencias={referencias}
          escenarios={referencias.flatMap((ref) => {
            const [todos, foco] = escenariosCon(r, ref);
            return [
              { referencia: ref.etiqueta, poblacion: "Todos los clientes", e: todos },
              { referencia: ref.etiqueta, poblacion: "Segmentos foco", e: foco },
            ];
          })}
          notaPromedios={{
            mes: `Venta de los ${r.meses} meses ÷ ${r.meses}`,
            dia: `Venta de los ${r.meses} meses ÷ ${r.dias} días con venta`,
          }}
          notaProyeccion={`Clientes de ${nombre} × activación de hoy = clientes activados; × kg de Panquecitas por cliente activo al mes = volumen mensual, y × ${MESES_PROYECCION} para el período.`}
        />
        <Card>
          <CardHeader>
            <CardTitle>Actualizar el reporte de {nombre}</CardTitle>
          </CardHeader>
          <CardContent>
            <Bqto3MDropzone ciudad={vista} />
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ciudades completas</h1>
        <p className="text-slate-500 mt-1">
          Ratios de Harina PAN de toda la ciudad, aparte del piloto: venta de 3 meses, la meta del 4% para todos los
          clientes y para los segmentos foco, y el volumen que daría activar la ciudad completa al % de activación que
          el piloto tiene hoy. No afecta el Dashboard.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {pestanas.map((p) => {
          const activa = p.vista === vista;
          const sinDatos = p.vista !== "ambas" && resumenes[p.vista] === null;
          return (
            <Link
              key={p.vista}
              href={`/bqto-completo?ciudad=${p.vista}`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                activa
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p.label}
              {sinDatos && <span className="ml-1 text-xs opacity-70">(sin cargar)</span>}
            </Link>
          );
        })}
      </nav>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            No se pudo leer la tabla bqto_3m_ventas ({error}). ¿Falta correr los migrations 025 y 026 en Supabase?
          </AlertDescription>
        </Alert>
      )}

      {contenido}
    </div>
  );
}
