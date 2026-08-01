"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FieldRole } from "@/types";

interface FieldRegisterFormProps {
  role: FieldRole;
  roleLabel: string;
}

export function FieldRegisterForm({ role, roleLabel }: FieldRegisterFormProps) {
  const router = useRouter();
  const [cedula, setCedula] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = cedula.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, cedula }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Revisa la cédula ingresada.");
        return;
      }
      router.push(role === "MERCADERISTA" ? "/audit" : "/promotions");
      router.refresh();
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{roleLabel} · Ingresa tu cédula</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cedula">Cédula de Identidad</Label>
            <Input
              id="cedula"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={cedula}
              onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
              placeholder="Solo números"
              required
              autoFocus
              className="bg-white text-slate-900 placeholder:text-slate-400"
            />
            <p className="text-xs text-slate-400">
              Tu cédula debe estar registrada previamente por tu supervisor.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading || !valid}>
            {loading ? "Verificando…" : "Continuar"}
          </Button>
          <Link
            href="/"
            className="block text-center text-sm text-slate-400 hover:text-slate-600"
          >
            ← Cambiar de perfil
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
