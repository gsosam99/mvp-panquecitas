"use client";

// TODO(demo): eliminar este componente y su uso en AdminExecutionDashboard/
// (admin)/dashboard/page.tsx cuando haya datos reales de SAP cargados — ver
// nota en src/lib/admin-queries.ts (getExecutionSnapshot).

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function DemoModeToggle({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (demoMode) params.delete("demo");
    else params.set("demo", "1");
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-3 mb-6 px-4 py-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50">
      <div>
        <p className="text-sm font-semibold text-amber-900">
          Modo demo {demoMode ? "activado" : "desactivado"}
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          {demoMode
            ? "\"PDV comprador\" = cualquier PDV con visita de mercaderista registrada (sin requerir venta SAP)."
            : "\"PDV comprador\" = solo PDVs con venta SAP de Panquecitas registrada (definición real del spec)."}
        </p>
      </div>
      <button
        onClick={toggle}
        className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 transition-colors"
      >
        {demoMode ? "Desactivar" : "Activar"}
      </button>
    </div>
  );
}
