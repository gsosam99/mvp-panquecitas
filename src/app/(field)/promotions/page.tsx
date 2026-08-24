import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireFieldWorker } from "@/lib/session";
import { sectorGroup, isExcludedDistribuidor } from "@/lib/universe";
import { LOCATION_COLUMNS } from "@/lib/location-columns";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PromotionTracker } from "@/components/field/PromotionTracker";
import type { Location } from "@/types";

export const metadata: Metadata = { title: "Actividad Promocional — Panquecitas" };

export default async function PromotionsPage() {
  const worker = await requireFieldWorker("PROMOTORA");
  const supabase = await createSupabaseServerClient();

  // Paginado por el mismo motivo que en la auditoría de mercaderista: con más
  // de 1000 clientes en cartera, PostgREST corta la lista sin avisar y los PDV
  // del final del orden desaparecen. Ver src/lib/supabase/fetch-all.ts.
  const data = await fetchAllRows<unknown>(() =>
    supabase.from("locations").select(LOCATION_COLUMNS).order("centro_poblado").order("name")
  );

  // Una promotora solo puede ver los PDV de su propia Oficina de Venta
  // (ver decisión #3 en docs/decisiones-implementacion.md). Las
  // distribuidoras intermediarias nunca se visitan aunque su oficina_venta
  // caiga en el sector del trabajador.
  const workerSector = sectorGroup(worker.oficinaVenta);
  const locations = ((data ?? []) as Location[]).filter(
    (l) => sectorGroup(l.oficina_venta) === workerSector && !isExcludedDistribuidor(l.sap_code)
  );

  return <PromotionTracker locations={locations} />;
}
