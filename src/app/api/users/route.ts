import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import type { UserRole, Profile } from "@/types";

export async function GET() {
  try {
    await requireAuth("ADMIN");
    const service = createSupabaseServiceClient();
    const { data, error } = await service.auth.admin.listUsers({ perPage: 200 });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const supabase = await createSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles } = await (supabase as any).from("profiles").select("id, full_name, role");
    const profileMap = new Map<string, Profile>(
      ((profiles ?? []) as Profile[]).map((p) => [p.id, p])
    );

    const users = data.users.map((u) => {
      const profile = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: profile?.full_name ?? (u.user_metadata as Record<string, string>)?.full_name ?? "",
        role: (profile?.role ?? "MERCADERISTA") as UserRole,
        created_at: u.created_at,
      };
    });

    return Response.json({ users });
  } catch {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAuth("ADMIN");
    const { email, password, full_name, role } = await req.json() as {
      email: string; password: string; full_name: string; role: UserRole;
    };
    if (!email || !password || !full_name || !role) {
      return Response.json({ error: "Todos los campos son requeridos" }, { status: 400 });
    }
    const service = createSupabaseServiceClient();
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ user: data.user }, { status: 201 });
  } catch {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
}
