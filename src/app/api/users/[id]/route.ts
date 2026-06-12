import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import type { UserRole } from "@/types";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth("ADMIN");
    const { id } = await params;
    const { role, full_name } = await req.json() as { role?: UserRole; full_name?: string };
    const updates: Record<string, unknown> = {};
    if (role) updates.role = role;
    if (full_name) updates.full_name = full_name;

    const supabase = await createSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("profiles").update(updates).eq("id", id);
    if (error) return Response.json({ error: (error as { message: string }).message }, { status: 400 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth("ADMIN");
    const { id } = await params;
    const service = createSupabaseServiceClient();
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
}
