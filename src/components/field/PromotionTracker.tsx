"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PdvSelector } from "@/components/field/PdvSelector";
import type { Location } from "@/types";

interface PromotionTrackerProps {
  locations: Location[];
}

type View = "location" | "counters" | "done";

interface CounterProps {
  label: string;
  sublabel: string;
  emoji: string;
  value: number;
  max?: number;
  onChange: (val: number) => void;
}

function Counter({ label, sublabel, emoji, value, max, onChange }: CounterProps) {
  const [inputStr, setInputStr] = useState(value > 0 ? value.toString() : "");

  useEffect(() => {
    setInputStr(value > 0 ? value.toString() : "");
  }, [value]);

  function handleInputChange(raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    setInputStr(cleaned);
    const n = parseInt(cleaned, 10);
    onChange(isNaN(n) ? 0 : Math.max(0, max !== undefined ? Math.min(max, n) : n));
  }

  return (
    <div className="flex flex-col items-center">
      <span className="text-4xl mb-1">{emoji}</span>
      <p className="font-bold text-slate-900 text-center">{label}</p>
      <p className="text-xs text-slate-400 text-center mb-4">{sublabel}</p>
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-16 h-16 rounded-full border-2 border-slate-300 text-3xl font-bold text-slate-600 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-40"
          disabled={value === 0}
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={inputStr}
          placeholder="0"
          onChange={(e) => handleInputChange(e.target.value)}
          className="w-20 h-16 text-4xl font-bold text-slate-900 text-center bg-transparent border-b-2 border-slate-300 focus:border-slate-700 focus:outline-none tabular-nums"
        />
        <button
          onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
          className="w-16 h-16 rounded-full bg-slate-900 text-white text-3xl font-bold flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-40"
          disabled={max !== undefined && value >= max}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function PromotionTracker({ locations }: PromotionTrackerProps) {
  const [view, setView] = useState<View>("location");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [samples, setSamples] = useState(0);
  const [conversions, setConversions] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  function handleSelectLocation(loc: Location) {
    setSelectedLocation(loc);
    setSamples(0);
    setConversions(0);
    setView("counters");
  }

  function handleReset() {
    setSelectedLocation(null);
    setSamples(0);
    setConversions(0);
    setView("location");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function handleSubmit() {
    if (!selectedLocation) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: selectedLocation.id,
          report_date: today,
          samples_given: samples,
          conversions_tracked: conversions,
        }),
      });

      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar");
        return;
      }

      setView("done");
      toast.success("Reporte enviado correctamente");
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (view === "done") {
    const rate = samples > 0 ? Math.round((conversions / samples) * 100) : 0;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white px-6 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">¡Reporte enviado!</h2>
        <p className="text-slate-500 mb-1">{selectedLocation?.name}</p>
        <p className="text-2xl font-bold text-slate-900 mb-1">
          {samples} muestras · {conversions} compras
        </p>
        <p className="text-slate-400 mb-8">{rate}% de conversión</p>
        <div className="w-full max-w-xs space-y-3">
          <Button onClick={handleReset} size="lg" className="w-full">
            Nuevo reporte
          </Button>
          <Button onClick={handleLogout} variant="outline" size="lg" className="w-full">
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  if (view === "location") {
    return (
      <div className="min-h-screen bg-white px-4 py-6">
        <PdvSelector
          locations={locations}
          title="Indica el cliente en el que estás"
          onSelect={handleSelectLocation}
        />
      </div>
    );
  }

  // view === "counters"
  const conversionRate = samples > 0 ? Math.round((conversions / samples) * 100) : 0;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <button onClick={handleReset} className="text-slate-400 text-lg">←</button>
          <div className="text-center">
            <p className="font-semibold text-slate-900 text-sm truncate max-w-[200px]">{selectedLocation?.name}</p>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="w-6" />
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs text-slate-500 leading-relaxed">
          Una <span className="font-semibold text-slate-700">compra confirmada</span> cuenta solo si la
          persona que probó el producto también lo compró. No cuenta si compró sin haber probado antes —
          pero si probó y no compró, igual se suma como muestra entregada.
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-12 py-8">
        <Counter
          label="Muestras Entregadas"
          sublabel="Total de degustaciones del día"
          emoji="🥞"
          value={samples}
          onChange={setSamples}
        />

        <div className="w-full border-t border-slate-100" />

        <Counter
          label="Compras Confirmadas"
          sublabel="Personas que probaron y compraron (no cantidad de paquetes vendidos)"
          emoji="🛍️"
          value={conversions}
          max={samples}
          onChange={setConversions}
        />

        {samples > 0 && (
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900">{conversionRate}%</p>
            <p className="text-sm text-slate-400">Tasa de conversión</p>
          </div>
        )}
      </div>

      <div className="px-4 pb-safe-bottom pb-6 pt-4 border-t border-slate-100">
        <Button
          className="w-full h-14 text-base"
          onClick={handleSubmit}
          disabled={submitting || samples === 0}
        >
          {submitting ? "Enviando…" : "Enviar Reporte del Día"}
        </Button>
        {samples === 0 && (
          <p className="text-xs text-slate-400 text-center mt-2">Ingresa al menos 1 muestra para enviar</p>
        )}
      </div>
    </div>
  );
}
