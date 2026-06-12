import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProductsClient } from "@/components/admin/ProductsClient";
import type { Product, Variant } from "@/types";

export const metadata: Metadata = { title: "Productos — Panquecitas" };

export default async function ProductsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, brand")
    .order("name");

  const { data: variants } = await supabase
    .from("variants")
    .select("id, product_id, name, type, presentation_kg, units_per_bulk")
    .order("name");

  const variantMap = new Map<string, Variant[]>();
  for (const v of (variants ?? []) as Variant[]) {
    const list = variantMap.get(v.product_id) ?? [];
    list.push(v);
    variantMap.set(v.product_id, list);
  }

  const productsWithVariants = ((products ?? []) as Product[]).map((p) => ({
    ...p,
    variants: variantMap.get(p.id) ?? [],
  }));

  return <ProductsClient initialProducts={productsWithVariants} />;
}
