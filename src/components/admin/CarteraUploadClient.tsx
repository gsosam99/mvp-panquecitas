"use client";

import { useState } from "react";
import { CarteraDropzone } from "@/components/admin/CarteraDropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UploadRecord {
  count: number;
  sinSector: number;
  timestamp: Date;
}

export function CarteraUploadClient() {
  const [history, setHistory] = useState<UploadRecord[]>([]);

  function handleCommitSuccess(count: number, sinSector: number) {
    setHistory((prev) => [{ count, sinSector, timestamp: new Date() }, ...prev]);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Importar cartera de clientes</CardTitle>
          </CardHeader>
          <CardContent>
            <CarteraDropzone onCommitSuccess={handleCommitSuccess} />
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
                      <Badge>{rec.count} loc.</Badge>
                    </div>
                    {rec.sinSector > 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        {rec.sinSector} sin sector reconocido — revisa la columna &quot;Oficina de Ventas&quot;.
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
            <CardTitle>Qué hace esta carga</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-1">
            <p>
              Actualiza (upsert por código SAP) el <span className="font-medium">Tipo de Cliente</span>, la{" "}
              <span className="font-medium">Oficina de Ventas</span>, el Centro Poblado y el Municipio de
              cada PDV.
            </p>
            <p className="text-xs text-slate-400 mt-2">
              No borra ni modifica el historial de ventas ni de visitas — solo la ficha de la localidad.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
