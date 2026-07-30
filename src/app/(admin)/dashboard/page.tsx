import type { Metadata } from "next";
import { requireDashboard } from "@/lib/session";
import { AdminExecutionDashboard } from "@/components/dashboard/AdminExecutionDashboard";
import { DiennStrategicDashboard } from "@/components/dashboard/DiennStrategicDashboard";

export const metadata: Metadata = { title: "Dashboard — Panquecitas" };
export const revalidate = 300;

// Los perfiles Administrador y DIENN son completamente independientes en
// visibilidad de datos (ver doc §2): Administrador nunca debe recibir cifras
// de Sell-in ni el ratio Panquecitas/HMP, por lo que cada rama solo importa
// y ejecuta las queries que le corresponden — la restricción ocurre en el
// servidor, no ocultando datos en el cliente.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const session = await requireDashboard();

  if (session.role === "ADMIN") {
    // TODO(demo): quitar `demo` una vez haya datos reales de SAP — ver
    // src/lib/admin-queries.ts y src/components/dashboard/DemoModeToggle.tsx.
    const { demo } = await searchParams;
    return <AdminExecutionDashboard demoMode={demo === "1"} />;
  }

  return <DiennStrategicDashboard />;
}
