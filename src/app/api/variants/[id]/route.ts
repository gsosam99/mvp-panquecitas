import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import type { VariantType } from "@/types";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasDashboardSession())) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      type?: VariantType;
      presentation_kg?: number;
      units_per_bulk?: number;
    };
    const supabase = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("variants").update(body).eq("id", id);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("variants").delete().eq("id", id);
    if (error)
      return Response.json({ error: (error as { message: string }).message }, { status: 400 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
