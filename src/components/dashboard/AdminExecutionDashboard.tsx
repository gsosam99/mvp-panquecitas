import { getAdminExecutionSnapshot, getAdminVisitHistory } from "@/lib/admin-queries";
import { AdminExecutionDashboardClient } from "@/components/dashboard/AdminExecutionDashboardClient";

// El snapshot completo de la cartera se resuelve en el servidor de una sola
// vez y el Client Component filtra en memoria por Oficina de Venta y Grupo
// Vendedor, sin volver al servidor — mismo patrón que el dashboard de DIENN.
// El historial de visitas (no solo la última) alimenta los gráficos de
// ejecución semanal y riesgo de stock-out en el tiempo.
export async function AdminExecutionDashboard() {
  const [rows, visits] = await Promise.all([getAdminExecutionSnapshot(), getAdminVisitHistory()]);
  return <AdminExecutionDashboardClient rows={rows} visits={visits} />;
}
