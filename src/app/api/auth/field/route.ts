import { cookies } from "next/headers";
import { seal, FIELD_COOKIE } from "@/lib/session";
import type { FieldRole, FieldWorker } from "@/types";

interface FieldPayload {
  role: FieldRole;
  firstName: string;
  lastName: string;
  cedula: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as FieldPayload;
    const role = body.role;
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const cedula = body.cedula?.trim();

    if (
      (role !== "MERCADERISTA" && role !== "PROMOTORA") ||
      !firstName ||
      !lastName ||
      !cedula
    ) {
      return Response.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const worker: FieldWorker = { role, firstName, lastName, cedula };

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
