import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireFieldWorker } from "@/lib/session";
import { sectorGroup } from "@/lib/universe";
import { AuditWizard } from "@/components/field/AuditWizard";
import type { Location } from "@/types";

export const metadata: Metadata = { title: "Auditoría — Panquecitas" };

export default async function AuditPage() {
  const worker = await requireFieldWorker("MERCADERISTA");
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("locations")
    .select(
      "id, name, type, sap_code, address, region, centro_poblado, municipio, tipo_cliente, oficina_venta, lat, lng"
    )
    .order("centro_poblado")
    .order("name");

  // Un mercaderista solo puede ver los PDV de su propia Oficina de Venta
  // (ver decisión #3 en docs/decisiones-implementacion.md).
  const workerSector = sectorGroup(worker.oficinaVenta);
  const locations = ((data ?? []) as Location[]).filter(
    (l) => sectorGroup(l.oficina_venta) === workerSector
  );

  return <AuditWizard locations={locations} />;
}
