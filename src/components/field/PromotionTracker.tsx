"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PdvSelector } from "@/components/field/PdvSelector";
import { TICKETS_PER_ROLL, type Location } from "@/types";

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
  const [recibidos, setRecibidos] = useState(0);
  const [intactos, setIntactos] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  // Los tickets entregados ya no se cuentan a mano: se deducen del rollo.
  // Todo lo que no sobró al final del día, se entregó.
  const entregados = TICKETS_PER_ROLL - intactos;
  const conversionRate = entregados > 0 ? Math.round((recibidos / entregados) * 100) : 0;

  const superaRollo = recibidos > TICKETS_PER_ROLL;
  const superaEntregados = recibidos > entregados;
  const canSubmit = !superaRollo && !superaEntregados;

  function handleSelectLocation(loc: Location) {
    setSelectedLocation(loc);
    setRecibidos(0);
    setIntactos(0);
    setView("counters");
  }

  function handleReset() {
    setSelectedLocation(null);
    setRecibidos(0);
    setIntactos(0);
    setView("location");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function handleSubmit() {
    if (!selectedLocation || !canSubmit) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // tickets_entregados no se envía: lo deriva el servidor a partir de
        // los sobrantes, para que haya una sola fuente de verdad.
        body: JSON.stringify({
          location_id: selectedLocation.id,
          report_date: today,
          tickets_recibidos: recibidos,
          tickets_intactos: intactos,
        }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };

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
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white px-6 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">¡Reporte enviado!</h2>
        <p className="text-slate-500 mb-1">{selectedLocation?.sap_code}</p>
        <p className="text-2xl font-bold text-slate-900 mb-1">
          {entregados} tickets entregados · {recibidos} recibidos
        </p>
        <p className="text-slate-400 mb-8">{conversionRate}% de conversión</p>
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
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <button onClick={handleReset} className="text-slate-400 text-lg">←</button>
          <div className="text-center">
            <p className="font-semibold text-slate-900 text-sm truncate max-w-[200px]">{selectedLocation?.sap_code}</p>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="w-6" />
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs text-slate-500 leading-relaxed">
          Cada muestra se entrega con un <span className="font-semibold text-slate-700">ticket</span>. Si la
          persona compra el producto, te trae el ticket de vuelta para canjear un regalo. Al final del día
          solo cuenta dos cosas: cuántos tickets te devolvieron y cuántos te quedaron sin entregar del rollo
          de {TICKETS_PER_ROLL}. Los entregados se calculan solos.
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-10 py-8">
        <Counter
          label="Tickets recibidos"
          sublabel="Regalos canjeados"
          emoji="🎁"
          value={recibidos}
          max={TICKETS_PER_ROLL}
          onChange={setRecibidos}
        />

        <div className="w-full border-t border-slate-100" />

        <Counter
          label="Tickets sobrantes al final del día"
          sublabel="Los que quedaron intactos en el rollo"
          emoji="📦"
          value={intactos}
          max={TICKETS_PER_ROLL}
          onChange={setIntactos}
        />

        <div className="w-full border-t border-slate-100" />

        <div className="flex w-full max-w-xs justify-around text-center">
          <div>
            <p className="text-3xl font-bold text-slate-900">{entregados}</p>
            <p className="text-sm text-slate-400">Tickets entregados</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900">{conversionRate}%</p>
            <p className="text-sm text-slate-400">Tasa de conversión</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-safe-bottom pb-6 pt-4 border-t border-slate-100">
        {superaRollo && (
          <p className="text-xs text-rose-600 text-center mb-2">
            ⚠️ Error de conversión: Los tickets recibidos por compra no pueden superar {TICKETS_PER_ROLL}.
          </p>
        )}
        {!superaRollo && superaEntregados && (
          <p className="text-xs text-rose-600 text-center mb-2">
            ⚠️ Error de conversión: recibiste {recibidos} tickets pero solo entregaste {entregados} (
            {TICKETS_PER_ROLL} − {intactos} sobrantes). Revisa los sobrantes.
          </p>
        )}
        <Button className="w-full h-14 text-base" onClick={handleSubmit} disabled={submitting || !canSubmit}>
          {submitting ? "Enviando…" : "Enviar Reporte del Día"}
        </Button>
      </div>
    </div>
  );
}
