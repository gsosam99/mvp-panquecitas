"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PILOT_SECTORS } from "@/lib/sectors";
import type { FieldRole, FieldWorkerRecord } from "@/types";

const ROLE_LABELS: Record<FieldRole, string> = {
  MERCADERISTA: "Mercaderista",
  PROMOTORA: "Promotora",
};

interface FormState {
  cedula: string;
  first_name: string;
  last_name: string;
  role: FieldRole;
  oficina_venta: string;
}

const EMPTY: FormState = {
  cedula: "",
  first_name: "",
  last_name: "",
  role: "MERCADERISTA",
  oficina_venta: PILOT_SECTORS[0],
};

interface Props {
  initialWorkers: FieldWorkerRecord[];
}

export function FieldWorkersClient({ initialWorkers }: Props) {
  const [workers, setWorkers] = useState<FieldWorkerRecord[]>(initialWorkers);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<FieldWorkerRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FieldWorkerRecord | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/field-workers");
    const data = (await res.json()) as { workers: FieldWorkerRecord[] };
    setWorkers(data.workers ?? []);
  }, []);

  function openCreate() {
    setForm(EMPTY);
    setEditTarget(null);
    setModal("create");
  }

  function openEdit(worker: FieldWorkerRecord) {
    setForm({
      cedula: worker.cedula,
      first_name: worker.first_name,
      last_name: worker.last_name,
      role: worker.role,
      oficina_venta: worker.oficina_venta,
    });
    setEditTarget(worker);
    setModal("edit");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = modal === "edit" && editTarget ? `/api/field-workers/${editTarget.id}` : "/api/field-workers";
      const method = modal === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar");
        return;
      }
      toast.success(modal === "edit" ? "Persona actualizada" : "Persona agregada");
      setModal(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(worker: FieldWorkerRecord) {
    setSaving(true);
    try {
      const res = await fetch(`/api/field-workers/${worker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !worker.active }),
      });
      if (!res.ok) {
        toast.error("Error al actualizar");
        return;
      }
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/field-workers/${deleteTarget.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error al eliminar");
        return;
      }
      toast.success("Persona eliminada");
      setDeleteTarget(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  const byOficina = workers.reduce<Record<string, FieldWorkerRecord[]>>((acc, w) => {
    acc[w.oficina_venta] = [...(acc[w.oficina_venta] ?? []), w];
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-[var(--font-heading)]">Personal de Campo</h1>
          <p className="text-muted-foreground mt-1">
            {workers.length} personas autorizadas para iniciar sesión como Promotora/Mercaderista
          </p>
        </div>
        <Button onClick={openCreate}>+ Agregar persona</Button>
      </div>

      {Object.entries(byOficina).map(([oficina, list]) => (
        <Card key={oficina} className="mb-4 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wider text-xs">
              {oficina}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cédula</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">
                      {w.first_name} {w.last_name}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{w.cedula}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROLE_LABELS[w.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={w.active ? "default" : "secondary"}>
                        {w.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(w)}>
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleToggleActive(w)} disabled={saving}>
                          {w.active ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(w)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {workers.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">🪪</p>
          <p className="font-medium">Sin personal registrado</p>
          <p className="text-sm mt-1">Agrega la primera persona con el botón de arriba.</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={modal !== null} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === "create" ? "Agregar persona" : "Editar persona"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="Mariana"
                  className="bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Apellido</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Di Buongrazio"
                  className="bg-white"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Cédula de Identidad</Label>
                <Input
                  value={form.cedula}
                  onChange={(e) => setForm({ ...form, cedula: e.target.value.replace(/\D/g, "") })}
                  placeholder="30124915"
                  inputMode="numeric"
                  className="bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as FieldRole })}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="MERCADERISTA">Mercaderista</option>
                  <option value="PROMOTORA">Promotora</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Oficina de Venta</Label>
                <select
                  value={form.oficina_venta}
                  onChange={(e) => setForm({ ...form, oficina_venta: e.target.value })}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {PILOT_SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar persona</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            ¿Eliminar a{" "}
            <strong className="text-foreground">
              {deleteTarget?.first_name} {deleteTarget?.last_name}
            </strong>
            ? Dejará de poder iniciar sesión inmediatamente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
