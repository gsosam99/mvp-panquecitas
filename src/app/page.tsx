import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profile = data as { role: UserRole } | null;

  if (!profile) {
    redirect("/login");
  }

  if (profile.role === "ADMIN") redirect("/dashboard");
  if (profile.role === "MERCADERISTA") redirect("/audit");
  if (profile.role === "PROMOTORA") redirect("/promotions");

  redirect("/login");
}
