import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getResumenPiloto } from "@/lib/resumen-piloto-queries";

export const metadata: Metadata = { title: "Resumen del Piloto — Panquecitas" };

export default async function ResumenPilotoPage() {
  const resumen = await getResumenPiloto();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Resumen del Piloto</h1>
        <p className="text-slate-500 mt-1">
          Estructura comercial y tandas de incorporación de la cartera, calculado en vivo contra la base de datos.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total PDV (sectores piloto)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{resumen.totalPdv}</p>
            <p className="text-xs text-slate-400 mt-1">
              {resumen.pdvEnCartera} en cartera · {resumen.pdvFueraDeCartera} marcados &quot;Fuera de cartera&quot;
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Grupos vendedores</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{resumen.gruposVendedores.length}</p>
            <p className="text-xs text-slate-400 mt-1">{resumen.gruposVendedores.join(", ") || "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Vendedores (asesor encargado)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{resumen.cantidadVendedores}</p>
            <p className="text-xs text-slate-400 mt-1">Nombres distintos en la columna &quot;Asesor Encargado&quot;.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Franquiciados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{resumen.franquiciados}</p>
            <p className="text-xs text-slate-400 mt-1">
              Modelo indirecto de Cumaná (14-08). No cuentan como PDV, solo Pedido/Facturado.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Distribuidoras intermediarias</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{resumen.distribuidorasIntermediarias}</p>
            <p className="text-xs text-slate-400 mt-1">Anteriores al piloto — mismo tratamiento que los franquiciados.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>PDV por ciudad</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {resumen.porSector.map((s) => (
              <div key={s.sector} className="rounded-lg border border-slate-100 p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-medium text-slate-900">{s.label}</p>
                  <p className="text-2xl font-bold text-slate-900">{s.total}</p>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-500">
                  <div className="flex justify-between">
                    <span>Directos</span>
                    <span className="font-medium text-slate-700">{s.directos}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Indirectos</span>
                    <span className="font-medium text-slate-700">{s.indirectos}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mixtos</span>
                    <span className="font-medium text-slate-700">{s.mixtos}</span>
                  </div>
                  {s.sinEsquema > 0 && (
                    <div className="flex justify-between">
                      <span>Sin esquema cargado</span>
                      <span className="font-medium text-slate-700">{s.sinEsquema}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PDV por tanda de incorporación</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            La tanda es CUÁNDO entró el cliente a la cartera; el esquema de atención es CÓMO se le atiende
            (Directo/Indirecto/Mixto) — son dos campos independientes. Por eso un PDV &quot;Indirecto&quot; en una
            ciudad no siempre coincide con el tamaño de la tanda &quot;Indirecto&quot; de esa ciudad: puede haber
            indirectos de otras tandas (p. ej. del Piloto original), o PDV de esta tanda sin el esquema cargado
            todavía en la Cartera de Clientes.
          </p>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-100">
            {resumen.porCohorte.map((c) => (
              <div key={c.nombre} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{c.nombre}</p>
                    {c.desde && <p className="text-xs text-slate-400">Cuenta en el universo desde el {c.desde}</p>}
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{c.cantidad}</p>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  De estos: {c.directos} directos · {c.indirectos} indirectos · {c.mixtos} mixtos
                  {c.sinEsquema > 0 && <> · {c.sinEsquema} sin esquema cargado</>}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
