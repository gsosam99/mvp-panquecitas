"use client";

import { useState } from "react";
import { PendingOrdersDropzone } from "@/components/admin/PendingOrdersDropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UploadRecord {
  count: number;
  unmatched: string[];
  timestamp: Date;
}

export function PendingOrdersUploadClient() {
  const [history, setHistory] = useState<UploadRecord[]>([]);

  function handleCommitSuccess(count: number, unmatched: string[]) {
    setHistory((prev) => [{ count, unmatched, timestamp: new Date() }, ...prev]);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Importar pedidos pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <PendingOrdersDropzone onCommitSuccess={handleCommitSuccess} />
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
                {history.map((rec, i) => (
                  <li key={i}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-700">
                        {rec.timestamp.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <Badge>{rec.count} pedidos</Badge>
                    </div>
                    {rec.unmatched.length > 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        {rec.unmatched.length} códigos SAP sin PDV: {rec.unmatched.slice(0, 3).join(", ")}
                        {rec.unmatched.length > 3 ? "…" : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Formato del reporte</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-1">
            <p className="text-xs text-amber-600">
              El formato exacto del reporte SAP de pedidos pendientes aún no fue confirmado por el equipo.
            </p>
            <p className="text-xs text-slate-400 mt-2">
              El parser busca columnas por nombre: "Nº cliente" (código SAP), "Cantidad" y "Fecha". Ajusta{" "}
              <span className="font-mono">parsePendingOrdersExcel</span> en{" "}
              <span className="font-mono">src/lib/excel-parser.ts</span> cuando llegue un archivo real.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
