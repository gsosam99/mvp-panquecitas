import type { Metadata } from "next";
import { FieldRegisterForm } from "@/components/auth/FieldRegisterForm";
import type { FieldRole } from "@/types";

export const metadata: Metadata = { title: "Registro — Panquecitas" };

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string }>;
}) {
  const { perfil } = await searchParams;
  const role: FieldRole = perfil === "mercaderista" ? "MERCADERISTA" : "PROMOTORA";
  const roleLabel = role === "MERCADERISTA" ? "Mercaderista" : "Promotora";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-panquecitas">Panquecitas</h1>
          <p className="text-slate-500 text-sm mt-1">Registro de datos personales</p>
        </div>
        <FieldRegisterForm role={role} roleLabel={roleLabel} />
      </div>
    </main>
  );
}
