import { getAdminExecutionSnapshot } from "@/lib/admin-queries";
import { AdminExecutionDashboardClient } from "@/components/dashboard/AdminExecutionDashboardClient";

// El snapshot completo de la cartera se resuelve en el servidor de una sola
// vez y el Client Component filtra en memoria por Oficina de Venta y Grupo
// Vendedor, sin volver al servidor — mismo patrón que el dashboard de DIENN.
export async function AdminExecutionDashboard() {
  const rows = await getAdminExecutionSnapshot();
  return <AdminExecutionDashboardClient rows={rows} />;
}
