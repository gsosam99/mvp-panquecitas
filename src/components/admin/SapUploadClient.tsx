"use client";

import { useState } from "react";
import { SapDropzone } from "@/components/admin/SapDropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UploadRecord {
  batchId: string;
  count: number;
  timestamp: Date;
}

interface SapUploadClientProps {
  mode: "radar" | "facturacion";
}

export function SapUploadClient({ mode }: SapUploadClientProps) {
  const [history, setHistory] = useState<UploadRecord[]>([]);

  function handleCommitSuccess(batchId: string, count: number, locationsCount: number) {
    setHistory((prev) => [{ batchId, count: count + locationsCount, timestamp: new Date() }, ...prev]);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Importar archivo Excel</CardTitle>
          </CardHeader>
          <CardContent>
            <SapDropzone mode={mode} onCommitSuccess={handleCommitSuccess} />
          </CardContent>
        </Card>
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle>Cargas de esta sesión</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-slate-400">Aún no hay cargas en esta sesión.</p>
            ) : (
              <ul className="space-y-3">
                {history.map((rec) => (
                  <li key={rec.batchId} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {rec.timestamp.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="text-xs text-slate-400 font-mono truncate max-w-[140px]">{rec.batchId}</p>
                    </div>
                    <Badge>{rec.count} reg.</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{mode === "radar" ? "Reportes Radar esperados" : "Reporte esperado"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-3">
            {mode === "radar" ? (
              <>
                <div>
                  <p className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">Radar HPM.xls</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Export SAP (MHTML) · Harina PAN, acumulado ENTREGADO por cliente+material en lo que va del mes.
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">Radar panquecitas.xls</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Export SAP (MHTML) · Panquecitas, mismo acumulado por cliente+material (400g/800g).
                  </p>
                </div>
                <p className="text-xs text-slate-400">
                  Solo cuenta clientes ya registrados en la Cartera de Clientes. Volver a subir el mismo mes
                  reemplaza el acumulado — no lo duplica.
                </p>
              </>
            ) : (
              <div>
                <p className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">factura y pedido panquecitas.xls</p>
                <p className="text-xs text-slate-400 mt-1">
                  Export SAP (MHTML) · Panquecitas · Cantidad Pedido/Facturada por día. Se sube tal cual se
                  descarga, sin convertir a Excel. Alimenta ventas y pedidos pendientes en la misma carga.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
