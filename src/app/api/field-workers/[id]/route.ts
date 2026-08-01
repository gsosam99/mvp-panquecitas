import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import type { FieldRole } from "@/types";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasDashboardSession())) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      cedula?: string;
      first_name?: string;
      last_name?: string;
      role?: FieldRole;
      oficina_venta?: string;
      active?: boolean;
    };
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("field_workers").update(body).eq("id", id);
    if (error)
      return Response.json({ error: (error as { message: string }).message }, { status: 400 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasDashboardSession())) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("field_workers").delete().eq("id", id);
    if (error)
      return Response.json({ error: (error as { message: string }).message }, { status: 400 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
