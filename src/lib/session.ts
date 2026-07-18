import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import type { DashboardRole, FieldWorker, FieldRole } from "@/types";

// ────────────────────────────────────────────────────────────────
// Sesión ligera basada en cookies firmadas (HMAC-SHA256).
// No usamos Supabase Auth: Administrador/DIENN acceden con credenciales
// compartidas; Promotora/Mercaderista solo declaran su identidad.
// ────────────────────────────────────────────────────────────────

export const DASH_COOKIE = "pq_dashboard";
export const FIELD_COOKIE = "pq_field";

const SECRET =
  process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-secret";

function sign(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function seal(obj: unknown): string {
  const body = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function unseal<T>(token: string | undefined): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (sign(body) !== sig) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

export interface DashboardSession {
  role: DashboardRole;
}

export async function getDashboardSession(): Promise<DashboardSession | null> {
  const store = await cookies();
  return unseal<DashboardSession>(store.get(DASH_COOKIE)?.value);
}

export async function getFieldWorker(): Promise<FieldWorker | null> {
  const store = await cookies();
  return unseal<FieldWorker>(store.get(FIELD_COOKIE)?.value);
}

/** Server Components de dashboard: exige sesión Administrador/DIENN. */
export async function requireDashboard(): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session) redirect("/acceso");
  return session;
}

/** Server Components de campo: exige identidad declarada (rol opcional). */
export async function requireFieldWorker(role?: FieldRole): Promise<FieldWorker> {
  const worker = await getFieldWorker();
  if (!worker || (role && worker.role !== role)) redirect("/");
  return worker;
}

/**
 * Guard para Route Handlers de dashboard: retorna true si hay sesión válida.
 * A diferencia de requireDashboard(), no redirige (las API responden 401).
 */
export async function hasDashboardSession(): Promise<boolean> {
  return (await getDashboardSession()) !== null;
}
