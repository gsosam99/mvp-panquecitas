import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getBqto3MFilas } from "@/lib/bqto-queries";
import { getReferenciasOldSchool } from "@/lib/old-school-queries";
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
  sumarOldSchool,
  type EscenarioOldSchool,
  type GrupoPiloto,
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

  const [{ filas, error }, refs] = await Promise.all([getBqto3MFilas(), getReferenciasOldSchool()]);

  const ciudades = CIUDADES_OLD_SCHOOL.map((c) => {
    const { nombre, sector } = CIUDADES_COMPLETAS[c];
    const ref = refs[sector!];
    return { c, nombre, ref, r: resumenBqto(filas.filter((f) => f.ciudad === c)) };
  });
  const cargadas = ciudades.filter((x) => x.r !== null);
  const faltan = ciudades.filter((x) => x.r === null);
  const activosPiloto = cargadas.reduce((s, x) => s + x.ref.total.activos, 0);

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
          Proyección de Barquisimeto y Cumaná completas por equivalencia de activación: la cartera completa de cada
          ciudad se activa en el mismo % que su sector piloto (Barquisimeto con Cabudare, Cumaná con Cumaná), foco y
          fuera de foco cada uno con el suyo, y cada cliente activado vende lo que vende hoy al día un cliente activo de
          ese sector. Se muestran dos escenarios según cómo se corta el foco del piloto. No afecta el Dashboard.
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
          <CardTitle>1. Perfil de hoy del piloto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {ciudades.map((x) => (
              <CajaReferencia key={x.c} ciudad={x.nombre} referencia={x.ref} />
            ))}
          </div>
        </CardContent>
      </Card>

      {tablas.map((t, i) => (
        <Card key={t.criterio}>
          <CardHeader>
            <CardTitle>
              {i + 2}. {t.titulo}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">{t.nota}</p>
            <TablaEscenarios filas={t.filas} />
          </CardContent>
        </Card>
      ))}

      {tablas.length > 0 && (
        <p className="text-xs text-slate-400">
          Clientes = clientes de la ciudad completa con Harina PAN en su Radar de 3 meses; en la ciudad el foco siempre
          se corta por tipo de cliente, porque su archivo no trae el segmento. Clientes activados = clientes × activación
          del sector piloto, por separado para foco y fuera de foco; todos los clientes = la suma de los dos, y su
          activación es la efectiva (activados ÷ clientes). Veces el piloto = clientes activados ÷ activos del sector
          piloto. Venta / día = clientes activados × venta diaria por cliente activo del sector (Radar de Panquecitas
          desde el {fecha(ciudades[0]?.ref.desde ?? null)} ÷ días hábiles ÷ activos). Venta / mes = venta / día ×{" "}
          {DIAS_HABILES_MES} días hábiles. La meta es el 4% de la Harina PAN mensual de esa misma población. La suma de
          las dos ciudades suma cada una con su propio perfil. El valor real debería quedar entre los dos escenarios: no
          se sabe cuántos clientes CS tiene la ciudad completa.
        </p>
      )}
    </div>
  );
}
