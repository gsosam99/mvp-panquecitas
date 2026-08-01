import { cookies } from "next/headers";
import { seal, FIELD_COOKIE } from "@/lib/session";
import { lookupFieldWorker } from "@/lib/field-roster";
import type { FieldRole, FieldWorker } from "@/types";

interface FieldPayload {
  role: FieldRole;
  cedula: string;
}

const ROLE_LABELS: Record<FieldRole, string> = {
  MERCADERISTA: "Mercaderista",
  PROMOTORA: "Promotora",
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as FieldPayload;
    const role = body.role;
    const cedula = body.cedula?.trim();

    if ((role !== "MERCADERISTA" && role !== "PROMOTORA") || !cedula) {
      return Response.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // El login de campo ahora valida la cédula contra el roster autorizado
    // (field_workers) en vez de aceptar nombre/apellido libres — ver
    // decisión #1/#2 en docs/decisiones-implementacion.md.
    const record = await lookupFieldWorker(cedula);
    if (!record) {
      return Response.json(
        { error: "Cédula no registrada. Contacta a tu supervisor." },
        { status: 401 }
      );
    }

    if (record.role !== role) {
      return Response.json(
        {
          error: `Esta cédula está registrada como ${ROLE_LABELS[record.role]}, no como ${ROLE_LABELS[role]}.`,
        },
        { status: 403 }
      );
    }

    const worker: FieldWorker = {
      role,
      firstName: record.first_name,
      lastName: record.last_name,
      cedula: record.cedula,
      oficinaVenta: record.oficina_venta,
    };

    const store = await cookies();
    store.set(FIELD_COOKIE, seal(worker), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12h
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/auth/field]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
