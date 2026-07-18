import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Panquecitas — Selección de perfil" };

interface ProfileOption {
  href: string;
  label: string;
  description: string;
  emoji: string;
}

const FIELD_PROFILES: ProfileOption[] = [
  {
    href: "/registro?perfil=promotora",
    label: "Promotora",
    description: "Registro de muestras y compras",
    emoji: "🥞",
  },
  {
    href: "/registro?perfil=mercaderista",
    label: "Mercaderista",
    description: "Auditoría de anaquel y depósito",
    emoji: "📋",
  },
];

const CONTROL_PROFILES: ProfileOption[] = [
  {
    href: "/acceso?perfil=admin",
    label: "Administrador",
    description: "Dashboard de resultados",
    emoji: "📊",
  },
  {
    href: "/acceso?perfil=dienn",
    label: "DIENN",
    description: "Dashboard de resultados",
    emoji: "🔐",
  },
];

function ProfileCard({ option }: { option: ProfileOption }) {
  return (
    <Link
      href={option.href}
      className="flex items-center gap-4 w-full p-4 bg-white border border-slate-200 rounded-2xl hover:border-panquecitas hover:shadow-sm active:scale-[0.99] transition-all"
    >
      <span className="text-3xl shrink-0" aria-hidden>
        {option.emoji}
      </span>
      <span className="flex-1 text-left">
        <span className="block font-semibold text-slate-900">{option.label}</span>
        <span className="block text-sm text-slate-400">{option.description}</span>
      </span>
      <span className="text-slate-300 text-xl shrink-0" aria-hidden>
        →
      </span>
    </Link>
  );
}

export default function ProfileSelectionPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-panquecitas">Panquecitas</h1>
          <p className="text-slate-500 text-sm mt-1">Selecciona tu perfil para continuar</p>
        </header>

        <section className="space-y-3 mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 px-1">
            Personal de campo
          </p>
          {FIELD_PROFILES.map((p) => (
            <ProfileCard key={p.href} option={p} />
          ))}
        </section>

        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 px-1">
            Roles de control
          </p>
          {CONTROL_PROFILES.map((p) => (
            <ProfileCard key={p.href} option={p} />
          ))}
        </section>
      </div>
    </main>
  );
}
