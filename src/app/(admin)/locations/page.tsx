import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Location } from "@/types";

export const metadata: Metadata = { title: "Localidades — Panquecitas" };

const TYPE_LABELS: Record<string, string> = {
  SUPERMERCADO: "Supermercado",
  ABASTO: "Abasto",
  BODEGA: "Bodega",
  OTRO: "Otro",
};

export default async function LocationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("locations")
    .select("id, name, type, sap_code, address, region")
    .order("region")
    .order("name");

  const locations = (data ?? []) as Location[];

  const byRegion = locations.reduce<Record<string, Location[]>>((acc, loc) => {
    const region = loc.region ?? "Sin región";
    acc[region] = [...(acc[region] ?? []), loc];
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Localidades</h1>
          <p className="text-slate-500 mt-1">{locations.length} puntos de venta registrados</p>
        </div>
      </div>

      {Object.entries(byRegion).map(([region, locs]) => (
        <Card key={region} className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{region}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Código SAP</TableHead>
                  <TableHead>Dirección</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locs.map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-medium">{loc.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{TYPE_LABELS[loc.type] ?? loc.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{loc.sap_code}</TableCell>
                    <TableCell className="text-slate-500">{loc.address ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
