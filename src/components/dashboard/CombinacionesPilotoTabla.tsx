"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportExcelButton } from "@/components/dashboard/ExportExcelButton";
import type { ExcelColumn } from "@/lib/export-excel";
import type { CombinacionRow, CombinacionesResult } from "@/lib/mavesa-queries";

// Tabla de las 4 combinaciones del piloto: precio × comunicación × ciudad.
//
// El piloto no corrió una sola dinámica — cada grupo vendedor trabajó con un
// precio y un eje de comunicación distintos. Comparar el total de Cumaná
// contra el de Cabudare mezcla las dos variables a la vez; acá cada fila es
// una configuración concreta y los ratios son los de SUS grupos vendedores.

const num = (v: number) => v.toLocaleString("es-VE", { maximumFractionDigits: 0 });
const kg1 = (v: number) => `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })} kg`;
const pct = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;
const precio = (v: number) => v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CombinacionesPilotoTabla({ data }: { data: CombinacionesResult }) {
  if (data.filas.length === 0) return null;

  const columnas: ExcelColumn<CombinacionRow>[] = [
    { header: "Combinación", value: (r) => r.nombre, width: 18 },
    { header: "Ciudad", value: (r) => r.ciudad, width: 20 },
    { header: "Precio 800g", value: (r) => r.precio800, width: 14 },
    { header: "Precio 400g", value: (r) => r.precio400, width: 14 },
    { header: "Comunicación", value: (r) => r.comunicacion, width: 16 },
    { header: "Grupos vendedores", value: (r) => r.gruposVendedores.join(", "), width: 22 },
    { header: "PDV en cartera", value: (r) => r.clientes, width: 16 },
    { header: "Ratio vs Harina PAN (%)", value: (r) => r.ratioHarinaPan, width: 24 },
    { header: "Ratio vs Margarina (%)", value: (r) => r.ratioMargarina, width: 24 },
    { header: "Ratio vs Mayonesa (%)", value: (r) => r.ratioMayonesa, width: 24 },
    { header: "Ventas Panquecitas (kg)", value: (r) => r.panquecitasKg, width: 24 },
    { header: "Panquecitas (kg/día con venta)", value: (r) => r.panquecitasKgDia, width: 28 },
    { header: "Días con venta", value: (r) => r.diasConVenta, width: 16 },
    { header: "Harina PAN (kg/día)", value: (r) => r.harinaPanKgDia, width: 20 },
    { header: "Margarina (kg/día)", value: (r) => r.margarinaKgDia, width: 20 },
    { header: "Mayonesa (kg/día)", value: (r) => r.mayonesaKgDia, width: 20 },
  ];

  const totalKg = data.filas.reduce((s, f) => s + f.panquecitasKg, 0);
  const totalPdv = data.filas.reduce((s, f) => s + f.clientes, 0);

  return (
    <Card className="mb-6 print-avoid-break">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle>Combinaciones del Piloto — precio y comunicación</CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            El piloto no corrió una sola dinámica: cada grupo vendedor trabajó con un{" "}
            <span className="font-medium">precio</span> y un{" "}
            <span className="font-medium">eje de comunicación</span> distintos. Comparar Cumaná contra Cabudare mezcla
            las dos variables a la vez — acá cada fila es una configuración concreta, y sus ratios salen solo de los
            PDV de sus grupos vendedores.
          </p>
        </div>
        <ExportExcelButton filename="Combinaciones del piloto" rows={data.filas} columns={columnas} />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Combinación</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead className="text-right">Precio 800g</TableHead>
                <TableHead className="text-right">Precio 400g</TableHead>
                <TableHead>Comunicación</TableHead>
                <TableHead>Grupos</TableHead>
                <TableHead className="text-right">PDV</TableHead>
                <TableHead className="text-right">Ratio Harina PAN</TableHead>
                <TableHead className="text-right">Ratio Margarina</TableHead>
                <TableHead className="text-right">Ratio Mayonesa</TableHead>
                <TableHead className="text-right">Ventas kg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.filas.map((f) => (
                <TableRow key={f.numero}>
                  <TableCell className="font-medium whitespace-nowrap">{f.nombre}</TableCell>
                  <TableCell className="text-slate-500">{f.ciudad}</TableCell>
                  <TableCell className="text-right font-semibold">{precio(f.precio800)}</TableCell>
                  <TableCell className="text-right font-semibold">{precio(f.precio400)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-normal ${
                        f.comunicacion === "Nutrición"
                          ? "border-emerald-300 text-emerald-700"
                          : "border-sky-300 text-sky-700"
                      }`}
                    >
                      {f.comunicacion}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                    {f.gruposVendedores.join(", ")}
                  </TableCell>
                  <TableCell className="text-right text-slate-500">{num(f.clientes)}</TableCell>
                  <TableCell className="text-right font-semibold text-blue-700">{pct(f.ratioHarinaPan)}</TableCell>
                  <TableCell className="text-right font-semibold text-amber-700">{pct(f.ratioMargarina)}</TableCell>
                  <TableCell className="text-right font-semibold text-teal-700">{pct(f.ratioMayonesa)}</TableCell>
                  <TableCell className="text-right font-semibold">{kg1(f.panquecitasKg)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-slate-50 font-semibold">
                <TableCell colSpan={6}>Total</TableCell>
                <TableCell className="text-right">{num(totalPdv)}</TableCell>
                <TableCell colSpan={3} className="text-right text-xs font-normal text-slate-400">
                  los ratios no se suman
                </TableCell>
                <TableCell className="text-right">{kg1(totalKg)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-slate-400 mt-3">
          Los <span className="font-medium text-slate-600">ratios</span> usan la misma lógica que el resto del
          dashboard, solo que acotada a los PDV de los grupos vendedores de cada combinación: el promedio de la
          categoría es su venta de mayo–julio ÷ {data.diasReferencia} días hábiles, el ratio de cada día es las
          Panquecitas de ese día ÷ ese promedio, y lo que se muestra es el{" "}
          <span className="font-medium text-slate-600">promedio de esos ratios diarios</span> — no Σ kg ÷ Σ
          referencia. Por eso el divisor de Panquecitas son los días CON VENTA y no los días hábiles transcurridos: un
          día sin despacho no diluye el ratio.{" "}
          <span className="font-medium text-slate-600">Ventas kg</span> sí es el acumulado del piloto, sin dividir.
          {" "}
          <span className="font-medium text-slate-600">No cuadra con la tarjeta de Volumen Radar</span> y es a
          propósito: acá solo suman los PDV de la cartera, y esa tarjeta además incluye los que están fuera de ella.
          {data.sinCombinacion > 0 && (
            <>
              {" "}
              <span className="font-medium text-amber-700">
                {num(data.sinCombinacion)} PDV quedaron fuera de toda combinación
              </span>{" "}
              porque su grupo vendedor no está mapeado
              {data.gruposSinMapear.length > 0 && <> ({data.gruposSinMapear.join(", ")})</>}. No se reparten en la
              combinación más parecida: si aparece un grupo nuevo tiene que verse, no diluirse.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
