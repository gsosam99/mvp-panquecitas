import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getBqto3MFilas } from "@/lib/bqto-queries";
import { getRatiosDemanda, getReferenciasOldSchool } from "@/lib/old-school-queries";
import { DIAS_HABILES_3M } from "@/lib/business-days";
import {
  CIUDADES_COMPLETAS,
  DIAS_HABILES_MES,
  MESES_PROYECCION,
  resumenBqto,
  type CiudadCompleta,
} from "@/lib/bqto-completo";
import {
  CRITERIOS_FOCO,
  escenariosOldSchool,
  proyeccionDemanda,
  proyeccionPorSegmento,
  sumarDemanda,
  sumarOldSchool,
  sumarSegmentos,
  type BaseRatio,
  type EscenarioOldSchool,
  type GrupoPiloto,
  type ProyeccionDemanda,
  type ProyeccionSegmentos,
  type RatioDemanda,
  type ReferenciaOldSchool,
} from "@/lib/old-school";

export const metadata: Metadata = { title: "Old School — Panquecitas" };

// Módulo aparte de DIENN (30-09-2026, pedido de Asdrúbal): proyección de
// Barquisimeto y Cumaná completas por equivalencia de activación con un solo
// promedio por ciudad — Barquisimeto con los valores de Cabudare, Cumaná con
// los de Cumaná piloto — y la venta promedio diaria que eso equivale. El
// cálculo vive en src/lib/old-school.ts; los datos de las ciudades son los
// mismos que carga "Ciudades completas".

const CIUDADES_OLD_SCHOOL: CiudadCompleta[] = ["barquisimeto", "cumana"];

const COLOR_META = "#16a34a";
const COLOR_PROYECCION = "#1a65bd";

const kg = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 0 });
const dec = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 1 });
const kg2 = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 2 });
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "—");

const BASES_RATIO: { base: BaseRatio; titulo: string; nota: string }[] = [
  {
    base: "dashboard",
    titulo: "Proyección con el % del dashboard",
    nota: "El % de cada piloto es el del gráfico de ratios del dashboard: su Harina PAN sale del Radar de 3 meses del piloto (radar_3m_records).",
  },
  {
    base: "mismaFuente",
    titulo: "Proyección con el % de la misma fuente",
    nota: "El % de cada piloto se calcula con la Harina PAN de sus clientes dentro del mismo archivo de la ciudad completa: el % y la demanda de la ciudad salen del mismo reporte.",
  },
];

function CajaRatio({ ciudad, ratio: r }: { ciudad: string; ratio: RatioDemanda }) {
  const filas: [string, string][] = [
    ["Panquecitas por día", `${dec(r.panqKgDia)} kg/día (${r.dias} días hábiles, ${fecha(r.desde)} a ${fecha(r.hasta)})`],
    ["Harina PAN por día · dashboard", `${kg(r.panKgDia.dashboard)} kg/día`],
    ["% de la demanda · dashboard", `${kg2(r.ratioPct.dashboard)}%`],
    [
      "Harina PAN por día · misma fuente",
      `${kg(r.panKgDia.mismaFuente)} kg/día (${r.clientesEnArchivo.toLocaleString("es-VE")} clientes en el archivo)`,
    ],
    ["% de la demanda · misma fuente", `${kg2(r.ratioPct.mismaFuente)}%`],
  ];
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        {r.etiqueta} <span className="normal-case tracking-normal font-normal">· % para {ciudad}</span>
      </p>
      <div className="space-y-1 text-sm">
        {filas.map(([label, valor]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-slate-500">{label}</span>
            <span className="font-bold text-slate-900 text-right">{valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TablaDemanda({
  filas,
}: {
  filas: { ciudad: string; perfil: string; p: ProyeccionDemanda; destacada?: boolean }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-semibold">Ciudad</th>
            <th className="py-2 pr-3 font-semibold text-right">Harina PAN / día</th>
            <th className="py-2 pr-3 font-semibold text-right">% de la demanda</th>
            <th className="py-2 pr-3 font-semibold text-right">Venta / día</th>
            <th className="py-2 pr-3 font-semibold text-right">Venta / mes</th>
            <th className="py-2 pr-3 font-semibold text-right">Venta {MESES_PROYECCION} meses</th>
            <th className="py-2 pr-3 font-semibold text-right">Meta 4% / mes</th>
            <th className="py-2 font-semibold text-right">% de la meta</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ ciudad, perfil, p, destacada }) => (
            <tr key={ciudad} className={`border-b last:border-0 ${destacada ? "bg-slate-50" : ""}`}>
              <td className={`py-2 pr-3 text-slate-900 ${destacada ? "font-bold" : "font-medium"}`}>
                {ciudad}
                <span className="block text-xs font-normal text-slate-400">% de {perfil}</span>
              </td>
              <td className="py-2 pr-3 text-right">{kg(p.panKgDia)} kg</td>
              <td className="py-2 pr-3 text-right">{kg2(p.ratioPct)}%</td>
              <td className="py-2 pr-3 text-right font-bold" style={{ color: COLOR_PROYECCION }}>
                {kg(p.kgDia)} kg
              </td>
              <td className="py-2 pr-3 text-right font-bold" style={{ color: COLOR_PROYECCION }}>
                {dec(p.kgMes / 1000)} t
              </td>
              <td className="py-2 pr-3 text-right">{dec(p.kgPeriodo / 1000)} t</td>
              <td className="py-2 pr-3 text-right" style={{ color: COLOR_META }}>
                {dec(p.metaMes / 1000)} t
              </td>
              <td className="py-2 text-right font-bold">{dec(p.pctMeta)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Una fila por segmento; por cada referencia, activación y venta diaria por activo. */
function TablaActivacionSegmentos({ referencias }: { referencias: ReferenciaOldSchool[] }) {
  const mapas = referencias.map((ref) => new Map(ref.porSegmento.map((s) => [s.clave, s])));
  const total = referencias[referencias.length - 1];
  return (
    <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b text-left uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-semibold" rowSpan={2}>
              Segmento
            </th>
            {referencias.map((ref) => (
              <th key={ref.etiqueta} className="py-2 pr-3 font-semibold text-center border-l" colSpan={2}>
                {ref.etiqueta}
              </th>
            ))}
          </tr>
          <tr className="border-b text-left uppercase tracking-wide text-slate-500">
            {referencias.map((ref) => (
              <Fragment key={ref.etiqueta}>
                <th className="py-1 px-3 font-semibold text-right border-l">Activación</th>
                <th className="py-1 pr-3 font-semibold text-right">kg/día por activo</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b bg-slate-50 font-bold">
            <td className="py-1.5 pr-3 text-slate-900">Todos los segmentos</td>
            {referencias.map((ref) => (
              <Fragment key={ref.etiqueta}>
                <td className="py-1.5 px-3 text-right border-l">
                  <Activacion g={ref.total} />
                </td>
                <td className="py-1.5 pr-3 text-right">{kg2(ref.kgDiaPorActivo)}</td>
              </Fragment>
            ))}
          </tr>
          {total.porSegmento.map((seg) => (
            <tr key={seg.clave} className="border-b last:border-0">
              <td className="py-1.5 pr-3 text-slate-900">{seg.tipo}</td>
              {mapas.map((m, i) => {
                const s = m.get(seg.clave);
                return (
                  <Fragment key={referencias[i].etiqueta}>
                    <td className="py-1.5 px-3 text-right border-l">{s ? <Activacion g={s} /> : "—"}</td>
                    <td className="py-1.5 pr-3 text-right">{s && s.activos > 0 ? kg2(s.kgDiaPorActivo) : "—"}</td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaResumenSegmentos({
  filas,
}: {
  filas: { ciudad: string; perfil: string; p: ProyeccionSegmentos; destacada?: boolean }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-semibold">Ciudad</th>
            <th className="py-2 pr-3 font-semibold text-right">Clientes</th>
            <th className="py-2 pr-3 font-semibold text-right">Clientes activados</th>
            <th className="py-2 pr-3 font-semibold text-right">Activación</th>
            <th className="py-2 pr-3 font-semibold text-right">Venta / día</th>
            <th className="py-2 pr-3 font-semibold text-right">Venta / mes</th>
            <th className="py-2 font-semibold text-right">Venta {MESES_PROYECCION} meses</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ ciudad, perfil, p, destacada }) => (
            <tr key={ciudad} className={`border-b last:border-0 ${destacada ? "bg-slate-50" : ""}`}>
              <td className={`py-2 pr-3 text-slate-900 ${destacada ? "font-bold" : "font-medium"}`}>
                {ciudad}
                <span className="block text-xs font-normal text-slate-400">segmentos de {perfil}</span>
              </td>
              <td className="py-2 pr-3 text-right">{p.clientes.toLocaleString("es-VE")}</td>
              <td className="py-2 pr-3 text-right">{kg(p.activados)}</td>
              <td className="py-2 pr-3 text-right">{dec(p.activacionPct)}%</td>
              <td className="py-2 pr-3 text-right font-bold" style={{ color: COLOR_PROYECCION }}>
                {kg(p.kgDia)} kg
              </td>
              <td className="py-2 pr-3 text-right font-bold" style={{ color: COLOR_PROYECCION }}>
                {kg(p.kgMes)} kg <span className="text-xs font-normal text-slate-400">({dec(p.kgMes / 1000)} t)</span>
              </td>
              <td className="py-2 text-right">{dec(p.kgPeriodo / 1000)} t</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaDetalleSegmentos({ titulo, p }: { titulo: string; p: ProyeccionSegmentos }) {
  return (
    <details className="rounded-lg border border-slate-200">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-900">{titulo}</summary>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-semibold">Segmento</th>
              <th className="py-2 pr-3 font-semibold text-right">Clientes</th>
              <th className="py-2 pr-3 font-semibold text-right">Activación</th>
              <th className="py-2 pr-3 font-semibold text-right">Clientes activados</th>
              <th className="py-2 pr-3 font-semibold text-right">kg/día por activo</th>
              <th className="py-2 pr-3 font-semibold text-right">Venta / día</th>
              <th className="py-2 font-semibold text-right">Venta / mes</th>
            </tr>
          </thead>
          <tbody>
            {p.filas.map((f) => (
              <tr key={f.clave} className={`border-b last:border-0 ${f.perfil ? "" : "text-slate-400"}`}>
                <td className="py-1.5 pr-3">
                  {f.tipo}
                  {f.perfil === "total" && <span className="ml-1 text-slate-400">(perfil del piloto total)</span>}
                  {!f.perfil && <span className="ml-1">(sin perfil en el piloto)</span>}
                </td>
                <td className="py-1.5 pr-3 text-right">{f.clientes.toLocaleString("es-VE")}</td>
                <td className="py-1.5 pr-3 text-right">{f.perfil ? `${dec(f.activacionPct)}%` : "—"}</td>
                <td className="py-1.5 pr-3 text-right">{dec(f.activados)}</td>
                <td className="py-1.5 pr-3 text-right">{f.perfil ? kg2(f.kgDiaPorActivo) : "—"}</td>
                <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: COLOR_PROYECCION }}>
                  {dec(f.kgDia)} kg
                </td>
                <td className="py-1.5 text-right">{kg(f.kgMes)} kg</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <td className="py-1.5 pr-3">Total</td>
              <td className="py-1.5 pr-3 text-right">{p.clientes.toLocaleString("es-VE")}</td>
              <td className="py-1.5 pr-3 text-right">{dec(p.activacionPct)}%</td>
              <td className="py-1.5 pr-3 text-right">{kg(p.activados)}</td>
              <td className="py-1.5 pr-3 text-right">{p.activados > 0 ? kg2(p.kgDia / p.activados) : "—"}</td>
              <td className="py-1.5 pr-3 text-right" style={{ color: COLOR_PROYECCION }}>
                {kg(p.kgDia)} kg
              </td>
              <td className="py-1.5 text-right">{kg(p.kgMes)} kg</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Activacion({ g }: { g: GrupoPiloto }) {
  return (
    <>
      {dec(g.activacionPct)}%{" "}
      <span className="text-xs font-normal text-slate-400">
        ({g.activos.toLocaleString("es-VE")} de {g.cartera.toLocaleString("es-VE")})
      </span>
    </>
  );
}

function CajaReferencia({ ciudad, referencia: ref }: { ciudad: string; referencia: ReferenciaOldSchool }) {
  const filas: [string, React.ReactNode][] = [
    ["Activación total", <Activacion key="t" g={ref.total} />],
    ["Foco por tipo de cliente", <Activacion key="tf" g={ref.grupos.tipo.foco} />],
    ["Fuera de foco por tipo", <Activacion key="tn" g={ref.grupos.tipo.noFoco} />],
    ["Foco por segmento", <Activacion key="sf" g={ref.grupos.segmento.foco} />],
    ["Fuera de foco por segmento", <Activacion key="sn" g={ref.grupos.segmento.noFoco} />],
    [
      "Panquecitas vendidas",
      <>
        {kg(ref.kgPanquecitas)} kg{" "}
        <span className="text-xs font-normal text-slate-400">
          ({fecha(ref.desde)} a {fecha(ref.corte)})
        </span>
      </>,
    ],
    ["Días hábiles", ref.diasHabiles.toLocaleString("es-VE")],
    ["Venta promedio diaria", `${dec(ref.kgDia)} kg/día`],
    ["Venta diaria por cliente activo", `${kg2(ref.kgDiaPorActivo)} kg/día`],
  ];
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        {ref.etiqueta} <span className="normal-case tracking-normal font-normal">· perfil para {ciudad}</span>
      </p>
      <div className="space-y-1 text-sm">
        {filas.map(([label, valor]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-slate-500">{label}</span>
            <span className="font-bold text-slate-900 text-right">{valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TablaEscenarios({ filas }: { filas: { ciudad: string; perfil: string; e: EscenarioOldSchool }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-semibold">Ciudad</th>
            <th className="py-2 pr-3 font-semibold">Población</th>
            <th className="py-2 pr-3 font-semibold text-right">Clientes</th>
            <th className="py-2 pr-3 font-semibold text-right">Activación</th>
            <th className="py-2 pr-3 font-semibold text-right">Clientes activados</th>
            <th className="py-2 pr-3 font-semibold text-right">Veces el piloto</th>
            <th className="py-2 pr-3 font-semibold text-right">Venta / día</th>
            <th className="py-2 pr-3 font-semibold text-right">Venta / mes</th>
            <th className="py-2 pr-3 font-semibold text-right">Venta {MESES_PROYECCION} meses</th>
            <th className="py-2 pr-3 font-semibold text-right">Meta 4% / mes</th>
            <th className="py-2 font-semibold text-right">% de la meta</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ ciudad, perfil, e }) => (
            <tr key={`${ciudad}|${e.poblacion}`} className={`border-b last:border-0 ${e.destacada ? "bg-slate-50" : ""}`}>
              <td className={`py-2 pr-3 text-slate-900 ${e.destacada ? "font-bold" : "font-medium"}`}>
                {ciudad}
                <span className="block text-xs font-normal text-slate-400">perfil de {perfil}</span>
              </td>
              <td className="py-2 pr-3 text-slate-700">{e.poblacion}</td>
              <td className="py-2 pr-3 text-right">{e.clientes.toLocaleString("es-VE")}</td>
              <td className="py-2 pr-3 text-right">{dec(e.activacionPct)}%</td>
              <td className="py-2 pr-3 text-right">{kg(e.activados)}</td>
              <td className="py-2 pr-3 text-right">{dec(e.vecesPiloto)}×</td>
              <td className="py-2 pr-3 text-right font-bold" style={{ color: COLOR_PROYECCION }}>
                {kg(e.kgDia)} kg
              </td>
              <td className="py-2 pr-3 text-right font-bold" style={{ color: COLOR_PROYECCION }}>
                {kg(e.kgMes)} kg
              </td>
              <td className="py-2 pr-3 text-right">{kg(e.kgPeriodo)} kg</td>
              <td className="py-2 pr-3 text-right" style={{ color: COLOR_META }}>
                {kg(e.metaMes)} kg
              </td>
              <td className="py-2 text-right font-bold">{dec(e.pctMeta)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function OldSchoolPage() {
  const session = await requireDashboard();
  if (session.role !== "DIENN") redirect("/dashboard");

  const { filas, error } = await getBqto3MFilas();
  const filasDe = (c: CiudadCompleta) => filas.filter((f) => f.ciudad === c);
  const [refs, ratios] = await Promise.all([
    getReferenciasOldSchool(),
    getRatiosDemanda({ barquisimeto_este: filasDe("barquisimeto"), cumana: filasDe("cumana") }),
  ]);

  const ciudades = CIUDADES_OLD_SCHOOL.map((c) => {
    const { nombre, sector } = CIUDADES_COMPLETAS[c];
    return { c, nombre, ref: refs[sector!], ratio: ratios[sector!], r: resumenBqto(filasDe(c)) };
  });
  const cargadas = ciudades.filter((x) => x.r !== null);
  const faltan = ciudades.filter((x) => x.r === null);
  const activosPiloto = cargadas.reduce((s, x) => s + x.ref.total.activos, 0);

  const tablasDemanda = cargadas.length === 0 ? [] : BASES_RATIO.map(({ base, titulo, nota }) => {
    const porCiudad = cargadas.map((x) => ({
      ciudad: x.nombre,
      perfil: x.ratio.etiqueta,
      p: proyeccionDemanda(x.r!, x.ratio.ratioPct[base]),
    }));
    const total =
      porCiudad.length > 1
        ? [
            {
              ciudad: porCiudad.map((x) => x.ciudad).join(" + "),
              perfil: porCiudad.map((x) => x.perfil).join(" y "),
              p: sumarDemanda(porCiudad.map((x) => x.p)),
              destacada: true,
            },
          ]
        : [];
    return { base, titulo, nota, filas: [...porCiudad, ...total] };
  });

  const porSegmentoCiudad = cargadas.map((x) => ({
    x,
    p: proyeccionPorSegmento(x.r!.porCliente, x.ref, refs.total),
  }));
  const totalSegmentos = porSegmentoCiudad.length > 1 ? sumarSegmentos(porSegmentoCiudad.map((c) => c.p)) : null;
  const nombreTotal = cargadas.map((x) => x.nombre).join(" + ");
  const segmentos =
    porSegmentoCiudad.length === 0
      ? null
      : {
          resumen: [
            ...porSegmentoCiudad.map(({ x, p }) => ({ ciudad: x.nombre, perfil: x.ref.etiqueta, p })),
            ...(totalSegmentos
              ? [
                  {
                    ciudad: nombreTotal,
                    perfil: cargadas.map((x) => x.ref.etiqueta).join(" y "),
                    p: totalSegmentos,
                    destacada: true,
                  },
                ]
              : []),
          ],
          detalles: [
            ...porSegmentoCiudad.map(({ x, p }) => ({
              titulo: `Detalle por segmento — ${x.nombre} con los segmentos de ${x.ref.etiqueta}`,
              p,
            })),
            ...(totalSegmentos ? [{ titulo: `Detalle por segmento — ${nombreTotal}`, p: totalSegmentos }] : []),
          ],
        };

  const tablas = cargadas.length === 0 ? [] : CRITERIOS_FOCO.map(({ criterio, titulo, nota }) => {
    const porCiudad = cargadas.map((x) => ({ x, escenarios: escenariosOldSchool(x.r!, x.ref, criterio) }));
    const total = porCiudad.length > 1 ? sumarOldSchool(porCiudad.map((p) => p.escenarios), activosPiloto) : [];
    return {
      criterio,
      titulo,
      nota,
      filas: [
        ...porCiudad.flatMap(({ x, escenarios }) =>
          escenarios.map((e) => ({ ciudad: x.nombre, perfil: x.ref.etiqueta, e }))
        ),
        ...total.map((e) => ({
          ciudad: cargadas.map((x) => x.nombre).join(" + "),
          perfil: cargadas.map((x) => x.ref.etiqueta).join(" y "),
          e,
        })),
      ],
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Old School</h1>
        <p className="text-slate-500 mt-1">
          Proyección de Barquisimeto y Cumaná completas por segmento: los clientes de cada segmento de la ciudad se
          activan en el mismo % que ese segmento en su piloto (Barquisimeto con Cabudare, Cumaná con Cumaná) y cada
          cliente activado vende lo que vende hoy al día un cliente activo de ese segmento. No afecta el Dashboard.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            No se pudo leer la tabla bqto_3m_ventas ({error}). ¿Falta correr los migrations 025 y 026 en Supabase?
          </AlertDescription>
        </Alert>
      )}

      {faltan.length > 0 && (
        <Alert>
          <AlertDescription>
            Falta cargar el Radar de Harina PAN de 3 meses de {faltan.map((x) => x.nombre).join(" y ")} en{" "}
            <Link href="/bqto-completo" className="underline">
              Ciudades completas
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. Activación por segmento en el piloto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TablaActivacionSegmentos
            referencias={[refs.barquisimeto_este, refs.cumana, refs.total]}
          />
          <p className="text-xs text-slate-400">
            Segmento = Tipo de Cliente: es el único corte que trae también el archivo de la ciudad completa. Activación
            = clientes con Radar de Panquecitas &gt; 0 ÷ cartera vigente del segmento. Venta diaria por activo = Radar
            de Panquecitas del segmento desde el {fecha(refs.total.desde)} ÷ {refs.total.diasHabiles} días hábiles ÷
            activos.
          </p>
        </CardContent>
      </Card>

      {segmentos && (
        <Card>
          <CardHeader>
            <CardTitle>2. Proyección por segmento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TablaResumenSegmentos filas={segmentos.resumen} />
            <div className="space-y-2">
              {segmentos.detalles.map((d) => (
                <TablaDetalleSegmentos key={d.titulo} titulo={d.titulo} p={d.p} />
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Por segmento: clientes de la ciudad completa (con Harina PAN en su Radar de 3 meses) × activación del
              segmento en el piloto × venta diaria por cliente activo del segmento en el piloto. La ciudad es la suma
              de sus segmentos y el total, la suma de las dos ciudades. Mensual = diario × {DIAS_HABILES_MES} días
              hábiles. Barquisimeto usa los segmentos de Cabudare y Cumaná los de Cumaná piloto; un segmento que no
              está en la cartera de ese sector usa el del piloto total, y uno que no está en ninguna proyecta 0.
            </p>
          </CardContent>
        </Card>
      )}

      {tablasDemanda.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-900">
            Proyección por participación en la demanda (% de la Harina PAN del piloto aplicado a la ciudad)
          </summary>
          <div className="space-y-6 px-4 pb-4">
            <div className="grid gap-4 md:grid-cols-2">
              {ciudades.map((x) => (
                <CajaRatio key={x.c} ciudad={x.nombre} ratio={x.ratio} />
              ))}
            </div>
            {tablasDemanda.map((t) => (
              <div key={t.base} className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">{t.titulo}</p>
                <p className="text-sm text-slate-500">{t.nota}</p>
                <TablaDemanda filas={t.filas} />
              </div>
            ))}
            <p className="text-xs text-slate-400">
              % de la demanda = Panquecitas por día hábil del sector piloto desde el{" "}
              {fecha(ciudades[0]?.ratio.desde ?? null)} ÷ Harina PAN por día de su cartera (3 meses ÷ {DIAS_HABILES_3M}
              ). Venta / día = Harina PAN por día de la ciudad completa × ese %. Venta / mes = venta / día ×{" "}
              {DIAS_HABILES_MES} días hábiles. La meta es el 4% de la Harina PAN mensual de la ciudad, así que % de la
              meta = % de la demanda ÷ 4%.
            </p>
          </div>
        </details>
      )}

      {tablas.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-900">
            Método por cliente activo (equivalencia de activación × venta diaria por cliente activo)
          </summary>
          <div className="space-y-6 px-4 pb-4">
            <div className="grid gap-4 md:grid-cols-2">
              {ciudades.map((x) => (
                <CajaReferencia key={x.c} ciudad={x.nombre} referencia={x.ref} />
              ))}
            </div>
            {tablas.map((t) => (
              <div key={t.criterio} className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">{t.titulo}</p>
                <p className="text-sm text-slate-500">{t.nota}</p>
                <TablaEscenarios filas={t.filas} />
              </div>
            ))}
            <p className="text-xs text-slate-400">
              Clientes = clientes de la ciudad completa con Harina PAN en su Radar de 3 meses; en la ciudad el foco
              siempre se corta por tipo de cliente, porque su archivo no trae el segmento. Clientes activados = clientes
              × activación del sector piloto, por separado para foco y fuera de foco; todos los clientes = la suma de
              los dos, y su activación es la efectiva (activados ÷ clientes). Veces el piloto = clientes activados ÷
              activos del sector piloto. Venta / día = clientes activados × venta diaria por cliente activo del sector
              (Radar de Panquecitas desde el {fecha(ciudades[0]?.ref.desde ?? null)} ÷ días hábiles ÷ activos). Venta /
              mes = venta / día × {DIAS_HABILES_MES} días hábiles. La meta es el 4% de la Harina PAN mensual de esa
              misma población. La suma de las dos ciudades suma cada una con su propio perfil. El valor real debería
              quedar entre los dos escenarios: no se sabe cuántos clientes CS tiene la ciudad completa.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
