import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuditWizard } from "@/components/field/AuditWizard";
import type { Location } from "@/types";

export const metadata: Metadata = { title: "Auditoría — Panquecitas" };

export default async function AuditPage() {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("locations")
    .select("id, name, type, sap_code, address, region, lat, lng")
    .order("region")
    .order("name");

  const locations = (data ?? []) as Location[];

  return <AuditWizard locations={locations} />;
}
