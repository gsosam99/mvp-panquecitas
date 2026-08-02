import type { Metadata } from "next";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { FieldWorkersClient } from "@/components/admin/FieldWorkersClient";
import type { FieldWorkerRecord } from "@/types";

export const metadata: Metadata = { title: "Personal de Campo — Panquecitas" };

// Usa el cliente service-role (no el de cookies/anon) porque field_workers
// tiene RLS habilitado sin política de lectura para anon/authenticated (por
// diseño, ver supabase/migrations/003). Con el cliente anon esta página
// siempre devolvía 0 filas en la carga inicial, aunque sí hubiera datos
// (por eso solo "aparecían" después de crear a alguien: el POST desde
// FieldWorkersClient sí pasa por /api/field-workers, que usa service-role).
export default async function PersonalPage() {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("field_workers")
    .select("id, cedula, first_name, last_name, role, oficina_venta, active")
    .order("oficina_venta")
    .order("last_name");

  return <FieldWorkersClient initialWorkers={(data ?? []) as FieldWorkerRecord[]} />;
}
