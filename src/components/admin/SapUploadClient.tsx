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

export function SapUploadClient() {
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
            <SapDropzone onCommitSuccess={handleCommitSuccess} />
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
            <CardTitle>Reporte SAP esperado</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-1">
            <p className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">N7_V_SD88_WEB_001</p>
            <p className="text-xs text-slate-400 mt-2">El parser extrae automáticamente:</p>
            <p>• <span className="font-medium">Localidades</span> — crea o actualiza en BD</p>
            <p>• <span className="font-medium">Meses</span> — detecta columnas KGL dinámicamente</p>
            <p>• <span className="font-medium">Categoría</span> — "Harina de Maíz" → Harina PAN</p>
            <p className="text-xs text-amber-600 mt-2">
              Panquecitas: el tag SAP se configurará cuando esté disponible.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
