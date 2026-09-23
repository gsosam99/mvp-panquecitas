"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Filtro global de fechas del dashboard de DIENN (pedido del usuario,
// 23-09-2026): "Todas" o uno o más días hábiles desde el arranque del piloto.
// Solo decide qué días se seleccionan; qué gráficos lo respetan lo resuelve
// DiennDashboardClient (las series diarias).

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fechaCorta(dia: string): string {
  const d = new Date(dia + "T00:00:00Z");
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** Lunes de la semana del día, "YYYY-MM-DD". */
function lunesDe(dia: string): string {
  const d = new Date(dia + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function FiltroFechas({
  dias,
  seleccion,
  onChange,
}: {
  /** Días hábiles disponibles, "YYYY-MM-DD", en orden. */
  dias: readonly string[];
  /** null = todas las fechas. */
  seleccion: readonly string[] | null;
  onChange: (seleccion: string[] | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  const semanas = useMemo(() => {
    const porSemana = new Map<string, string[]>();
    for (const dia of dias) {
      const lunes = lunesDe(dia);
      const grupo = porSemana.get(lunes);
      if (grupo) grupo.push(dia);
      else porSemana.set(lunes, [dia]);
    }
    return [...porSemana.entries()];
  }, [dias]);

  const elegidos = useMemo(() => new Set(seleccion ?? dias), [seleccion, dias]);

  // Una selección vacía o completa vuelve a "Todas": el filtro nunca deja el
  // dashboard sin días.
  const aplicar = (nuevos: Set<string>) => {
    if (nuevos.size === 0 || nuevos.size === dias.length) onChange(null);
    else onChange(dias.filter((d) => nuevos.has(d)));
  };

  const alternarDia = (dia: string) => {
    // Con "Todas" activo, el primer clic elige solo ese día.
    if (seleccion === null) return onChange([dia]);
    const nuevos = new Set(elegidos);
    if (nuevos.has(dia)) nuevos.delete(dia);
    else nuevos.add(dia);
    aplicar(nuevos);
  };

  const alternarSemana = (diasSemana: string[]) => {
    const completa = seleccion !== null && diasSemana.every((d) => elegidos.has(d));
    const nuevos = seleccion === null ? new Set<string>() : new Set(elegidos);
    for (const d of diasSemana) {
      if (completa) nuevos.delete(d);
      else nuevos.add(d);
    }
    aplicar(nuevos);
  };

  const texto =
    seleccion === null
      ? `Todas las fechas (${dias.length} días)`
      : seleccion.length === 1
      ? fechaCorta(seleccion[0])
      : `${seleccion.length} de ${dias.length} días`;

  if (dias.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
          seleccion === null
            ? "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            : "bg-indigo-700 text-white border-indigo-700"
        }`}
      >
        📅 {texto}
      </button>
      {abierto && (
        <div className="absolute left-0 z-30 mt-2 w-[min(92vw,26rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Aplica a las series diarias: ratios y efectividad por día, volumen diario y sus acumulados.
            </p>
            <button
              onClick={() => onChange(null)}
              className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
                seleccion === null
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Todas
            </button>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {semanas.map(([lunes, diasSemana]) => {
              const completa = seleccion !== null && diasSemana.every((d) => elegidos.has(d));
              return (
                <div key={lunes}>
                  <button
                    onClick={() => alternarSemana(diasSemana)}
                    className={`mb-1 text-xs font-semibold ${completa ? "text-indigo-700" : "text-slate-500"} hover:underline`}
                    title="Elegir o quitar toda la semana"
                  >
                    Semana del {fechaCorta(lunes).slice(4)}
                  </button>
                  <div className="flex flex-wrap gap-1">
                    {diasSemana.map((dia) => {
                      const activo = seleccion !== null && elegidos.has(dia);
                      return (
                        <button
                          key={dia}
                          onClick={() => alternarDia(dia)}
                          className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                            activo
                              ? "border-indigo-700 bg-indigo-700 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {fechaCorta(dia)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
