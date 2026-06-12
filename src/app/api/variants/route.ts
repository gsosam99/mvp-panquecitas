import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import type { VariantType } from "@/types";

export async function POST(req: Request) {
  try {
    await requireAuth("ADMIN");
    const { product_id, name, type, presentation_kg, units_per_bulk } = await req.json() as {
      product_id: string; name: string; type: VariantType;
      presentation_kg: number; units_per_bulk: number;
    };
    if (!product_id || !name || !type || !presentation_kg) {
      return Response.json({ error: "Todos los campos son requeridos" }, { status: 400 });
    }
    const supabase = await createSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("variants")
      .insert({ product_id, name, type, presentation_kg, units_per_bulk: units_per_bulk || 1 })
      .select().single();
    if (error) return Response.json({ error: (error as { message: string }).message }, { status: 400 });
    return Response.json({ variant: data }, { status: 201 });
  } catch {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
}
