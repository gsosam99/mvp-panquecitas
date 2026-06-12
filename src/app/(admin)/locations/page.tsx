import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LocationsClient } from "@/components/admin/LocationsClient";
import type { Location } from "@/types";

export const metadata: Metadata = { title: "Localidades — Panquecitas" };

export default async function LocationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("locations")
    .select("id, name, type, sap_code, address, region, lat, lng")
    .order("region").order("name");

  return <LocationsClient initialLocations={(data ?? []) as Location[]} />;
}
