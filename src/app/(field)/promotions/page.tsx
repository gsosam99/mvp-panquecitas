import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PromotionTracker } from "@/components/field/PromotionTracker";
import type { Location } from "@/types";

export const metadata: Metadata = { title: "Actividad Promocional — Panquecitas" };

export default async function PromotionsPage() {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("locations")
    .select("id, name, type, sap_code, address, region, lat, lng")
    .order("region")
    .order("name");

  const locations = (data ?? []) as Location[];

  return <PromotionTracker locations={locations} />;
}
