import {
  getConversionDegustaciones,
  getCoberturaComunicacionPorSector,
  getDetalleClientesPorSegmento,
  getMixProducto,
  getPedidosPendientes,
  getPenetracionRecompraSemanal,
  getRunningVentas,
  getTotalToneladas,
} from "@/lib/dienn-queries";
import { getIndiceTiendaPerfecta } from "@/lib/admin-queries";
import { SECTOR_LABELS, type Sector } from "@/lib/universe";

const PILOT_SECTOR_KEYS: Sector[] = ["cumana", "barquisimeto_este"];
import { DiennDashboardClient, type SectorBundle } from "@/components/dashboard/DiennDashboardClient";

async function getBundle(sector?: Sector): Promise<SectorBundle> {
  const [totalToneladas, runningVentas, mixProducto, penetracionRecompra, detalleSegmentos, pedidosPendientes] =
    await Promise.all([
      getTotalToneladas(sector),
      getRunningVentas(sector),
      getMixProducto(sector),
      getPenetracionRecompraSemanal(sector),
      getDetalleClientesPorSegmento(sector),
      getPedidosPendientes(sector),
    ]);

  return { totalToneladas, runningVentas, mixProducto, penetracionRecompra, detalleSegmentos, pedidosPendientes };
}

// El objetivo de este dashboard es reactivo en el cliente (Tabs
// TOTAL/sector) sin ida y vuelta al servidor por cada clic — ver "2.
// FILTROS REACTIVOS DE SEGMENTO" en el documento DIENN — así que aquí se
// precalculan los 3 posibles cortes (TOTAL + cada sector piloto) y se le
// pasan completos al cliente, que solo decide cuál mostrar.
export async function DiennStrategicDashboard() {
  const [total, cumana, barquisimetoEste, coberturaComunicacion, conversionDegustaciones, tiendaIdeal] =
    await Promise.all([
      getBundle(undefined),
      getBundle("cumana"),
      getBundle("barquisimeto_este"),
      getCoberturaComunicacionPorSector(),
      getConversionDegustaciones(),
      getIndiceTiendaPerfecta(),
    ]);

  return (
    <DiennDashboardClient
      bundles={{ TOTAL: total, cumana, barquisimeto_este: barquisimetoEste }}
      coberturaComunicacion={coberturaComunicacion}
      conversionDegustaciones={conversionDegustaciones}
      tiendaIdeal={tiendaIdeal}
      sectorLabels={SECTOR_LABELS}
      pilotSectors={PILOT_SECTOR_KEYS}
    />
  );
}
