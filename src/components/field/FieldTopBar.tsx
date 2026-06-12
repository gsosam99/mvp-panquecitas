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
    <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-200 shrink-0">
      <span className="text-sm font-medium text-amber-900">🥞 {userName}</span>
      <button
        onClick={handleLogout}
        className="text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors"
      >
        Salir →
      </button>
    </div>
  );
}
