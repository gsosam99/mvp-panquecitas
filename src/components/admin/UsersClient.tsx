"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UserWithProfile, UserRole } from "@/types";

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MERCADERISTA: "Mercaderista",
  PROMOTORA: "Promotora",
};

const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: "bg-primary/10 text-primary border-primary/20",
  MERCADERISTA: "bg-blue-50 text-blue-700 border-blue-200",
  PROMOTORA: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

type ModalMode = "create" | "edit" | null;

interface FormState {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}

const EMPTY_FORM: FormState = { email: "", password: "", full_name: "", role: "MERCADERISTA" };

export function UsersClient() {
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<UserWithProfile | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserWithProfile | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json() as { users: UserWithProfile[] };
      setUsers(data.users ?? []);
    } catch {
      toast.error("Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setModal("create");
  }

  function openEdit(user: UserWithProfile) {
    setForm({ email: user.email, password: "", full_name: user.full_name, role: user.role });
    setEditTarget(user);
    setModal("edit");
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (modal === "create") {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) { toast.error(data.error ?? "Error al crear usuario"); return; }
        toast.success("Usuario creado");
      } else if (modal === "edit" && editTarget) {
        const res = await fetch(`/api/users/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: form.role, full_name: form.full_name }),
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) { toast.error(data.error ?? "Error al actualizar"); return; }
        toast.success("Usuario actualizado");
      }
      setModal(null);
      await fetchUsers();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json() as { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Error al eliminar"); return; }
      toast.success("Usuario eliminado");
      setDeleteTarget(null);
      await fetchUsers();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-[var(--font-heading)]">Usuarios</h1>
          <p className="text-muted-foreground mt-1">{users.length} usuarios registrados</p>
        </div>
        <Button onClick={openCreate}>+ Nuevo usuario</Button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : users.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Sin usuarios</TableCell></TableRow>
            ) : users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLORS[u.role]}`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(u.created_at).toLocaleDateString("es-VE")}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>Editar</Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(u)}>
                      Eliminar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit Modal */}
      <Dialog open={modal !== null} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === "create" ? "Nuevo usuario" : "Editar usuario"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Nombre completo</Label>
              <Input id="u-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Ana García" className="bg-white" />
            </div>
            {modal === "create" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="u-email">Email</Label>
                  <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="ana@empresa.com" className="bg-white" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-pass">Contraseña</Label>
                  <Input id="u-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres" className="bg-white" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="u-role">Rol</Label>
              <select
                id="u-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="ADMIN">Admin</option>
                <option value="MERCADERISTA">Mercaderista</option>
                <option value="PROMOTORA">Promotora</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            ¿Eliminar a <strong className="text-foreground">{deleteTarget?.full_name || deleteTarget?.email}</strong>? Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
