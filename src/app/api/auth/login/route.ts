import { cookies } from "next/headers";
import { validateDashboardCredentials } from "@/lib/credentials";
import { seal, DASH_COOKIE } from "@/lib/session";

interface LoginPayload {
  user: string;
  pass: string;
}

export async function POST(req: Request) {
  try {
    const { user, pass } = (await req.json()) as LoginPayload;

    if (!user || !pass) {
      return Response.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const role = validateDashboardCredentials(user, pass);
    if (!role) {
      return Response.json({ error: "Credenciales incorrectas" }, { status: 401 });
    }

    const store = await cookies();
    store.set(DASH_COOKIE, seal({ role }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12h
    });

    return Response.json({ ok: true, role });
  } catch (error) {
    console.error("[POST /api/auth/login]", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
