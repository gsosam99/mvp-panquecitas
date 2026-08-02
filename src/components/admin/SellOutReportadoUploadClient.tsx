"use client";

import { useState } from "react";
import { SellOutReportadoDropzone } from "@/components/admin/SellOutReportadoDropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UploadRecord {
  count: number;
  unmatched: string[];
  timestamp: Date;
}

export function SellOutReportadoUploadClient() {
  const [history, setHistory] = useState<UploadRecord[]>([]);

  function handleCommitSuccess(count: number, unmatched: string[]) {
    setHistory((prev) => [{ count, unmatched, timestamp: new Date() }, ...prev]);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Importar Sell-Out reportado por Cadenas</CardTitle>
          </CardHeader>
          <CardContent>
            <SellOutReportadoDropzone onCommitSuccess={handleCommitSuccess} />
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
                      <Badge>{rec.count} reg.</Badge>
                    </div>
                    {rec.unmatched.length > 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        {rec.unmatched.length} códigos SAP sin PDV asociado.
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
            <CardTitle>Cómo funciona</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-1">
            <p>
              Solo se usa para clientes marcados con{" "}
              <span className="font-mono text-xs bg-slate-100 px-1 rounded">Fuente Sell-Out = Reportado_B2B</span>{" "}
              (columna opcional en la cartera de clientes). Para esos, el dashboard ignora la fórmula calculada
              y usa directamente este volumen.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
