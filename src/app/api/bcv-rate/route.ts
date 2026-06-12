interface DolarApiResponse {
  promedio?: number;
  promedio_real?: number;
  valor?: number;
}

export async function GET() {
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", {
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as DolarApiResponse;
    const rate = data.promedio ?? data.promedio_real ?? data.valor;

    if (!rate || typeof rate !== "number") {
      throw new Error("Formato de respuesta inesperado");
    }

    return Response.json({ rate });
  } catch (error) {
    console.error("[GET /api/bcv-rate]", error);
    return Response.json(
      { rate: null, error: "No se pudo obtener la tasa del BCV" },
      { status: 503 }
    );
  }
}
