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
import type { Location, LocationType } from "@/types";

const TYPE_LABELS: Record<LocationType, string> = {
  SUPERMERCADO: "Supermercado",
  ABASTO: "Abasto",
  BODEGA: "Bodega",
  OTRO: "Otro",
};

const TYPE_COLORS: Record<LocationType, string> = {
  SUPERMERCADO: "bg-blue-50 text-blue-700 border-blue-200",
  ABASTO: "bg-amber-50 text-amber-700 border-amber-200",
  BODEGA: "bg-slate-50 text-slate-700 border-slate-200",
  OTRO: "bg-gray-50 text-gray-600 border-gray-200",
};

interface FormState {
  name: string; type: LocationType; sap_code: string; address: string; region: string;
}

const EMPTY: FormState = { name: "", type: "SUPERMERCADO", sap_code: "", address: "", region: "" };

interface Props { initialLocations: Location[] }

export function LocationsClient({ initialLocations }: Props) {
  const [locations, setLocations] = useState<Location[]>(initialLocations);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<Location | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/locations");
    const data = await res.json() as { locations: Location[] };
    setLocations(data.locations ?? []);
  }, []);

  function openCreate() { setForm(EMPTY); setEditTarget(null); setModal("create"); }
  function openEdit(loc: Location) {
    setForm({ name: loc.name, type: loc.type, sap_code: loc.sap_code, address: loc.address ?? "", region: loc.region ?? "" });
    setEditTarget(loc);
    setModal("edit");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = modal === "edit" && editTarget ? `/api/locations/${editTarget.id}` : "/api/locations";
      const method = modal === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json() as { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Error al guardar"); return; }
      toast.success(modal === "edit" ? "Localidad actualizada" : "Localidad creada");
      setModal(null);
      await refresh();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/locations/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json() as { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Error al eliminar"); return; }
      toast.success("Localidad eliminada");
      setDeleteTarget(null);
      await refresh();
    } finally { setSaving(false); }
  }

  const byRegion = locations.reduce<Record<string, Location[]>>((acc, loc) => {
    const r = loc.region ?? "Sin región";
    acc[r] = [...(acc[r] ?? []), loc];
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-[var(--font-heading)]">Localidades</h1>
          <p className="text-muted-foreground mt-1">{locations.length} puntos de venta registrados</p>
        </div>
        <Button onClick={openCreate}>+ Nueva localidad</Button>
      </div>

      {Object.entries(byRegion).map(([region, locs]) => (
        <Card key={region} className="mb-4 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wider text-xs">{region}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Código SAP</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {locs.map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-medium">{loc.name}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[loc.type]}`}>
                        {TYPE_LABELS[loc.type]}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{loc.sap_code}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{loc.address ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(loc)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(loc)}>Eliminar</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {locations.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">📍</p>
          <p className="font-medium">Sin localidades registradas</p>
          <p className="text-sm mt-1">Crea la primera con el botón de arriba o carga un Excel SAP.</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={modal !== null} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === "create" ? "Nueva localidad" : "Editar localidad"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nombre</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Central Madeirense Las Mercedes" className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LocationType })}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="SUPERMERCADO">Supermercado</option>
                  <option value="ABASTO">Abasto</option>
                  <option value="BODEGA">Bodega</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Código SAP</Label>
                <Input value={form.sap_code} onChange={(e) => setForm({ ...form, sap_code: e.target.value })} placeholder="SAP-001" className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label>Región</Label>
                <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Caracas" className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label>Dirección</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Av. Principal, Local 3" className="bg-white" />
              </div>
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
          <DialogHeader><DialogTitle>Eliminar localidad</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">
            ¿Eliminar <strong className="text-foreground">{deleteTarget?.name}</strong>? Se perderán todos los registros SAP y auditorías asociadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? "Eliminando…" : "Eliminar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
