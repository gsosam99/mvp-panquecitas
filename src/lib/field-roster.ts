import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { FieldWorkerRecord } from "@/types";

// ────────────────────────────────────────────────────────────────
// Roster autorizado de personal de campo (tabla field_workers).
// El login de Promotora/Mercaderista ya no acepta nombre/apellido
// libres: solo cédula, validada contra este roster (ver decisión #1/#2
// en docs/decisiones-implementacion.md).
// ────────────────────────────────────────────────────────────────

/** Busca a la persona por cédula (exacta, ya trimeada). Null si no está en el roster o está inactiva. */
export async function lookupFieldWorker(cedula: string): Promise<FieldWorkerRecord | null> {
  const supabase = createSupabaseServiceClient();

  const { data } = await supabase
    .from("field_workers")
    .select("id, cedula, first_name, last_name, role, oficina_venta, active")
    .eq("cedula", cedula)
    .eq("active", true)
    .maybeSingle();

  return (data as FieldWorkerRecord | null) ?? null;
}
