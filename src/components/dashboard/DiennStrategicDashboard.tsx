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
  getActivacionAjustada,
  getPosicionPdv,
  getPosicionPorCliente,
  getRendimiento3M,
  getRendimiento3MFocoRecompra,
  getRankingVolumenPorSegmento,
  getPrecioCorrecto,
  getRecompraFranquiciados,
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
import { getSellOutPorClienteDiff } from "@/lib/sellout-queries";
import { getAvailableZonasYAsesores } from "@/lib/sellout-utils";
import { getUniverseLocations, COHORTE_PILOTO_ORIGINAL, SECTOR_LABELS, type Sector } from "@/lib/universe";
import { getCruceInventarioRadar } from "@/lib/cruce-mercaderista-radar";
import { getReporteMercaderistas } from "@/lib/reporte-mercaderistas";
import { getClientesSinRecompra } from "@/lib/clientes-sin-recompra";
import {
  getRendimientoVsMavesa,
  getComparativaPortafolioPorCiudad,
  getVentas3MesesPorCiudad,
  getVentaDiariaPorSegmento,
  getCombinacionesPorTanda,
} from "@/lib/mavesa-queries";
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
    rendimiento3MFocoRecompra,
    rendimientoVsMargarina,
    rendimientoVsMayonesa,
    activacionAjustada,
    recompraFranquiciados,
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
    getRendimiento3MFocoRecompra(sector),
    getRendimientoVsMavesa("margarina", sector),
    getRendimientoVsMavesa("mayonesa", sector),
    getActivacionAjustada(sector),
    getRecompraFranquiciados(sector),
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
    rendimiento3MFocoRecompra,
    rendimientoVsMavesa: { margarina: rendimientoVsMargarina, mayonesa: rendimientoVsMayonesa },
    activacionAjustada,
    recompraFranquiciados,
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
  const [total, cumana, barquisimetoEste, coberturaComunicacion, tiendaIdeal, sellOutClientes, universo, motivosNoVenta, posicionPorCliente, carteraPorSegmento, precioCorrecto, portafolioPorCiudad, ventas3MesesPorCiudad, ventaDiariaPorSegmento, tandasClientes, cruceMercaderistaRadar, reporteMercaderistas, clientesSinRecompra] =
    await Promise.all([
      getBundle(undefined),
      getBundle("cumana"),
      getBundle("barquisimeto_este"),
      getCoberturaComunicacionPorSector(),
      getIndiceTiendaPerfecta(),
      getSellOutPorClienteDiff(),
      getUniverseLocations(),
      getMotivosNoVenta(),
      getPosicionPorCliente(),
      getCarteraPorSegmento(),
      getPrecioCorrecto(),
      getComparativaPortafolioPorCiudad(),
      getVentas3MesesPorCiudad(),
      getVentaDiariaPorSegmento(),
      // Una sola lectura para los tres usos: la tabla de combinaciones de la
      // cartera completa, la de la tanda del arranque (los 358) y la tabla por
      // tanda con su filtro.
      getCombinacionesPorTanda(),
      getCruceInventarioRadar(),
      // Reporte de Mercaderistas: histórico completo de visitas + una fila por
      // PDV del piloto (ver src/lib/reporte-mercaderistas.ts). Global; el
      // recorte por ciudad, mercaderista y fecha se hace en el cliente.
      getReporteMercaderistas(),
      // Clientes con 1 sola compra o +2 semanas sin pedir (ver
      // src/lib/clientes-sin-recompra.ts). Global; se corta por ciudad en el cliente.
      getClientesSinRecompra(),
    ]);

  const combinacionesPiloto = tandasClientes.find((t) => t.cohorte === null)!.resultado;
  const combinacionesPilotoOriginal = tandasClientes.find(
    (t) => t.cohorte === COHORTE_PILOTO_ORIGINAL.nombre
  )!.resultado;

  const { zonas, asesores } = getAvailableZonasYAsesores(universo);

  return (
    <DiennDashboardClient
      bundles={{ TOTAL: total, cumana, barquisimeto_este: barquisimetoEste }}
      coberturaComunicacion={coberturaComunicacion}
      tiendaIdeal={tiendaIdeal}
      sectorLabels={SECTOR_LABELS}
      pilotSectors={PILOT_SECTOR_KEYS}
      sellOutClientes={sellOutClientes}
      zonas={zonas}
      asesores={asesores}
      motivosNoVenta={motivosNoVenta}
      posicionPorCliente={posicionPorCliente}
      carteraPorSegmento={carteraPorSegmento}
      precioCorrecto={precioCorrecto}
      portafolioPorCiudad={portafolioPorCiudad}
      ventas3MesesPorCiudad={ventas3MesesPorCiudad}
      ventaDiariaPorSegmento={ventaDiariaPorSegmento}
      combinacionesPiloto={combinacionesPiloto}
      combinacionesPilotoOriginal={combinacionesPilotoOriginal}
      tandasClientes={tandasClientes}
      cruceMercaderistaRadar={cruceMercaderistaRadar}
      reporteMercaderistas={reporteMercaderistas}
      clientesSinRecompra={clientesSinRecompra}
    />
  );
}
