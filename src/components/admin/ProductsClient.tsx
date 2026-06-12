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
import type { Product, Variant, VariantType } from "@/types";

interface ProductWithVariants extends Product {
  variants: Variant[];
}

interface Props { initialProducts: ProductWithVariants[] }

type VariantForm = { name: string; type: VariantType; presentation_kg: string; units_per_bulk: string };
const EMPTY_VARIANT: VariantForm = { name: "", type: "BULTO", presentation_kg: "", units_per_bulk: "1" };

export function ProductsClient({ initialProducts }: Props) {
  const [products, setProducts] = useState<ProductWithVariants[]>(initialProducts);
  const [variantModal, setVariantModal] = useState<{ productId: string; product: string } | null>(null);
  const [editVariant, setEditVariant] = useState<Variant | null>(null);
  const [variantForm, setVariantForm] = useState<VariantForm>(EMPTY_VARIANT);
  const [saving, setSaving] = useState(false);
  const [deleteVariant, setDeleteVariant] = useState<Variant | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/products-data");
    const data = await res.json() as { products: ProductWithVariants[] };
    setProducts(data.products ?? []);
  }, []);

  // Inline refresh from DB directly — no dedicated GET endpoint needed
  const refreshLocal = useCallback(async () => {
    const res = await fetch("/api/variants", { method: "GET" }).catch(() => null);
    if (!res) return;
    // Re-fetch products page data
    window.location.reload();
  }, []);

  function openAddVariant(product: ProductWithVariants) {
    setVariantForm(EMPTY_VARIANT);
    setEditVariant(null);
    setVariantModal({ productId: product.id, product: product.name });
  }

  function openEditVariant(variant: Variant, productName: string) {
    setVariantForm({
      name: variant.name,
      type: variant.type,
      presentation_kg: String(variant.presentation_kg),
      units_per_bulk: String(variant.units_per_bulk),
    });
    setEditVariant(variant);
    setVariantModal({ productId: variant.product_id, product: productName });
  }

  async function handleSaveVariant() {
    if (!variantModal) return;
    setSaving(true);
    try {
      const payload = {
        product_id: variantModal.productId,
        name: variantForm.name,
        type: variantForm.type,
        presentation_kg: parseFloat(variantForm.presentation_kg),
        units_per_bulk: parseInt(variantForm.units_per_bulk, 10),
      };

      let res: Response;
      if (editVariant) {
        res = await fetch(`/api/variants/${editVariant.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: payload.name, type: payload.type, presentation_kg: payload.presentation_kg, units_per_bulk: payload.units_per_bulk }),
        });
      } else {
        res = await fetch("/api/variants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json() as { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Error al guardar"); return; }
      toast.success(editVariant ? "Variante actualizada" : "Variante creada");
      setVariantModal(null);
      window.location.reload();
    } finally { setSaving(false); }
  }

  async function handleDeleteVariant() {
    if (!deleteVariant) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/variants/${deleteVariant.id}`, { method: "DELETE" });
      const data = await res.json() as { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Error al eliminar"); return; }
      toast.success("Variante eliminada");
      setDeleteVariant(null);
      window.location.reload();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-[var(--font-heading)]">Productos y Variantes</h1>
        <p className="text-muted-foreground mt-1">Gestiona los productos y sus presentaciones/variantes</p>
      </div>

      <div className="space-y-6">
        {products.map((product) => (
          <Card key={product.id} className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{product.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">{product.brand}</p>
                </div>
                <Button size="sm" onClick={() => openAddVariant(product)}>+ Variante</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Presentación (kg)</TableHead>
                    <TableHead className="text-right">Unidades/Bulto</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.variants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                        Sin variantes — agrega una con el botón de arriba
                      </TableCell>
                    </TableRow>
                  ) : product.variants.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>
                        <Badge variant={v.type === "BULTO" ? "default" : "secondary"}>
                          {v.type === "BULTO" ? "Bulto" : "Unidad"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{v.presentation_kg} kg</TableCell>
                      <TableCell className="text-right tabular-nums">{v.units_per_bulk}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => openEditVariant(v, product.name)}>Editar</Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteVariant(v)}>
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
      </div>

      {/* Variant Create/Edit Modal */}
      <Dialog open={variantModal !== null} onOpenChange={(open) => !open && setVariantModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editVariant ? "Editar variante" : `Nueva variante — ${variantModal?.product}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={variantForm.name} onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
                placeholder="PAN 1kg Bulto" className="bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <select value={variantForm.type} onChange={(e) => setVariantForm({ ...variantForm, type: e.target.value as VariantType })}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="BULTO">Bulto</option>
                  <option value="UNIDAD">Unidad</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Presentación (kg)</Label>
                <Input type="number" step="0.1" min="0" value={variantForm.presentation_kg}
                  onChange={(e) => setVariantForm({ ...variantForm, presentation_kg: e.target.value })}
                  placeholder="1.0" className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label>Unidades por bulto</Label>
                <Input type="number" min="1" value={variantForm.units_per_bulk}
                  onChange={(e) => setVariantForm({ ...variantForm, units_per_bulk: e.target.value })}
                  placeholder="20" className="bg-white" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantModal(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveVariant} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete variant confirmation */}
      <Dialog open={deleteVariant !== null} onOpenChange={(open) => !open && setDeleteVariant(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar variante</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">
            ¿Eliminar <strong className="text-foreground">{deleteVariant?.name}</strong>? Los registros SAP e inventario vinculados pueden verse afectados.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteVariant(null)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteVariant} disabled={saving}>
              {saving ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
