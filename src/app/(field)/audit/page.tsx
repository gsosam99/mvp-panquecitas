import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireFieldWorker } from "@/lib/session";
import { sectorGroup, isExcludedDistribuidor } from "@/lib/universe";
import { LOCATION_COLUMNS } from "@/lib/location-columns";
import { AuditWizard } from "@/components/field/AuditWizard";
import type { Location } from "@/types";

export const metadata: Metadata = { title: "Auditoría — Panquecitas" };

export default async function AuditPage() {
  const worker = await requireFieldWorker("MERCADERISTA");
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("locations")
    .select(LOCATION_COLUMNS)
    .order("centro_poblado")
    .order("name");

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
