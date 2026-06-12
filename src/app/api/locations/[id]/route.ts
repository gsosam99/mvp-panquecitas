import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import type { LocationType } from "@/types";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth("ADMIN");
    const { id } = await params;
    const body = await req.json() as {
      name?: string; type?: LocationType; sap_code?: string; address?: string; region?: string;
    };
    const supabase = await createSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("locations").update(body).eq("id", id);
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
    const supabase = await createSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("locations").delete().eq("id", id);
    if (error) return Response.json({ error: (error as { message: string }).message }, { status: 400 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
}
