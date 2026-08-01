import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FieldWorkersClient } from "@/components/admin/FieldWorkersClient";
import type { FieldWorkerRecord } from "@/types";

export const metadata: Metadata = { title: "Personal de Campo — Panquecitas" };

export default async function PersonalPage() {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("field_workers")
    .select("id, cedula, first_name, last_name, role, oficina_venta, active")
    .order("oficina_venta")
    .order("last_name");

  return <FieldWorkersClient initialWorkers={(data ?? []) as FieldWorkerRecord[]} />;
}
