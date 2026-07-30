// Umbrales de PVP tolerable por cluster (ver doc §4, "Desviación PVP 800g y 400g").
// Tolerancia de ±0.01 por redondeo de captura en campo.

export const PVP_TOLERANCE = 0.01;

export const PVP_TARGETS = {
  cumana: { p400: 1.2, p800: 2.2 },
  cabudare: { p400: 1.6, p800: 2.85 },
} as const;

export function isPvpDeviated(observed: number, target: number): boolean {
  return Math.abs(observed - target) > PVP_TOLERANCE;
}
