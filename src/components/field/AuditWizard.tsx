"use client";

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { VARIANT_IDS } from "@/data/catalog";
import { PdvSelector } from "@/components/field/PdvSelector";
import type { Location } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step =
  | "location"
  | "pop"
  | "presence"
  | "product_location"
  | "faces"
  | "anaquel"
  | "deposit_access"
  | "deposito"
  | "summary";
type Currency = "USD" | "BS";
type ProductLocationOption = "HARINA_TRIGO" | "OTRA_CATEGORIA";

interface AnaquelEntry {
  quantity: string;
  price: string;
}
interface DepositoEntry {
  bultos: string;
  unidades: string;
}
interface WizardState {
  anaquel: { v04: AnaquelEntry; v08: AnaquelEntry };
  deposito: { v04: DepositoEntry; v08: DepositoEntry };
}

const EMPTY: WizardState = {
  anaquel: {
    v04: { quantity: "", price: "" },
    v08: { quantity: "", price: "" },
  },
  deposito: {
    v04: { bultos: "", unidades: "" },
    v08: { bultos: "", unidades: "" },
  },
};

const STEP_LABELS: Record<Step, string> = {
  location: "Local",
  pop: "Material POP",
  presence: "Presencia de producto",
  product_location: "Ubicación del producto",
  faces: "Caras frontales",
  anaquel: "Anaquel",
  deposit_access: "Depósito",
  deposito: "Depósito",
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

  // Nuevos pasos
  const [popPresent, setPopPresent] = useState<boolean | null>(null);
  const [productPresent, setProductPresent] = useState<boolean | null>(null);
  const [productLocation, setProductLocation] = useState<ProductLocationOption[]>([]);
  const [productLocationOther, setProductLocationOther] = useState("");
  const [frontFaces, setFrontFaces] = useState("");
  const [depositAccess, setDepositAccess] = useState<boolean | null>(null);

  // Currency
  const [currency, setCurrency] = useState<Currency>("USD");
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [bcvLoading, setBcvLoading] = useState(false);
  const [bcvError, setBcvError] = useState(false);
  const [manualRate, setManualRate] = useState("");

  // Pasos efectivos: si no hay presencia del producto se saltan
  // product_location/faces/anaquel; el depósito se omite si no hay acceso.
  const steps = useMemo<Step[]>(() => {
    const base: Step[] = ["location", "pop", "presence"];
    if (productPresent === true) base.push("product_location", "faces", "anaquel");
    base.push("deposit_access");
    if (depositAccess === true) base.push("deposito");
    base.push("summary");
    return base;
  }, [productPresent, depositAccess]);

  const stepIndex = steps.indexOf(step);
  const progress = ((stepIndex + 1) / steps.length) * 100;

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

  // Normalize decimal input: comma → period (iOS Spanish keyboard)
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

  const anaquelValid = useMemo(() => {
    const { v04, v08 } = state.anaquel;
    const v04ok = !v04.quantity || (Number(v04.quantity) > 0 && Number(v04.price) > 0);
    const v08ok = !v08.quantity || (Number(v08.quantity) > 0 && Number(v08.price) > 0);
    const anyFilled = Number(v04.quantity) > 0 || Number(v08.quantity) > 0;
    const rateOk = currency === "USD" || !!effectiveRate();
    return v04ok && v08ok && anyFilled && rateOk;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.anaquel, currency, bcvRate, manualRate]);

  const depositoValid = useMemo(() => {
    const { v04, v08 } = state.deposito;
    return (
      v04.bultos !== "" ||
      v04.unidades !== "" ||
      v08.bultos !== "" ||
      v08.unidades !== ""
    );
  }, [state.deposito]);

  function advance() {
    const next = steps[stepIndex + 1];
    if (next) setStep(next);
  }

  function goBack() {
    const prev = steps[stepIndex - 1];
    if (prev) setStep(prev);
  }

  function handleReset() {
    setState(EMPTY);
    setStep("location");
    setLocation(null);
    setPopPresent(null);
    setProductPresent(null);
    setProductLocation([]);
    setProductLocationOther("");
    setFrontFaces("");
    setDepositAccess(null);
    setDone(false);
  }

  function toggleProductLocation(opt: ProductLocationOption) {
    setProductLocation((cur) =>
      cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt]
    );
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function handleSubmit() {
    if (
      !location ||
      popPresent === null ||
      productPresent === null ||
      depositAccess === null
    )
      return;
    setSubmitting(true);

    try {
      const { v04: a04, v08: a08 } = state.anaquel;
      const { v04: b04, v08: b08 } = state.deposito;

      const anaquel: {
        variant_id: string;
        quantity: number;
        unit_price_observed: number;
      }[] = [];
      if (productPresent && Number(a04.quantity) > 0) {
        anaquel.push({
          variant_id: VARIANT_IDS.PANQ_04KG_UNIDAD,
          quantity: Number(a04.quantity),
          unit_price_observed: toUsd(a04.price),
        });
      }
      if (productPresent && Number(a08.quantity) > 0) {
        anaquel.push({
          variant_id: VARIANT_IDS.PANQ_08KG_UNIDAD,
          quantity: Number(a08.quantity),
          unit_price_observed: toUsd(a08.price),
        });
      }

      const usd04 = toUsd(a04.price);
      const usd08 = toUsd(a08.price);
      const deposito: {
        variant_id: string;
        quantity: number;
        unit_price?: number;
      }[] = [];
      if (depositAccess) {
        if (b04.bultos !== "")
          deposito.push({
            variant_id: VARIANT_IDS.PANQ_04KG_BULTO,
            quantity: Number(b04.bultos),
            unit_price: usd04 || undefined,
          });
        if (b04.unidades !== "")
          deposito.push({
            variant_id: VARIANT_IDS.PANQ_04KG_UNIDAD,
            quantity: Number(b04.unidades),
            unit_price: usd04 || undefined,
          });
        if (b08.bultos !== "")
          deposito.push({
            variant_id: VARIANT_IDS.PANQ_08KG_BULTO,
            quantity: Number(b08.bultos),
            unit_price: usd08 || undefined,
          });
        if (b08.unidades !== "")
          deposito.push({
            variant_id: VARIANT_IDS.PANQ_08KG_UNIDAD,
            quantity: Number(b08.unidades),
            unit_price: usd08 || undefined,
          });
      }

      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: location.id,
          pop_present: popPresent,
          product_present: productPresent,
          product_location: productPresent ? productLocation : [],
          product_location_other: productPresent
            ? productLocationOther.trim() || undefined
            : undefined,
          front_faces: productPresent ? Number(frontFaces) || 0 : null,
          deposit_access: depositAccess,
          anaquel,
          deposito,
        }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar la auditoría");
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
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6 text-center py-12">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">¡Auditoría completa!</h2>
        <p className="text-slate-500 mb-8">{location?.name}</p>
        <div className="w-full max-w-xs space-y-3">
          <Button onClick={handleReset} size="lg" className="w-full">
            Iniciar nueva auditoría
          </Button>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="lg"
            className="w-full"
          >
            Cerrar sesión
          </Button>
        </div>
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
              Paso {stepIndex + 1} de {steps.length} · {STEP_LABELS[step]}
            </p>
            {location && (
              <p className="text-sm text-slate-600 truncate">
                {location.sap_code} — {location.name}
              </p>
            )}
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* ── LOCATION (PDV) ────────────────────────────────────────────── */}
        {step === "location" && (
          <PdvSelector
            locations={locations}
            title="Indica el cliente en el que estás"
            onSelect={(loc) => {
              setLocation(loc);
              setStep("pop");
            }}
          />
        )}

        {/* ── MATERIAL POP ──────────────────────────────────────────────── */}
        {step === "pop" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Material POP</h2>
            <p className="text-slate-400 text-sm mb-6">
              ¿Hay presencia de Material POP visible en el establecimiento?
            </p>
            <div className="grid grid-cols-2 gap-4">
              {([true, false] as const).map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setPopPresent(val)}
                  className={`h-28 rounded-2xl border-2 text-2xl font-bold transition-all ${
                    popPresent === val
                      ? "border-panquecitas bg-panquecitas text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {val ? "SÍ" : "NO"}
                </button>
              ))}
            </div>
            <Button
              className="w-full mt-8 h-14 text-base"
              disabled={popPresent === null}
              onClick={advance}
            >
              Continuar →
            </Button>
          </div>
        )}

        {/* ── PRESENCIA DE PRODUCTO (pregunta filtro) ─────────────────────── */}
        {step === "presence" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Presencia de producto</h2>
            <p className="text-slate-400 text-sm mb-6">
              ¿Hay presencia del producto en el local?
            </p>
            <div className="grid grid-cols-2 gap-4">
              {([true, false] as const).map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => {
                    setProductPresent(val);
                    if (!val) {
                      setProductLocation([]);
                      setProductLocationOther("");
                      setFrontFaces("");
                      setState((s) => ({ ...s, anaquel: EMPTY.anaquel }));
                    }
                  }}
                  className={`h-28 rounded-2xl border-2 text-2xl font-bold transition-all ${
                    productPresent === val
                      ? "border-panquecitas bg-panquecitas text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {val ? "SÍ" : "NO"}
                </button>
              ))}
            </div>
            <Button
              className="w-full mt-8 h-14 text-base"
              disabled={productPresent === null}
              onClick={advance}
            >
              Continuar →
            </Button>
          </div>
        )}

        {/* ── UBICACIÓN DEL PRODUCTO ───────────────────────────────────────── */}
        {step === "product_location" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Ubicación del producto</h2>
            <p className="text-slate-400 text-sm mb-6">
              El producto lo podemos encontrar en: (selecciona todas las que apliquen)
            </p>
            <div className="space-y-3">
              {(
                [
                  { key: "HARINA_TRIGO", label: "Junto a la harina de trigo" },
                  { key: "OTRA_CATEGORIA", label: "Junto a otra categoría" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleProductLocation(opt.key)}
                  className={`w-full text-left p-4 rounded-2xl border-2 font-semibold transition-all ${
                    productLocation.includes(opt.key)
                      ? "border-panquecitas bg-panquecitas/5 text-panquecitas"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {productLocation.includes("OTRA_CATEGORIA") && (
                <input
                  type="text"
                  value={productLocationOther}
                  onChange={(e) => setProductLocationOther(e.target.value)}
                  placeholder="¿Cuál otra categoría?"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              )}
            </div>
            <Button
              className="w-full mt-8 h-14 text-base"
              disabled={productLocation.length === 0}
              onClick={advance}
            >
              Continuar →
            </Button>
          </div>
        )}

        {/* ── CARAS FRONTALES ───────────────────────────────────────────── */}
        {step === "faces" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Caras frontales</h2>
            <p className="text-slate-400 text-sm mb-8">
              ¿Cuántas caras frontales se observan en el anaquel?
            </p>
            <div className="flex items-center justify-center gap-4 mb-8">
              <button
                type="button"
                onClick={() =>
                  setFrontFaces((f) => String(Math.max(0, (Number(f) || 0) - 1)))
                }
                className="w-16 h-16 rounded-full border-2 border-slate-300 text-3xl font-bold text-slate-600 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-40"
                disabled={(Number(frontFaces) || 0) === 0}
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={frontFaces}
                placeholder="0"
                onChange={(e) => setFrontFaces(e.target.value.replace(/\D/g, ""))}
                className="w-24 h-16 text-4xl font-bold text-slate-900 text-center bg-transparent border-b-2 border-slate-300 focus:border-panquecitas focus:outline-none tabular-nums"
              />
              <button
                type="button"
                onClick={() => setFrontFaces((f) => String((Number(f) || 0) + 1))}
                className="w-16 h-16 rounded-full bg-panquecitas text-white text-3xl font-bold flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
              >
                +
              </button>
            </div>
            <Button
              className="w-full h-14 text-base"
              disabled={frontFaces === ""}
              onClick={advance}
            >
              Continuar →
            </Button>
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
                    <p className="text-xs text-slate-400 animate-pulse">
                      Obteniendo tasa BCV…
                    </p>
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
                              [key]: {
                                ...s.anaquel[key],
                                price: normalizeDecimal(e.target.value),
                              },
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
              onClick={advance}
            >
              Continuar →
            </Button>
          </div>
        )}

        {/* ── ACCESO A DEPÓSITO ─────────────────────────────────────────── */}
        {step === "deposit_access" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Depósito</h2>
            <p className="text-slate-400 text-sm mb-6">
              ¿El local te da acceso al depósito para tomar datos?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setDepositAccess(true);
                  setStep("deposito");
                }}
                className={`h-28 rounded-2xl border-2 text-2xl font-bold transition-all ${
                  depositAccess === true
                    ? "border-panquecitas bg-panquecitas text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                SÍ
              </button>
              <button
                type="button"
                onClick={() => {
                  setDepositAccess(false);
                  setStep("summary");
                }}
                className={`h-28 rounded-2xl border-2 text-2xl font-bold transition-all ${
                  depositAccess === false
                    ? "border-panquecitas bg-panquecitas text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                NO
              </button>
            </div>
          </div>
        )}

        {/* ── DEPÓSITO ──────────────────────────────────────────────────── */}
        {step === "deposito" && (
          <div>
            <div className="flex items-start justify-between mb-1 gap-3">
              <h2 className="text-xl font-bold text-slate-900">Depósito</h2>
              <button
                type="button"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    deposito: {
                      v04: { bultos: "0", unidades: "0" },
                      v08: { bultos: "0", unidades: "0" },
                    },
                  }))
                }
                className="shrink-0 text-xs font-medium text-slate-500 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                Sin stock de Panquecitas
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Puedes registrar bultos, unidades sueltas o ambos por variante.
            </p>

            {(["v04", "v08"] as const).map((key) => {
              const entry = state.deposito[key];
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
                            deposito: {
                              ...s.deposito,
                              [key]: { ...s.deposito[key], bultos: e.target.value },
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
                            deposito: {
                              ...s.deposito,
                              [key]: { ...s.deposito[key], unidades: e.target.value },
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
              disabled={!depositoValid}
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
              <span className="text-slate-500 text-sm">Local</span>
              <span className="font-semibold text-slate-900 text-right">
                {location?.sap_code} — {location?.name}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 text-sm">Material POP</span>
              <span className="font-semibold text-slate-900">
                {popPresent ? "Sí" : "No"}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 text-sm">Presencia de producto</span>
              <span className="font-semibold text-slate-900">
                {productPresent ? "Sí" : "No"}
              </span>
            </div>

            {productPresent && (
              <>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">Ubicación del producto</span>
                  <span className="font-semibold text-slate-900 text-right">
                    {productLocation
                      .map((o) =>
                        o === "HARINA_TRIGO"
                          ? "Junto a harina de trigo"
                          : `Junto a otra categoría${
                              productLocationOther ? ` (${productLocationOther})` : ""
                            }`
                      )
                      .join(" · ")}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">Caras frontales</span>
                  <span className="font-semibold text-slate-900">{frontFaces || 0}</span>
                </div>
              </>
            )}

            {productPresent && (
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-2">
                Anaquel
              </p>
            )}
            {productPresent && (["v04", "v08"] as const).map((key) => {
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
              Depósito
            </p>
            {depositAccess === false ? (
              <p className="text-sm text-slate-400 py-2">Sin acceso al depósito.</p>
            ) : (
              (["v04", "v08"] as const).map((key) => {
                const e = state.deposito[key];
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
                    <span className="text-slate-500 text-sm">Panquecitas {label}</span>
                    <span className="font-semibold text-slate-900">
                      {parts.join(" + ")}
                    </span>
                  </div>
                )
              })
            )}

            <Button
              className="w-full mt-6 h-14 text-base"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Enviando…" : "Enviar auditoría"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
