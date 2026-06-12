"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  return (
    <div className="flex flex-col items-center">
      <span className="text-4xl mb-1">{emoji}</span>
      <p className="font-bold text-slate-900 text-center">{label}</p>
      <p className="text-xs text-slate-400 text-center mb-4">{sublabel}</p>
      <div className="flex items-center gap-6">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-16 h-16 rounded-full border-2 border-slate-300 text-3xl font-bold text-slate-600 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-40"
          disabled={value === 0}
        >
          −
        </button>
        <span className="text-5xl font-bold text-slate-900 w-16 text-center tabular-nums">
          {value}
        </span>
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [samples, setSamples] = useState(0);
  const [conversions, setConversions] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const filteredLocations = useMemo(
    () =>
      locations.filter((l) =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.region?.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [locations, searchQuery]
  );

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
    setSearchQuery("");
    setView("location");
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
        <Button onClick={handleReset} size="lg" className="w-full max-w-xs">
          Nuevo reporte
        </Button>
      </div>
    );
  }

  if (view === "location") {
    return (
      <div className="min-h-screen bg-white px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">Actividad Promocional</h1>
          <p className="text-slate-400 text-sm mt-1">Selecciona la localidad del día</p>
        </div>
        <input
          type="search"
          placeholder="Buscar localidad…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full mb-4 px-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <div className="space-y-3">
          {filteredLocations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => handleSelectLocation(loc)}
              className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-colors"
            >
              <p className="font-semibold text-slate-900">{loc.name}</p>
              <p className="text-sm text-slate-400">{loc.region}</p>
            </button>
          ))}
          {filteredLocations.length === 0 && (
            <p className="text-center text-slate-400 py-8">No se encontraron localidades</p>
          )}
        </div>
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
          sublabel="Clientes que compraron tras la muestra"
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
