import {
  getCarteraPorSegmento,
  getConversionDegustaciones,
  getCoberturaComunicacionPorSector,
  getDemandaInsatisfecha,
  getDetalleClientesPorSegmento,
  getMaterialPopPreciador,
  getMixProducto,
  getPanVsHarinaPan,
  getPenetracionRadarVsHpm,
  getPosicionPdv,
  getPosicionPorCliente,
  getRendimiento3M,
  getRankingVolumenPorSegmento,
  getPrecioCorrecto,
  getRunningVentas,
  getStockOut,
  getTotalToneladas,
  getTotalToneladasPedidas,
  getTotalFacturadoToneladas,
  getVentaRecompraActivacion,
  getVolumenRadarAcumulado,
} from "@/lib/dienn-queries";
import { getIndiceTiendaPerfecta } from "@/lib/admin-queries";
import { getMotivosNoVenta } from "@/lib/efectividad-queries";
import { computeSellOut, getSellOutPorClienteDiff } from "@/lib/sellout-queries";
import { getAvailableZonasYAsesores } from "@/lib/sellout-utils";
import { getUniverseLocations, SECTOR_LABELS, type Sector } from "@/lib/universe";
import { getRendimientoVsMavesa, getComparativaPortafolioPorCiudad } from "@/lib/mavesa-queries";
import { DiennDashboardClient, type SectorBundle } from "@/components/dashboard/DiennDashboardClient";

const PILOT_SECTOR_KEYS: Sector[] = ["cumana", "barquisimeto_este"];

async function getBundle(sector?: Sector): Promise<SectorBundle> {
  const [
    totalToneladas,
    totalToneladasPedidas,
    totalFacturadoToneladas,
    volumenRadarAcumulado,
    mixProducto,
    demandaInsatisfecha,
    panVsHarinaPanClientes,
    panVsHarinaPanUniverso,
    runningVentas,
    ventaRecompraActivacion,
    penetracionRadarVsHpm,
    stockOut,
    materialPopPreciador,
    posicionPdv,
    detalleSegmentos,
    conversionDegustaciones,
    rankingSegmentos,
    rendimiento3MClientes,
    rendimiento3MUniverso,
    rendimientoVsMargarina,
    rendimientoVsMayonesa,
  ] = await Promise.all([
    getTotalToneladas(sector),
    getTotalToneladasPedidas(sector),
    getTotalFacturadoToneladas(sector),
    getVolumenRadarAcumulado(sector),
    getMixProducto(sector),
    getDemandaInsatisfecha(sector),
    getPanVsHarinaPan(sector, "clientes"),
    getPanVsHarinaPan(sector, "universo"),
    getRunningVentas(sector),
    getVentaRecompraActivacion(sector),
    getPenetracionRadarVsHpm(sector),
    getStockOut(sector),
    getMaterialPopPreciador(sector),
    getPosicionPdv(sector),
    getDetalleClientesPorSegmento(sector),
    getConversionDegustaciones(sector),
    getRankingVolumenPorSegmento(sector),
    getRendimiento3M("clientes", sector),
    getRendimiento3M("universo", sector),
    getRendimientoVsMavesa("margarina", sector),
    getRendimientoVsMavesa("mayonesa", sector),
  ]);

  return {
    totalToneladas,
    totalToneladasPedidas,
    totalFacturadoToneladas,
    volumenRadarAcumulado,
    mixProducto,
    demandaInsatisfecha,
    panVsHarinaPan: { clientes: panVsHarinaPanClientes, universo: panVsHarinaPanUniverso },
    runningVentas,
    ventaRecompraActivacion,
    penetracionRadarVsHpm,
    stockOut,
    materialPopPreciador,
    posicionPdv,
    detalleSegmentos,
    conversionDegustaciones,
    rankingSegmentos,
    rendimiento3M: { clientes: rendimiento3MClientes, universo: rendimiento3MUniverso },
    rendimientoVsMavesa: { margarina: rendimientoVsMargarina, mayonesa: rendimientoVsMayonesa },
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
  const [total, cumana, barquisimetoEste, coberturaComunicacion, tiendaIdeal, sellOutRecords, sellOutClientes, universo, motivosNoVenta, posicionPorCliente, carteraPorSegmento, precioCorrecto, portafolioPorCiudad] =
    await Promise.all([
      getBundle(undefined),
      getBundle("cumana"),
      getBundle("barquisimeto_este"),
      getCoberturaComunicacionPorSector(),
      getIndiceTiendaPerfecta(),
      computeSellOut(),
      getSellOutPorClienteDiff(),
      getUniverseLocations(),
      getMotivosNoVenta(),
      getPosicionPorCliente(),
      getCarteraPorSegmento(),
      getPrecioCorrecto(),
      getComparativaPortafolioPorCiudad(),
    ]);

  const { zonas, asesores } = getAvailableZonasYAsesores(universo);

  return (
    <DiennDashboardClient
      bundles={{ TOTAL: total, cumana, barquisimeto_este: barquisimetoEste }}
      coberturaComunicacion={coberturaComunicacion}
      tiendaIdeal={tiendaIdeal}
      sectorLabels={SECTOR_LABELS}
      pilotSectors={PILOT_SECTOR_KEYS}
      sellOutRecords={sellOutRecords}
      sellOutClientes={sellOutClientes}
      zonas={zonas}
      asesores={asesores}
      motivosNoVenta={motivosNoVenta}
      posicionPorCliente={posicionPorCliente}
      carteraPorSegmento={carteraPorSegmento}
      precioCorrecto={precioCorrecto}
      portafolioPorCiudad={portafolioPorCiudad}
    />
  );
}
