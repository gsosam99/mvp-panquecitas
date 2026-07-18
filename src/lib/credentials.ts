import "server-only";
import type { DashboardRole } from "@/types";

// ────────────────────────────────────────────────────────────────
// Credenciales de acceso a dashboards (roles de control).
// Valores por defecto según la especificación del MVP; se pueden
// sobrescribir con variables de entorno del servidor.
// NUNCA usar prefijo NEXT_PUBLIC_ aquí: son secretos de servidor.
// ────────────────────────────────────────────────────────────────

interface DashboardCredential {
  user: string;
  pass: string;
  role: DashboardRole;
}

const CREDENTIALS: DashboardCredential[] = [
  {
    user: process.env.ADMIN_USER ?? "Administrador.123",
    pass: process.env.ADMIN_PASS ?? "Polar.123",
    role: "ADMIN",
  },
  {
    user: process.env.DIENN_USER ?? "DIENN.123",
    pass: process.env.DIENN_PASS ?? "Panquecitas.123",
    role: "DIENN",
  },
];

/** Valida usuario+contraseña; retorna el rol si coinciden, o null. */
export function validateDashboardCredentials(
  user: string,
  pass: string
): DashboardRole | null {
  const match = CREDENTIALS.find((c) => c.user === user && c.pass === pass);
  return match ? match.role : null;
}
