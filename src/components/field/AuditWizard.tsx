"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PANQUECITAS_FIELD_VARIANTS } from "@/data/catalog";
import type { AuditZone, Location } from "@/types";

type Step = "location" | "zone" | "variant" | "data" | "summary";

interface WizardState {
  location: Location | null;
  zone: AuditZone | null;
  variantId: string | null;
  variantName: string | null;
  quantity: string;
  unitPrice: string;
}

const INITIAL_STATE: WizardState = {
  location: null,
  zone: null,
  variantId: null,
  variantName: null,
  quantity: "",
  unitPrice: "",
};

const STEP_LABELS: Record<Step, string> = {
  location: "Localidad",
  zone: "Zona",
  variant: "Producto",
  data: "Cantidad",
  summary: "Resumen",
};

const STEPS: Step[] = ["location", "zone", "variant", "data", "summary"];

interface AuditWizardProps {
  locations: Location[];
}

export function AuditWizard({ locations }: AuditWizardProps) {
  const [step, setStep] = useState<Step>("location");
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const filteredLocations = useMemo(
    () =>
      locations.filter((l) =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.region?.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [locations, searchQuery]
  );

  function goBack() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  }

  function handleReset() {
    setState(INITIAL_STATE);
    setStep("location");
    setDone(false);
    setSearchQuery("");
  }

  async function handleSubmit() {
    if (!state.location || !state.zone || !state.variantId) return;
    setSubmitting(true);

    try {
      const payload = {
        location_id: state.location.id,
        variant_id: state.variantId,
        zone: state.zone,
        quantity: Number(state.quantity),
        ...(state.zone === "ANAQUEL" && { unit_price_observed: Number(state.unitPrice) }),
      };

      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar");
        if (res.status === 422) {
          // Price error — go back to data step
          setStep("data");
        }
        return;
      }

      setDone(true);
      toast.success("Auditoría registrada correctamente");
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white px-6 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">¡Registrado!</h2>
        <p className="text-slate-500 mb-6">
          {state.zone} · {state.variantName} · {state.quantity} {state.zone === "ANAQUEL" ? "unidades" : "bultos"}
          {state.zone === "ANAQUEL" && state.unitPrice ? ` · Bs. ${state.unitPrice}` : ""}
        </p>
        <Button onClick={handleReset} size="lg" className="w-full max-w-xs">
          Nueva auditoría
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 pt-safe-top pt-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3 mb-3">
          {stepIndex > 0 && (
            <button onClick={goBack} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
              ←
            </button>
          )}
          <div className="flex-1">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
              Paso {stepIndex + 1} de {STEPS.length} · {STEP_LABELS[step]}
            </p>
            {state.location && (
              <p className="text-sm text-slate-600 truncate">{state.location.name}</p>
            )}
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">

        {/* STEP 1: Location */}
        {step === "location" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-4">¿En qué localidad estás?</h2>
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
                  onClick={() => { setState((s) => ({ ...s, location: loc })); setStep("zone"); }}
                  className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-colors"
                >
                  <p className="font-semibold text-slate-900">{loc.name}</p>
                  <p className="text-sm text-slate-400">{loc.region} · {loc.sap_code}</p>
                </button>
              ))}
              {filteredLocations.length === 0 && (
                <p className="text-center text-slate-400 py-8">No se encontraron localidades</p>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Zone */}
        {step === "zone" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">¿Dónde estás auditando?</h2>
            <p className="text-slate-400 mb-8">{state.location?.name}</p>
            <div className="grid grid-cols-2 gap-4">
              {(["ANAQUEL", "BODEGA"] as AuditZone[]).map((zone) => (
                <button
                  key={zone}
                  onClick={() => { setState((s) => ({ ...s, zone })); setStep("variant"); }}
                  className="flex flex-col items-center justify-center p-8 border-2 border-slate-200 rounded-2xl hover:border-slate-800 hover:bg-slate-50 transition-all active:scale-95"
                >
                  <span className="text-5xl mb-3">{zone === "ANAQUEL" ? "🛒" : "📦"}</span>
                  <span className="font-bold text-lg text-slate-900">{zone}</span>
                  <span className="text-xs text-slate-400 mt-1">
                    {zone === "ANAQUEL" ? "Estante de venta" : "Stock almacenado"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: Variant */}
        {step === "variant" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">¿Qué producto estás auditando?</h2>
            <p className="text-slate-400 mb-6">{state.zone} · {state.location?.name}</p>
            <div className="space-y-4">
              {PANQUECITAS_FIELD_VARIANTS.map((variant) => (
                <Card
                  key={variant.id}
                  className="p-0 overflow-hidden cursor-pointer border-2 hover:border-slate-800 transition-all active:scale-[0.98]"
                  onClick={() => {
                    setState((s) => ({ ...s, variantId: variant.id, variantName: variant.name + " " + variant.subtitle }));
                    setStep("data");
                  }}
                >
                  <div className="flex items-center gap-4 p-4">
                    <div className="w-16 h-16 bg-amber-50 rounded-xl flex items-center justify-center text-3xl shrink-0">
                      🥞
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{variant.name}</p>
                      <p className="text-sm text-slate-500">{variant.subtitle}</p>
                      <p className="text-xs text-slate-400">{variant.presentation_kg} kg por unidad</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: Data entry */}
        {step === "data" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">
              {state.zone === "ANAQUEL" ? "Cantidad y precio" : "Cantidad en bodega"}
            </h2>
            <p className="text-slate-400 mb-8">{state.variantName}</p>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  {state.zone === "ANAQUEL" ? "Unidades en anaquel" : "Bultos en bodega"}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={state.quantity}
                  onChange={(e) => setState((s) => ({ ...s, quantity: e.target.value }))}
                  placeholder="0"
                  className="w-full text-3xl font-bold text-center py-4 border-2 border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
              </div>

              {state.zone === "ANAQUEL" && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Precio de venta (Bs.)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={state.unitPrice}
                    onChange={(e) => setState((s) => ({ ...s, unitPrice: e.target.value }))}
                    placeholder="0.00"
                    className="w-full text-3xl font-bold text-center py-4 border-2 border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                  />
                </div>
              )}

              {state.zone === "BODEGA" && (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  ⚠️ Para calcular el valor de bodega se usará el precio de anaquel registrado hoy.
                  Si aún no has auditado el anaquel, hazlo primero.
                </p>
              )}
            </div>

            <Button
              className="w-full mt-8 h-14 text-base"
              disabled={
                !state.quantity ||
                Number(state.quantity) < 0 ||
                (state.zone === "ANAQUEL" && (!state.unitPrice || Number(state.unitPrice) <= 0))
              }
              onClick={() => setStep("summary")}
            >
              Continuar →
            </Button>
          </div>
        )}

        {/* STEP 5: Summary */}
        {step === "summary" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-6">Resumen de la auditoría</h2>
            <div className="space-y-3 mb-8">
              {[
                { label: "Localidad", value: state.location?.name },
                { label: "Zona", value: state.zone },
                { label: "Producto", value: state.variantName },
                { label: "Cantidad", value: `${state.quantity} ${state.zone === "ANAQUEL" ? "unidades" : "bultos"}` },
                ...(state.zone === "ANAQUEL" && state.unitPrice
                  ? [{ label: "Precio unitario", value: `Bs. ${state.unitPrice}` }]
                  : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">{label}</span>
                  <span className="font-semibold text-slate-900 text-right max-w-[60%]">{value}</span>
                </div>
              ))}
            </div>

            <Button
              className="w-full h-14 text-base"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Guardando…" : "Confirmar y enviar"}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
