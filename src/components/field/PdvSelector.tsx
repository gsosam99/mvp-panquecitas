"use client";

import { useMemo, useState } from "react";
import type { Location } from "@/types";

interface PdvSelectorProps {
  locations: Location[];
  title: string;
  onSelect: (loc: Location) => void;
}

// Nota: ya no hay filtro por centro poblado / sector aquí — la lista que
// llega por props ya viene acotada server-side a la Oficina de Venta del
// trabajador de campo (ver (field)/audit/page.tsx y (field)/promotions/page.tsx),
// así que dentro de una misma sesión de campo solo existe un sector posible.
export function PdvSelector({ locations, title, onSelect }: PdvSelectorProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter(
      (l) => l.name.toLowerCase().includes(q) || l.sap_code.toLowerCase().includes(q)
    );
  }, [locations, query]);

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900 mb-4">{title}</h2>

      <input
        type="search"
        placeholder="Buscar por código…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full mb-4 px-4 py-3 border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      />

      <div className="space-y-3">
        {filtered.map((loc) => (
          <button
            key={loc.id}
            onClick={() => onSelect(loc)}
            className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-panquecitas hover:bg-slate-50 transition-colors"
          >
            <p className="font-semibold text-panquecitas">{loc.sap_code}</p>
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
