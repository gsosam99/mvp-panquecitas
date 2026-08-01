import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import type { FieldRole } from "@/types";

export async function GET() {
  if (!(await hasDashboardSession())) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("field_workers")
    .select("id, cedula, first_name, last_name, role, oficina_venta, active")
    .order("oficina_venta")
    .order("last_name");
  if (error)
    return Response.json({ error: (error as { message: string }).message }, { status: 500 });
  return Response.json({ workers: data });
}

export async function POST(req: Request) {
  if (!(await hasDashboardSession())) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { cedula, first_name, last_name, role, oficina_venta } = (await req.json()) as {
      cedula: string;
      first_name: string;
      last_name: string;
      role: FieldRole;
      oficina_venta: string;
    };
    if (!cedula || !first_name || !last_name || !role || !oficina_venta) {
      return Response.json(
        { error: "Cédula, nombre, apellido, rol y oficina de venta son requeridos" },
        { status: 400 }
      );
    }
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("field_workers")
      .insert({ cedula: cedula.trim(), first_name, last_name, role, oficina_venta })
      .select()
      .single();
    if (error)
      return Response.json({ error: (error as { message: string }).message }, { status: 400 });
    return Response.json({ worker: data }, { status: 201 });
  } catch {
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
