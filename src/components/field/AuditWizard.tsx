"use client";

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PdvSelector } from "@/components/field/PdvSelector";
import type { Location, PopMessageOption, PopMaterialOption } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step =
  | "location"
  | "pop"
  | "pop_message"
  | "pop_price_tag"
  | "pop_materials"
  | "presence"
  | "product_location"
  | "price"
  | "anaquel_count"
  | "deposit_access"
  | "deposito"
  | "summary";
type Currency = "USD" | "BS";
type ProductLocationOption = "HARINA_TRIGO" | "OTRA_CATEGORIA";

interface DepositoEntry {
  bultos: string;
  unidades: string;
}
interface WizardState {
  deposito: { v04: DepositoEntry; v08: DepositoEntry };
}

const EMPTY: WizardState = {
  deposito: {
    v04: { bultos: "", unidades: "" },
    v08: { bultos: "", unidades: "" },
  },
};

const STEP_LABELS: Record<Step, string> = {
  location: "Local",
  pop: "Material POP",
  pop_message: "Mensaje central",
  pop_price_tag: "Preciador",
  pop_materials: "Materiales visibles",
  presence: "Presencia de producto",
  product_location: "Ubicación del producto",
  price: "Precio de venta",
  anaquel_count: "Contar en anaquel",
  deposit_access: "Depósito",
  deposito: "Depósito",
  summary: "Resumen",
};

// Tarjetas de referencia con texto descriptivo en lugar de las fotos del
// documento original (no se pudieron extraer como archivos de imagen — ver
// decisión #14 en docs/decisiones-implementacion.md). Reemplazar `emoji`
// por una <img> real cuando se agreguen las fotos a /public.
const MATERIAL_REFERENCE: Record<Exclude<PopMaterialOption, "OTRO">, { label: string; emoji: string; desc: string }> = {
  DANGLER: {
    label: "Dangler",
    emoji: "🏷️",
    desc: "Colgante circular en el anaquel: \"2 Panquecitas = 15gr de proteína\"",
  },
  TENT_CARD: {
    label: "Tent Card",
    emoji: "⛺",
    desc: "Cartel triangular de mesa/anaquel: \"Alimentan tus ideas\"",
  },
  PRECIADOR: {
    label: "Preciador",
    emoji: "💲",
    desc: "Etiqueta con display de precio junto al producto: \"¡Al mejor precio!\"",
  },
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

  // Material POP
  const [popPresent, setPopPresent] = useState<boolean | null>(null);
  const [popMessage, setPopMessage] = useState<PopMessageOption | null>(null);
  const [popPriceTag, setPopPriceTag] = useState<boolean | null>(null);
  const [popMaterials, setPopMaterials] = useState<PopMaterialOption[]>([]);
  const [popMaterialsOther, setPopMaterialsOther] = useState("");

  // Presencia / ubicación
  const [productPresent, setProductPresent] = useState<boolean | null>(null);
  const [productLocation, setProductLocation] = useState<ProductLocationOption[]>([]);
  const [productLocationOther, setProductLocationOther] = useState("");

  // Precio de venta (400g/800g)
  const [price400, setPrice400] = useState("");
  const [price400Na, setPrice400Na] = useState(false);
  const [price800, setPrice800] = useState("");
  const [price800Na, setPrice800Na] = useState(false);

  // Contar en anaquel
  const [totalUnitsAnaquel, setTotalUnitsAnaquel] = useState("");
  const [anaquel400, setAnaquel400] = useState("");
  const [anaquel800, setAnaquel800] = useState("");
  const [frontFaces, setFrontFaces] = useState("");

  const [depositAccess, setDepositAccess] = useState<boolean | null>(null);

  // Currency (aplica al módulo de precio)
  const [currency, setCurrency] = useState<Currency>("USD");
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [bcvLoading, setBcvLoading] = useState(false);
  const [bcvError, setBcvError] = useState(false);
  const [manualRate, setManualRate] = useState("");

  // Pasos efectivos: si no hay POP se saltan mensaje/preciador/materiales;
  // si no hay presencia de producto se saltan ubicación/precio/anaquel; el
  // depósito se omite si no hay acceso.
  const steps = useMemo<Step[]>(() => {
    const s: Step[] = ["location", "pop"];
    if (popPresent === true) s.push("pop_message", "pop_price_tag", "pop_materials");
    s.push("presence");
    if (productPresent === true) s.push("product_location", "price", "anaquel_count");
    s.push("deposit_access");
    if (depositAccess === true) s.push("deposito");
    s.push("summary");
    return s;
  }, [popPresent, productPresent, depositAccess]);

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

  const priceValid = useMemo(() => {
    const rateOk = currency === "USD" || !!effectiveRate();
    if (!rateOk) return false;
    const p04ok = price400Na || Number(price400) > 0;
    const p08ok = price800Na || Number(price800) > 0;
    if (!p04ok || !p08ok) return false;
    if (!price400Na && !price800Na) {
      const p04usd = toUsd(price400);
      const p08usd = toUsd(price800);
      if (p04usd > p08usd) return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price400, price400Na, price800, price800Na, currency, bcvRate, manualRate]);

  const priceOrderError =
    !price400Na && !price800Na && Number(price400) > 0 && Number(price800) > 0 && toUsd(price400) > toUsd(price800);

  // El desglose 400g/800g debe sumar exactamente el total ingresado — ver
  // decisión #1 de la ronda de "Arreglos app Panquecitas": se mantiene la
  // pregunta del total (documento anterior) y se agrega el desglose por
  // presentación que necesita el motor de Sell-Out / Mix de Producto.
  const anaquelSplitValid = useMemo(() => {
    if (totalUnitsAnaquel === "" || anaquel400 === "" || anaquel800 === "") return false;
    return Number(anaquel400) + Number(anaquel800) === Number(totalUnitsAnaquel);
  }, [totalUnitsAnaquel, anaquel400, anaquel800]);

  const anaquelSplitError =
    totalUnitsAnaquel !== "" &&
    anaquel400 !== "" &&
    anaquel800 !== "" &&
    Number(anaquel400) + Number(anaquel800) !== Number(totalUnitsAnaquel);

  const anaquelCountValid = useMemo(() => {
    if (totalUnitsAnaquel === "" || frontFaces === "") return false;
    if (!anaquelSplitValid) return false;
    const total = Number(totalUnitsAnaquel);
    const faces = Number(frontFaces);
    if (total < faces) return false;
    return true;
  }, [totalUnitsAnaquel, frontFaces, anaquelSplitValid]);

  const anaquelCountOrderError =
    totalUnitsAnaquel !== "" && frontFaces !== "" && Number(totalUnitsAnaquel) < Number(frontFaces);

  const depositoValid = useMemo(() => {
    const { v04, v08 } = state.deposito;
    return v04.bultos !== "" || v04.unidades !== "" || v08.bultos !== "" || v08.unidades !== "";
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
    setPopMessage(null);
    setPopPriceTag(null);
    setPopMaterials([]);
    setPopMaterialsOther("");
    setProductPresent(null);
    setProductLocation([]);
    setProductLocationOther("");
    setPrice400("");
    setPrice400Na(false);
    setPrice800("");
    setPrice800Na(false);
    setTotalUnitsAnaquel("");
    setAnaquel400("");
    setAnaquel800("");
    setFrontFaces("");
    setDepositAccess(null);
    setDone(false);
  }

  function toggleProductLocation(opt: ProductLocationOption) {
    setProductLocation((cur) => (cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt]));
  }

  function togglePopMaterial(opt: PopMaterialOption) {
    setPopMaterials((cur) => (cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt]));
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function handleSubmit() {
    if (!location || popPresent === null || productPresent === null || depositAccess === null) return;
    setSubmitting(true);

    try {
      const { v04: b04, v08: b08 } = state.deposito;

      const usd04 = price400Na ? null : toUsd(price400);
      const usd08 = price800Na ? null : toUsd(price800);

      const deposito: { variant_id: string; quantity: number; unit_price?: number }[] = [];
      if (depositAccess) {
        const { VARIANT_IDS } = await import("@/data/catalog");
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
          pop_message: popPresent ? popMessage : null,
          pop_price_tag: popPresent ? popPriceTag : null,
          pop_materials: popPresent ? popMaterials : null,
          pop_materials_other: popPresent && popMaterials.includes("OTRO") ? popMaterialsOther.trim() || undefined : undefined,
          product_present: productPresent,
          product_location: productPresent ? productLocation : [],
          product_location_other: productPresent ? productLocationOther.trim() || undefined : undefined,
          price_400: productPresent && !price400Na ? usd04 : null,
          price_400_na: productPresent ? price400Na : false,
          price_800: productPresent && !price800Na ? usd08 : null,
          price_800_na: productPresent ? price800Na : false,
          total_units_anaquel: productPresent ? Number(totalUnitsAnaquel) || 0 : null,
          anaquel_400_units: productPresent ? Number(anaquel400) || 0 : null,
          anaquel_800_units: productPresent ? Number(anaquel800) || 0 : null,
          front_faces: productPresent ? Number(frontFaces) || 0 : null,
          harina_trigo_faces: null, // pregunta retirada del formulario (ya no se recolecta)
          deposit_access: depositAccess,
          deposito,
        }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar la auditoría");
        return;
      }

      toast.success("Visita registrada correctamente");
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
        <h2 className="text-xl font-bold text-slate-900 mb-1">¡Visita completa!</h2>
        <p className="text-slate-500 mb-8">{location?.sap_code}</p>
        <div className="w-full max-w-xs space-y-3">
          <Button onClick={handleReset} size="lg" className="w-full">
            Iniciar nueva visita
          </Button>
          <Button onClick={handleLogout} variant="outline" size="lg" className="w-full">
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
            <button onClick={goBack} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
              ←
            </button>
          )}
          <div className="flex-1">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
              Paso {stepIndex + 1} de {steps.length} · {STEP_LABELS[step]}
            </p>
            {location && (
              <p className="text-sm text-slate-600 truncate">{location.sap_code}</p>
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
                  onClick={() => {
                    setPopPresent(val);
                    if (!val) {
                      setPopMessage(null);
                      setPopPriceTag(null);
                      setPopMaterials([]);
                      setPopMaterialsOther("");
                    }
                  }}
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
            <Button className="w-full mt-8 h-14 text-base" disabled={popPresent === null} onClick={advance}>
              Continuar →
            </Button>
          </div>
        )}

        {/* ── MENSAJE CENTRAL DEL POP ─────────────────────────────────────── */}
        {step === "pop_message" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Mensaje central</h2>
            <p className="text-slate-400 text-sm mb-6">¿Cuál es el mensaje central del material POP?</p>
            <div className="space-y-3">
              {(
                [
                  { key: "SIEMPRE_GANAS", label: "Siempre ganas" },
                  { key: "ALIMENTA_IDEAS", label: "Alimenta tus ideas" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPopMessage(opt.key as PopMessageOption)}
                  className={`w-full text-left p-4 rounded-2xl border-2 font-semibold transition-all ${
                    popMessage === opt.key
                      ? "border-panquecitas bg-panquecitas/5 text-panquecitas"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button className="w-full mt-8 h-14 text-base" disabled={popMessage === null} onClick={advance}>
              Continuar →
            </Button>
          </div>
        )}

        {/* ── PRECIADOR CON PRECIO MARCADO ─────────────────────────────────── */}
        {step === "pop_price_tag" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Preciador</h2>
            <p className="text-slate-400 text-sm mb-6">
              ¿El material POP tiene preciador con el precio marcado?
            </p>
            <div className="grid grid-cols-2 gap-4">
              {([true, false] as const).map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setPopPriceTag(val)}
                  className={`h-28 rounded-2xl border-2 text-2xl font-bold transition-all ${
                    popPriceTag === val
                      ? "border-panquecitas bg-panquecitas text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {val ? "SÍ" : "NO"}
                </button>
              ))}
            </div>
            <Button className="w-full mt-8 h-14 text-base" disabled={popPriceTag === null} onClick={advance}>
              Continuar →
            </Button>
          </div>
        )}

        {/* ── MATERIALES VISIBLES ──────────────────────────────────────────── */}
        {step === "pop_materials" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Materiales visibles</h2>
            <p className="text-slate-400 text-sm mb-6">
              Del material que tienes a la vista, selecciona si aparece al menos uno de estos:
            </p>
            <div className="space-y-3">
              {(Object.keys(MATERIAL_REFERENCE) as (keyof typeof MATERIAL_REFERENCE)[]).map((key) => {
                const ref = MATERIAL_REFERENCE[key];
                const active = popMaterials.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => togglePopMaterial(key)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-start gap-3 ${
                      active
                        ? "border-panquecitas bg-panquecitas/5"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="text-2xl shrink-0">{ref.emoji}</span>
                    <span>
                      <span className={`block font-semibold ${active ? "text-panquecitas" : "text-slate-900"}`}>
                        {ref.label}
                      </span>
                      <span className="block text-xs text-slate-400 mt-0.5">{ref.desc}</span>
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => togglePopMaterial("OTRO")}
                className={`w-full text-left p-4 rounded-2xl border-2 font-semibold transition-all ${
                  popMaterials.includes("OTRO")
                    ? "border-panquecitas bg-panquecitas/5 text-panquecitas"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                Ninguno de estos — especificar cuál
              </button>
              {popMaterials.includes("OTRO") && (
                <input
                  type="text"
                  value={popMaterialsOther}
                  onChange={(e) => setPopMaterialsOther(e.target.value)}
                  placeholder="¿Qué material está presente?"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              )}
            </div>
            <Button className="w-full mt-8 h-14 text-base" disabled={popMaterials.length === 0} onClick={advance}>
              Continuar →
            </Button>
          </div>
        )}

        {/* ── PRESENCIA DE PRODUCTO (pregunta filtro) ─────────────────────── */}
        {step === "presence" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Presencia de producto</h2>
            <p className="text-slate-400 text-sm mb-6">¿Hay presencia del producto en el local?</p>
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
                      setPrice400("");
                      setPrice400Na(false);
                      setPrice800("");
                      setPrice800Na(false);
                      setTotalUnitsAnaquel("");
                      setAnaquel400("");
                      setAnaquel800("");
                      setFrontFaces("");
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
            <Button className="w-full mt-8 h-14 text-base" disabled={productPresent === null} onClick={advance}>
              Continuar →
            </Button>
          </div>
        )}

        {/* ── UBICACIÓN DEL PRODUCTO ───────────────────────────────────────── */}
        {step === "product_location" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Ubicación del producto</h2>
            <p className="text-slate-400 text-sm mb-6">
              ¿En dónde podemos encontrar el producto? (selecciona todas las que apliquen)
            </p>
            <div className="space-y-3">
              {(
                [
                  { key: "HARINA_TRIGO", label: "Junto a la harina de trigo" },
                  { key: "OTRA_CATEGORIA", label: "Junto a otra categoría complementaria" },
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

        {/* ── PRECIO DE VENTA ───────────────────────────────────────────────── */}
        {step === "price" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Precio de venta</h2>
            <p className="text-slate-400 text-sm mb-5">¿A qué precio está cada una de las presentaciones de Panquecitas?</p>

            {/* Currency toggle */}
            <div className="mb-5 bg-slate-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Moneda del precio</p>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
                {(["USD", "BS"] as Currency[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`flex-1 py-2.5 transition-colors ${
                      currency === c ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {c === "USD" ? "Dólares (USD)" : "Bolívares (Bs.)"}
                  </button>
                ))}
              </div>

              {currency === "BS" && (
                <div className="mt-3">
                  {bcvLoading && <p className="text-xs text-slate-400 animate-pulse">Obteniendo tasa BCV…</p>}
                  {!bcvLoading && bcvRate && (
                    <p className="text-xs text-emerald-600 font-medium">✓ Tasa BCV: Bs. {bcvRate.toFixed(2)} / $1 USD</p>
                  )}
                  {!bcvLoading && bcvError && (
                    <div>
                      <p className="text-xs text-rose-500 mb-2">No se pudo obtener la tasa BCV. Ingrésala manualmente:</p>
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

            {/* Presentation price cards */}
            {(
              [
                { key: "400", label: "400g", value: price400, na: price400Na, setVal: setPrice400, setNa: setPrice400Na },
                { key: "800", label: "800g", value: price800, na: price800Na, setVal: setPrice800, setNa: setPrice800Na },
              ] as const
            ).map((p) => {
              const preview = conversionPreview(p.value);
              return (
                <div key={p.key} className="mb-4 border-2 border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🥞</span>
                      <p className="font-bold text-slate-900">Panquecitas {p.label}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        p.setNa(!p.na);
                        if (!p.na) p.setVal("");
                      }}
                      className={`text-xs font-medium border rounded-lg px-2.5 py-1.5 transition-colors ${
                        p.na
                          ? "bg-slate-900 text-white border-slate-900"
                          : "text-slate-500 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      No disponible en anaquel
                    </button>
                  </div>
                  {p.na ? (
                    <p className="text-2xl font-bold text-slate-300 text-center py-3">-</p>
                  ) : (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">
                        Precio {currency === "USD" ? "(USD)" : "(Bs.)"}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        value={p.value}
                        onChange={(e) => p.setVal(normalizeDecimal(e.target.value))}
                        placeholder="0.00"
                        className="w-full text-2xl font-bold text-center py-3 border-2 border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-panquecitas/30 focus:border-panquecitas"
                      />
                      {preview && <p className="text-xs text-slate-400 text-center mt-1">{preview}</p>}
                    </div>
                  )}
                </div>
              );
            })}

            {priceOrderError && (
              <p className="text-xs text-rose-600 mb-2">
                ⚠️ El precio de 400g no puede ser mayor al de 800g. Revisa los datos ingresados.
              </p>
            )}

            <Button className="w-full mt-2 h-14 text-base" disabled={!priceValid} onClick={advance}>
              Continuar →
            </Button>
          </div>
        )}

        {/* ── CONTAR EN ANAQUEL ─────────────────────────────────────────────── */}
        {step === "anaquel_count" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Contar en anaquel</h2>
            <p className="text-slate-400 text-sm mb-6">
              Cuenta el total de unidades de Panquecitas en exhibición, contando todas las que estén en anaquel.
            </p>

            <div className="mb-8">
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide text-center">
                Total de unidades en anaquel
              </p>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setTotalUnitsAnaquel((f) => String(Math.max(0, (Number(f) || 0) - 1)))}
                  className="w-16 h-16 rounded-full border-2 border-slate-300 text-3xl font-bold text-slate-600 flex items-center justify-center hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-40"
                  disabled={(Number(totalUnitsAnaquel) || 0) === 0}
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={totalUnitsAnaquel}
                  placeholder="0"
                  onChange={(e) => setTotalUnitsAnaquel(e.target.value.replace(/\D/g, ""))}
                  className="w-24 h-16 text-4xl font-bold text-slate-900 text-center bg-transparent border-b-2 border-slate-300 focus:border-panquecitas focus:outline-none tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setTotalUnitsAnaquel((f) => String((Number(f) || 0) + 1))}
                  className="w-16 h-16 rounded-full bg-panquecitas text-white text-3xl font-bold flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
                >
                  +
                </button>
              </div>
            </div>

            <div className="mb-8">
              <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide text-center">
                De esas, ¿cuántas son de cada presentación?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { key: "400", label: "400g", value: anaquel400, setVal: setAnaquel400 },
                    { key: "800", label: "800g", value: anaquel800, setVal: setAnaquel800 },
                  ] as const
                ).map((p) => (
                  <div key={p.key} className="border-2 border-slate-200 rounded-2xl p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-2 text-center">Panquecitas {p.label}</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={p.value}
                      placeholder="0"
                      onChange={(e) => p.setVal(e.target.value.replace(/\D/g, ""))}
                      className="w-full text-2xl font-bold text-center py-2 border-2 border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-panquecitas/30 focus:border-panquecitas"
                    />
                  </div>
                ))}
              </div>
              {anaquelSplitError && (
                <p className="text-xs text-rose-600 mt-2 text-center">
                  ⚠️ 400g ({anaquel400 || 0}) + 800g ({anaquel800 || 0}) = {Number(anaquel400 || 0) + Number(anaquel800 || 0)}.
                  Debe sumar el total de {totalUnitsAnaquel || 0}.
                </p>
              )}
            </div>

            <div className="mb-2">
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide text-center">
                Caras frontales
              </p>
              <div className="flex items-center justify-center gap-4 mb-3">
                <button
                  type="button"
                  onClick={() => setFrontFaces((f) => String(Math.max(0, (Number(f) || 0) - 1)))}
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
              <div className="flex gap-3 text-xs text-slate-400 justify-center">
                <span>📦📦📦 = 3 caras frontales</span>
                <span>·</span>
                <span>📦📦📦 / 📦📦📦 = 6 caras frontales</span>
              </div>
            </div>

            {anaquelCountOrderError && (
              <p className="text-xs text-rose-600 mt-3 text-center">
                ⚠️ El total de unidades en el anaquel no puede ser menor que las caras frontales.
              </p>
            )}

            <Button className="w-full mt-8 h-14 text-base" disabled={!anaquelCountValid} onClick={advance}>
              Continuar →
            </Button>
          </div>
        )}

        {/* ── ACCESO A DEPÓSITO ─────────────────────────────────────────── */}
        {step === "deposit_access" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Depósito</h2>
            <p className="text-slate-400 text-sm mb-6">¿El local te da acceso al depósito para tomar datos?</p>
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
                <div key={key} className="mb-4 border-2 border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🥞</span>
                    <p className="font-bold text-slate-900">Panquecitas {label}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Bultos</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={entry.bultos}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            deposito: { ...s.deposito, [key]: { ...s.deposito[key], bultos: e.target.value } },
                          }))
                        }
                        placeholder="0"
                        className="w-full text-2xl font-bold text-center py-3 border-2 border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-panquecitas/30 focus:border-panquecitas"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Unidades sueltas</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={entry.unidades}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            deposito: { ...s.deposito, [key]: { ...s.deposito[key], unidades: e.target.value } },
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

            <Button className="w-full mt-2 h-14 text-base" disabled={!depositoValid} onClick={() => setStep("summary")}>
              Continuar →
            </Button>
          </div>
        )}

        {/* ── SUMMARY ───────────────────────────────────────────────────── */}
        {step === "summary" && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-6">Resumen de la visita</h2>

            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 text-sm">Local</span>
              <span className="font-semibold text-slate-900 text-right">{location?.sap_code}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 text-sm">Material POP</span>
              <span className="font-semibold text-slate-900">{popPresent ? "Sí" : "No"}</span>
            </div>

            {popPresent && (
              <>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">Mensaje central</span>
                  <span className="font-semibold text-slate-900">
                    {popMessage === "SIEMPRE_GANAS" ? "Siempre ganas" : "Alimenta tus ideas"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">Preciador con precio marcado</span>
                  <span className="font-semibold text-slate-900">{popPriceTag ? "Sí" : "No"}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">Materiales visibles</span>
                  <span className="font-semibold text-slate-900 text-right">
                    {popMaterials
                      .map((m) => (m === "OTRO" ? popMaterialsOther || "Otro" : MATERIAL_REFERENCE[m].label))
                      .join(" · ")}
                  </span>
                </div>
              </>
            )}

            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 text-sm">Presencia de producto</span>
              <span className="font-semibold text-slate-900">{productPresent ? "Sí" : "No"}</span>
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
                          : `Junto a otra categoría${productLocationOther ? ` (${productLocationOther})` : ""}`
                      )
                      .join(" · ")}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">Precio 400g</span>
                  <span className="font-semibold text-slate-900">
                    {price400Na ? "-" : `$${toUsd(price400).toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">Precio 800g</span>
                  <span className="font-semibold text-slate-900">
                    {price800Na ? "-" : `$${toUsd(price800).toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">Total unidades en anaquel</span>
                  <span className="font-semibold text-slate-900">
                    {totalUnitsAnaquel || 0} ({anaquel400 || 0} × 400g + {anaquel800 || 0} × 800g)
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                  <span className="text-slate-500 text-sm">Caras frontales</span>
                  <span className="font-semibold text-slate-900">{frontFaces || 0}</span>
                </div>
              </>
            )}

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-2">Depósito</p>
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
                  <div key={key} className="flex justify-between items-center py-3 border-b border-slate-100">
                    <span className="text-slate-500 text-sm">Panquecitas {label}</span>
                    <span className="font-semibold text-slate-900">{parts.join(" + ")}</span>
                  </div>
                );
              })
            )}

            <Button className="w-full mt-6 h-14 text-base" disabled={submitting} onClick={handleSubmit}>
              {submitting ? "Enviando…" : "Enviar datos"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
