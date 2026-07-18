import type { Metadata } from "next";
import { AccessForm } from "@/components/auth/AccessForm";

export const metadata: Metadata = { title: "Acceso — Panquecitas" };

export default async function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string }>;
}) {
  const { perfil } = await searchParams;
  const perfilLabel = perfil === "dienn" ? "DIENN" : "Administrador";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-panquecitas">Panquecitas</h1>
          <p className="text-slate-500 text-sm mt-1">Monitor de MVP</p>
        </div>
        <AccessForm perfilLabel={perfilLabel} />
      </div>
    </main>
  );
}
