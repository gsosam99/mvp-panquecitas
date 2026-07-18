"use client";

import { useRouter } from "next/navigation";

interface FieldTopBarProps {
  userName: string;
}

export function FieldTopBar({ userName }: FieldTopBarProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-panquecitas border-b border-panquecitas shrink-0">
      <span className="text-sm font-medium text-white">🥞 {userName}</span>
      <button
        onClick={handleLogout}
        className="text-sm font-medium text-white/80 hover:text-white transition-colors"
      >
        Cerrar sesión →
      </button>
    </div>
  );
}
