"use client";

import { useMemo, useState } from "react";
import type { Location } from "@/types";

interface PdvSelectorProps {
  locations: Location[];
  title: string;
  onSelect: (loc: Location) => void;
}

export function PdvSelector({ locations, title, onSelect }: PdvSelectorProps) {
  const [query, setQuery] = useState("");
  const [centro, setCentro] = useState("");

  // Centros poblados disponibles, ordenados
  const centros = useMemo(() => {
    const set = new Set<string>();
    for (const l of locations) if (l.centro_poblado) set.add(l.centro_poblado);
    return Array.from(set).sort();
  }, [locations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations.filter((l) => {
      if (centro && l.centro_poblado !== centro) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.sap_code.toLowerCase().includes(q)
      );
    });
  }, [locations, query, centro]);

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900 mb-4">{title}</h2>

      <input
        type="search"
        placeholder="Buscar por nombre o código…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full mb-3 px-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      />

      <select
        value={centro}
        onChange={(e) => setCentro(e.target.value)}
        className="w-full mb-4 px-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        <option value="">Todos los centros poblados</option>
        {centros.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <div className="space-y-3">
        {filtered.map((loc) => (
          <button
            key={loc.id}
            onClick={() => onSelect(loc)}
            className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-panquecitas hover:bg-slate-50 transition-colors"
          >
            <p className="font-semibold text-slate-900">
              <span className="text-panquecitas">{loc.sap_code}</span> — {loc.name}
            </p>
            <p className="text-sm text-slate-400">
              {loc.centro_poblado}
              {loc.tipo_cliente ? ` · ${loc.tipo_cliente}` : ""}
            </p>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-slate-400 py-8">No se encontraron locales</p>
        )}
      </div>
    </div>
  );
}
