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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [cedula, setCedula] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = firstName.trim() && lastName.trim() && cedula.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, firstName, lastName, cedula }),
      });
      if (!res.ok) {
        toast.error("Revisa los datos ingresados.");
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
        <CardTitle className="text-lg">{roleLabel} · Tus datos</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nombre</Label>
            <Input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Nombre"
              required
              autoComplete="given-name"
              className="bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Apellido</Label>
            <Input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Apellido"
              required
              autoComplete="family-name"
              className="bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cedula">Cédula</Label>
            <Input
              id="cedula"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={cedula}
              onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
              placeholder="Solo números"
              required
              className="bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || !valid}>
            {loading ? "Continuando…" : "Continuar"}
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
