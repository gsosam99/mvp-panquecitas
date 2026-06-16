"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface FieldTopBarProps {
  userName: string;
}

export function FieldTopBar({ userName }: FieldTopBarProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-panquecitas border-b border-panquecitas shrink-0">
      <span className="text-sm font-medium text-white">🥞 {userName}</span>
      <button
        onClick={handleLogout}
        className="text-sm font-medium text-white/80 hover:text-white transition-colors"
      >
        Salir →
      </button>
    </div>
  );
}
