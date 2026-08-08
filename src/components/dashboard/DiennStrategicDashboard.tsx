import {
  getConversionDegustaciones,
  getCoberturaComunicacionPorSector,
  getDemandaInsatisfecha,
  getDetalleClientesPorSegmento,
  getMixProducto,
  getPanVsHarinaPan,
  getPenetracionRadarVsHpm,
  getRunningVentas,
  getTotalToneladas,
  getTotalToneladasPedidas,
  getVentaRecompraActivacion,
  getVolumenRadarAcumulado,
  getVolumenVendido,
} from "@/lib/dienn-queries";
import { getIndiceTiendaPerfecta } from "@/lib/admin-queries";
import { computeSellOut } from "@/lib/sellout-queries";
import { getAvailableZonasYAsesores } from "@/lib/sellout-utils";
import { getUniverseLocations, SECTOR_LABELS, type Sector } from "@/lib/universe";
import { DiennDashboardClient, type SectorBundle } from "@/components/dashboard/DiennDashboardClient";

const PILOT_SECTOR_KEYS: Sector[] = ["cumana", "barquisimeto_este"];

async function getBundle(sector?: Sector): Promise<SectorBundle> {
  const [
    totalToneladas,
    totalToneladasPedidas,
    volumenRadarAcumulado,
    mixProducto,
    demandaInsatisfecha,
    panVsHarinaPanClientes,
    panVsHarinaPanUniverso,
    runningVentas,
    ventaRecompraActivacion,
    volumenVendido,
    penetracionRadarVsHpm,
    detalleSegmentos,
  ] = await Promise.all([
    getTotalToneladas(sector),
    getTotalToneladasPedidas(sector),
    getVolumenRadarAcumulado(sector),
    getMixProducto(sector),
    getDemandaInsatisfecha(sector),
    getPanVsHarinaPan(sector, "clientes"),
    getPanVsHarinaPan(sector, "universo"),
    getRunningVentas(sector),
    getVentaRecompraActivacion(sector),
    getVolumenVendido(sector),
    getPenetracionRadarVsHpm(sector),
    getDetalleClientesPorSegmento(sector),
  ]);

  return {
    totalToneladas,
    totalToneladasPedidas,
    volumenRadarAcumulado,
    mixProducto,
    demandaInsatisfecha,
    panVsHarinaPan: { clientes: panVsHarinaPanClientes, universo: panVsHarinaPanUniverso },
    runningVentas,
    ventaRecompraActivacion,
    volumenVendido,
    penetracionRadarVsHpm,
    detalleSegmentos,
  };
}

// El objetivo de este dashboard es reactivo en el cliente (Tabs
// TOTAL/sector, y ahora también Zona/Asesor/Fuente para Sell-Out) sin ida
// y vuelta al servidor por cada clic — ver "2. FILTROS REACTIVOS DE
// SEGMENTO" en el documento DIENN — así que aquí se precalculan los 3
// posibles cortes de sector (TOTAL + cada sector piloto) y el motor de
// Sell-Out completo (sin filtrar), y se le pasan al cliente, que decide
// qué mostrar sin volver a pedir datos.
export async function DiennStrategicDashboard() {
  const [total, cumana, barquisimetoEste, coberturaComunicacion, conversionDegustaciones, tiendaIdeal, sellOutRecords, universo] =
    await Promise.all([
      getBundle(undefined),
      getBundle("cumana"),
      getBundle("barquisimeto_este"),
      getCoberturaComunicacionPorSector(),
      getConversionDegustaciones(),
      getIndiceTiendaPerfecta(),
      computeSellOut(),
      getUniverseLocations(),
    ]);

  const { zonas, asesores } = getAvailableZonasYAsesores(universo);

  return (
    <DiennDashboardClient
      bundles={{ TOTAL: total, cumana, barquisimeto_este: barquisimetoEste }}
      coberturaComunicacion={coberturaComunicacion}
      conversionDegustaciones={conversionDegustaciones}
      tiendaIdeal={tiendaIdeal}
      sectorLabels={SECTOR_LABELS}
      pilotSectors={PILOT_SECTOR_KEYS}
      sellOutRecords={sellOutRecords}
      zonas={zonas}
      asesores={asesores}
    />
  );
}
