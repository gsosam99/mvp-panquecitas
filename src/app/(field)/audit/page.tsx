import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireFieldWorker } from "@/lib/session";
import { sectorGroup, isExcludedDistribuidor } from "@/lib/universe";
import { LOCATION_COLUMNS } from "@/lib/location-columns";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { AuditWizard } from "@/components/field/AuditWizard";
import type { Location } from "@/types";

export const metadata: Metadata = { title: "Auditoría — Panquecitas" };

export default async function AuditPage() {
  const worker = await requireFieldWorker("MERCADERISTA");
  const supabase = await createSupabaseServerClient();

  // Paginado: `locations` pasó las 1000 filas con la cartera ampliada y
  // PostgREST corta ahí sin avisar. Sin esto la lista del mercaderista se
  // quedaba en 1000 de 1112 y los PDV del final del orden aparecían como
  // inexistentes al buscarlos por código. Ver src/lib/supabase/fetch-all.ts.
  const data = await fetchAllRows<unknown>(() =>
    supabase.from("locations").select(LOCATION_COLUMNS).order("centro_poblado").order("name")
  );

  // Un mercaderista solo puede ver los PDV de su propia Oficina de Venta
  // (ver decisión #3 en docs/decisiones-implementacion.md). Las
  // distribuidoras intermediarias nunca se visitan aunque su oficina_venta
  // caiga en el sector del trabajador.
  const workerSector = sectorGroup(worker.oficinaVenta);
  const locations = ((data ?? []) as Location[]).filter(
    (l) => sectorGroup(l.oficina_venta) === workerSector && !isExcludedDistribuidor(l.sap_code)
  );

  return <AuditWizard locations={locations} />;
}
