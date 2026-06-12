import { LoginForm } from "@/components/auth/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ingresar — Panquecitas Monitor",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Panquecitas</h1>
          <p className="text-slate-500 text-sm mt-1">Monitor de MVP</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
