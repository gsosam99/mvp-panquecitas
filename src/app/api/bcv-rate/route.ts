import { fetchBcvRate } from "@/lib/bcv";

// Tasa BCV vigente para el wizard de campo (selector Bs./USD). La misma
// función alimenta la normalización de precios del lado servidor y el
// histórico de bcv_rates — ver src/lib/bcv.ts.
export async function GET() {
  const rate = await fetchBcvRate();

  if (rate === null) {
    return Response.json({ rate: null, error: "No se pudo obtener la tasa del BCV" }, { status: 503 });
  }

  return Response.json({ rate });
}
