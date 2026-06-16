"use client";

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { VARIANT_IDS } from "@/data/catalog";
import type { Location } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "location" | "anaquel" | "bodega" | "summary";
type Currency = "USD" | "BS";

interface AnaquelEntry {
  quantity: string;
  price: string;
}

interface BodegaEntry {
  bultos: string;
  unidades: string;
}

interface WizardState {
  anaquel: { v04: AnaquelEntry; v08: AnaquelEntry };
  bodega: { v04: BodegaEntry; v08: BodegaEntry };
}

const EMPTY: WizardState = {
  anaquel: {
    v04: { quantity: "", price: "" },
    v08: { quantity: "", price: "" },
  },
  bodega: {
    v04: { bultos: "", unidades: "" },
    v08: { bultos: "", unidades: "" },
  },
};

const STEPS: Step[] = ["location", "anaquel", "bodega", "summary"];
const STEP_LABELS: Record<Step, string> = {
  location: "Localidad",
  anaquel: "Anaquel",
  bodega: "Bodega",
  summary: "Resumen",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface AuditWizardProps {
  locations: Location[];
}

export function AuditWizard({ locations }: AuditWizardProps) {
  const [step, setStep] = useState<Step>("location");
  const [location, setLocation] = useState<Location | null>(null);
  const [state, setState] = useState<WizardState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Currency
  const [currency, setCurrency] = useState<Currency>("USD");
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [bcvLoading, setBcvLoading] = useState(false);
  const [bcvError, setBcvError] = useState(false);
  const [manualRate, setManualRate] = useState("");

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  // Fetch BCV rate when switching to BS
  useEffect(() => {
    if (currency === "BS" && bcvRate === null && !bcvLoading && !bcvError) {
      setBcvLoading(true);
      fetch("/api/bcv-rate")
        .then((r) => r.json())
        .then((data: { rate?: number | null }) => {
          if (data.rate) setBcvRate(data.rate);
          else setBcvError(true);
        })
        .catch(() => setBcvError(true))
        .finally(() => setBcvLoading(false));
    }
  }, [currency, bcvRate, bcvLoading, bcvError]);

  // Normalize decimal input: comma → period (iOS Spanish keyboard), strip non-numeric except one dot
  function normalizeDecimal(raw: string): string {
    const withPeriod = raw.replace(/,/g, ".");
    let hasDecimal = false;
    return withPeriod
      .split("")
      .filter((c) => {
        if (c === ".") {
          if (hasDecimal) return false;
          hasDecimal = true;
          return true;
        }
        return c >= "0" && c <= "9";
      })
      .join("");
  }

  function effectiveRate(): number | null {
    if (currency === "USD") return null;
    return bcvRate ?? (manualRate ? Number(normalizeDecimal(manualRate)) : null);
  }

  function toUsd(priceStr: string): number {
    const price = Number(normalizeDecimal(priceStr));
    if (!price) return 0;
    const rate = effectiveRate();
    return currency === "USD" || !rate ? price : price / rate;
  }

  function conversionPreview(priceStr: string): string | null {
    if (currency === "USD" || !priceStr) return null;
    const rate = effectiveRate();
    if (!rate) return null;
    const n = Number(normalizeDecimal(priceStr));
    if (!n) return null;
    return `≈ $${(n / rate).toFixed(2)} USD`;
  }

  const filteredLocations = useMemo(
    () =>
      locations.filter(
        (l) =>
          l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.region?.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [locations, searchQuery]
  );

  const anaquelValid = useMemo(() => {
    const { v04, v08 } = state.anaquel;
    const v04ok = !v04.quantity || (Number(v04.quantity) > 0 && Number(v04.price) > 0);
    const v08ok = !v08.quantity || (Number(v08.quantity) > 0 && Number(v08.price) > 0);
    const anyFilled = Number(v04.quantity) > 0 || Number(v08.quantity) > 0;
    const rateOk = currency === "USD" || !!effectiveRate();
    return v04ok && v08ok && anyFilled && rateOk;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.anaquel, currency, bcvRate, manualRate]);

  const bodegaValid = useMemo(() => {
    const { v04, v08 } = state.bodega;
    // Allow 0 — empty string means "not entered", "0" means "verified empty"
    return (
      v04.bultos !== "" ||
      v04.unidades !== "" ||
      v08.bultos !== "" ||
      v08.unidades !== ""
    );
  }, [state.bodega]);

  function goBack() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  }

  function handleReset() {
    setState(EMPTY);
    setStep("location");
    setLocation(null);
    setDone(false);
    setSearchQuery("");
  }

  async function submitOne(payload: object): Promise<string | null> {
    const res = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      return json.error ?? "Error al guardar";
    }
    return null;
  }

  async function handleSubmit() {
    if (!location) return;
    setSubmitting(true);

    try {
      const locId = location.id;
      const { v04: a04, v08: a08 } = state.anaquel;
      const { v04: b04, v08: b08 } = state.bodega;

      // 1. ANAQUEL
      const anaquelJobs: Promise<string | null>[] = [];
      if (Number(a04.quantity) > 0) {
        anaquelJobs.push(
          submitOne({
            location_id: locId,
            variant_id: VARIANT_IDS.PANQ_04KG_UNIDAD,
            zone: "ANAQUEL",
            quantity: Number(a04.quantity),
            unit_price_observed: toUsd(a04.price),
          })
        );
      }
      if (Number(a08.quantity) > 0) {
        anaquelJobs.push(
          submitOne({
            location_id: locId,
            variant_id: VARIANT_IDS.PANQ_08KG_UNIDAD,
            zone: "ANAQUEL",
            quantity: Number(a08.quantity),
            unit_price_observed: toUsd(a08.price),
          })
        );
      }

      const anaquelErrors = (await Promise.all(anaquelJobs)).filter(Boolean);
      if (anaquelErrors.length > 0) {
        toast.error(anaquelErrors[0] ?? "Error al guardar anaquel");
        return;
      }

      // 2. BODEGA
      const usdPrice04 = toUsd(a04.price);
      const usdPrice08 = toUsd(a08.price);
      const bodegaJobs: Promise<string | null>[] = [];

      if (b04.bultos !== "") {
        bodegaJobs.push(
          submitOne({
            location_id: locId,
            variant_id: VARIANT_IDS.PANQ_04KG_BULTO,
            zone: "BODEGA",
            quantity: Number(b04.bultos),
            unit_price: usdPrice04 || undefined,
          })
        );
      }
      if (b04.unidades !== "") {
        bodegaJobs.push(
          submitOne({
            location_id: locId,
            variant_id: VARIANT_IDS.PANQ_04KG_UNIDAD,
            zone: "BODEGA",
            quantity: Number(b04.unidades),
            unit_price: usdPrice04 || undefined,
          })
        );
      }
      if (b08.bultos !== "") {
        bodegaJobs.push(
          submitOne({
            location_id: locId,
            variant_id: VARIANT_IDS.PANQ_08KG_BULTO,
            zone: "BODEGA",
            quantity: Number(b08.bultos),
            unit_price: usdPrice08 || undefined,
          })
        );
      }
      if (b08.unidades !== "") {
        bodegaJobs.push(
          submitOne({
            location_id: locId,
            variant_id: VARIANT_IDS.PANQ_08KG_UNIDAD,
            zone: "BODEGA",
            quantity: Number(b08.unidades),
            unit_price: usdPrice08 || undefined,
          })
        );
      }

      const bodegaErrors = (await Promise.all(bodegaJobs)).filter(Boolean);
      if (bodegaErrors.length > 0) {
        toast.error(bodegaErrors[0] ?? "Error al guardar bodega");
        return;
      }

      toast.success("Auditoría registrada correctamente");
      setDone(true);
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Done ─────────────────────────────────────────────────────────────────
  if (done) {
    const { v04: a04, v08: a08 } = state.anaquel;
    const { v04: b04, v08: b08 } = state.bodega;
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6 text-center py-12">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">¡Auditoría completa!</h2>
        <p className="text-slate-500 mb-6">{location?.name}</p>
        <div className="w-full max-w-xs bg-slate-50 rounded-2xl p-4 text-left text-sm space-y-2 mb-8">
          <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide">Anaquel</p>
          {Number(a04.quantity) > 0 && (
            <p className="text-slate-600">
              400g — {a04.quantity} und · ${toUsd(a04.price).toFixed(2)}
            </p>
          )}
          {Number(a08.quantity) > 0 && (
            <p className="text-slate-600">
              800g — {a08.quantity} und · ${toUsd(a08.price).toFixed(2)}
            </p>
          )}
          <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide pt-2">Bodega</p>
          {b04.bultos !== "" && <p className="text-slate-600">400g — {b04.bultos} bultos</p>}
          {b04.unidades !== "" && <p className="text-slate-600">400g — {b04.unidades} und</p>}
          {b08.bultos !== "" && <p className="text-slate-600">800g — {b08.bultos} bultos</p>}
          {b08.unidades !== "" && <p className="text-slate-600">800g — {b08.unidades} und</p>}
        </div>
        <Button onClick={handleReset} size="lg" className="w-full max-w-xs">
          Nueva auditoría
        </Button>
      </div>
    );
  }

  // ─── Wizard ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          {stepIndex > 0 && (
            <button
              onClick={goBack}
              className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            >
              ←
            </button>
          )}
          <div className="flex-1">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
              Paso {stepIndex + 1} de {STEPS.length} · {STEP_LABELS[step]}
            </p>
            {location && (
              <p className="text-sm text-slate-600 truncate">{location.name}</p>
            )}
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">

        {/* ── LOCATION ──────────────────────────────────────────────────── */}
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
                  onClick={() => { setLocation(loc); setStep("anaquel"); }}
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

        {/* ── ANAQUEL ───────────────────────────────────────────────────── */}
        {step === "anaquel" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Anaquel</h2>
            <p className="text-slate-400 text-sm mb-5">
              Registra unidades visibles. Deja en blanco las variantes ausentes.
            </p>

            {/* Currency toggle */}
            <div className="mb-5 bg-slate-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                Moneda del precio
              </p>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
                {(["USD", "BS"] as Currency[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`flex-1 py-2.5 transition-colors ${
                      currency === c
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {c === "USD" ? "Dólares (USD)" : "Bolívares (Bs.)"}
                  </button>
                ))}
              </div>

              {currency === "BS" && (
                <div className="mt-3">
                  {bcvLoading && (
                    <p className="text-xs text-slate-400 animate-pulse">Obteniendo tasa BCV…</p>
                  )}
                  {!bcvLoading && bcvRate && (
                    <p className="text-xs text-emerald-600 font-medium">
                      ✓ Tasa BCV: Bs. {bcvRate.toFixed(2)} / $1 USD
                    </p>
                  )}
                  {!bcvLoading && bcvError && (
                    <div>
                      <p className="text-xs text-rose-500 mb-2">
                        No se pudo obtener la tasa BCV. Ingrésala manualmente:
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.,]?[0-9]*"
                          placeholder="ej. 36.75"
                          value={manualRate}
                          onChange={(e) => setManualRate(normalizeDecimal(e.target.value))}
                          className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                        <span className="text-xs text-slate-400 shrink-0">Bs. por $1</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Variant cards */}
            {(["v04", "v08"] as const).map((key) => {
              const entry = state.anaquel[key];
              const label = key === "v04" ? "400g" : "800g";
              const qtyFilled = Number(entry.quantity) > 0;
              const priceMissing = qtyFilled && !entry.price;
              const preview = conversionPreview(entry.price);

              return (
                <div
                  key={key}
                  className="mb-4 border-2 border-slate-200 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🥞</span>
                    <p className="font-bold text-slate-900">Panquecitas {label}</p>
                    <span className="text-xs text-slate-400 ml-auto">unidad suelta</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">
                        Unidades
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={entry.quantity}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            anaquel: {
                              ...s.anaquel,
                              [key]: { ...s.anaquel[key], quantity: e.target.value },
                            },
                          }))
                        }
                        placeholder="0"
                        className="w-full text-2xl font-bold text-center py-3 border-2 border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-panquecitas/30 focus:border-panquecitas"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">
                        Precio {currency === "USD" ? "(USD)" : "(Bs.)"}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        value={entry.price}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            anaquel: {
                              ...s.anaquel,
                              [key]: { ...s.anaquel[key], price: normalizeDecimal(e.target.value) },
                            },
                          }))
                        }
                        placeholder="0.00"
                        className="w-full text-2xl font-bold text-center py-3 border-2 border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-panquecitas/30 focus:border-panquecitas"
                      />
                      {preview && (
                        <p className="text-xs text-slate-400 text-center mt-1">{preview}</p>
                      )}
                    </div>
                  </div>
                  {priceMissing && (
                    <p className="text-xs text-rose-600">⚠️ Ingresa el precio para continuar</p>
                  )}
                </div>
              );
            })}

            <Button
              className="w-full mt-2 h-14 text-base"
              disabled={!anaquelValid}
              onClick={() => setStep("bodega")}
            >
              Continuar →
            </Button>
          </div>
        )}

        {/* ── BODEGA ────────────────────────────────────────────────────── */}
        {step === "bodega" && (
          <div>
            <div className="flex items-start justify-between mb-1 gap-3">
              <h2 className="text-xl font-bold text-slate-900">Bodega</h2>
              <button
                type="button"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    bodega: {
                      v04: { bultos: "0", unidades: "0" },
                      v08: { bultos: "0", unidades: "0" },
                    },
                  }))
                }
                className="shrink-0 text-xs font-medium text-slate-500 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                Sin stock en bodega
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Podés registrar bultos, unidades sueltas o ambos por variante.
            </p>

            {(["v04", "v08"] as const).map((key) => {
              const entry = state.bodega[key];
              const label = key === "v04" ? "400g" : "800g";

              return (
                <div
                  key={key}
                  className="mb-4 border-2 border-slate-200 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🥞</span>
                    <p className="font-bold text-slate-900">Panquecitas {label}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">
                        Bultos
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={entry.bultos}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            bodega: {
                              ...s.bodega,
                              [key]: { ...s.bodega[key], bultos: e.target.value },
                            },
                          }))
                        }
                        placeholder="0"
                        className="w-full text-2xl font-bold text-center py-3 border-2 border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-panquecitas/30 focus:border-panquecitas"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">
                        Unidades sueltas
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={entry.unidades}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            bodega: {
                              ...s.bodega,
                              [key]: { ...s.bodega[key], unidades: e.target.value },
                            },
                          }))
                        }
                        placeholder="0"
                        className="w-full text-2xl font-bold text-center py-3 border-2 border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-panquecitas/30 focus:border-panquecitas"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <Button
              className="w-full mt-2 h-14 text-base"
              disabled={!bodegaValid}
              onClick={() => setStep("summary")}
            >
              Continuar →
            </Button>
          </div>
        )}

        {/* ── SUMMARY ───────────────────────────────────────────────────── */}
        {step === "summary" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-6">
              Resumen de la auditoría
            </h2>

            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 text-sm">Localidad</span>
              <span className="font-semibold text-slate-900 text-right">
                {location?.name}
              </span>
            </div>

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-2">
              Anaquel
            </p>
            {(["v04", "v08"] as const).map((key) => {
              const e = state.anaquel[key];
              if (!Number(e.quantity)) return null;
              const usdPrice = toUsd(e.price);
              return (
                <div
                  key={key}
                  className="flex justify-between items-center py-3 border-b border-slate-100"
                >
                  <span className="text-slate-500 text-sm">
                    Panquecitas {key === "v04" ? "400g" : "800g"}
                  </span>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{e.quantity} und</p>
                    <p className="text-xs text-slate-400">
                      ${usdPrice.toFixed(2)}
                      {currency === "BS" && <> · Bs. {e.price}</>}
                    </p>
                  </div>
                </div>
              );
            })}

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-2">
              Bodega
            </p>
            {(["v04", "v08"] as const).map((key) => {
              const e = state.bodega[key];
              const label = key === "v04" ? "400g" : "800g";
              const parts: string[] = [];
              if (e.bultos !== "") parts.push(`${e.bultos} bultos`);
              if (e.unidades !== "") parts.push(`${e.unidades} und`);
              if (!parts.length) return null;
              return (
                <div
                  key={key}
                  className="flex justify-between items-center py-3 border-b border-slate-100"
                >
                  <span className="text-slate-500 text-sm">
                    Panquecitas {label}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {parts.join(" + ")}
                  </span>
                </div>
              );
            })}

            <Button
              className="w-full mt-8 h-14 text-base"
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
