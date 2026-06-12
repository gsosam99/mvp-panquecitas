import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

interface ProfileRow {
  id: string;
  role: UserRole;
  full_name: string;
}

export async function requireAuth(role?: UserRole) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  if (role) {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const profile = data as Pick<ProfileRow, "role"> | null;

    if (!profile || profile.role !== role) {
      redirect("/unauthorized");
    }
  }

  return user;
}

export async function requireAnyRole(roles: UserRole[]) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profile = data as Pick<ProfileRow, "role"> | null;

  if (!profile || !roles.includes(profile.role)) {
    redirect("/unauthorized");
  }

  return { user, role: profile.role };
}

export async function getCurrentProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  return data as ProfileRow | null;
}
