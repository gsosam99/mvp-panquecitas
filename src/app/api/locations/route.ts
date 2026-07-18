import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { hasDashboardSession } from "@/lib/session";
import type { LocationType } from "@/types";

export async function GET() {
  if (!(await hasDashboardSession())) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("locations")
    .select("id, name, type, sap_code, address, region, centro_poblado, municipio, tipo_cliente")
    .order("centro_poblado")
    .order("name");
  if (error)
    return Response.json({ error: (error as { message: string }).message }, { status: 500 });
  return Response.json({ locations: data });
}

export async function POST(req: Request) {
  if (!(await hasDashboardSession())) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { name, type, sap_code, address, region } = (await req.json()) as {
      name: string;
      type: LocationType;
      sap_code: string;
      address?: string;
      region?: string;
    };
    if (!name || !type || !sap_code) {
      return Response.json(
        { error: "Nombre, tipo y código SAP son requeridos" },
        { status: 400 }
      );
    }
    const supabase = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("locations")
      .insert({ name, type, sap_code, address: address || null, region: region || null })
      .select()
      .single();
    if (error)
      return Response.json({ error: (error as { message: string }).message }, { status: 400 });
    return Response.json({ location: data }, { status: 201 });
  } catch {
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
