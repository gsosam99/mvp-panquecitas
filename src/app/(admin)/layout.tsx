import { requireDashboard } from "@/lib/session";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireDashboard();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col print:min-h-0 print:bg-white">
      <AdminNav role={session.role} />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl print:p-0 print:max-w-none">
        {children}
      </main>
    </div>
  );
}
