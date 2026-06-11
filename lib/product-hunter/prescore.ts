import type { ProductRawData } from './types'

// Índice de potencial determinista P_w (adaptado de la investigación 2026-06-11):
//   P_w = w1·L_a + w2·C_a   (el margen M_p no es medible sin costos mayoristas →
//   se re-ponderan longevidad y volumen).
// Uso: priorizar QUÉ candidatos entran primero al batch de análisis cuando hay
// más pendientes que BATCH_LIMIT — los mejores se analizan primero y los
// ganadores de calidad llegan antes a la UI. $0 LLM, no reemplaza al score real.

export const PRESCORE_DAYS_CAP = 90   // ≥90 días corriendo = señal de longevidad saturada
export const PRESCORE_ADS_CAP = 200   // ≥200 ads activos = señal de volumen saturada

const W_LONGEVITY = 0.6
const W_VOLUME = 0.4

// Devuelve 0..1. Datos faltantes cuentan como 0 (conservador: un candidato sin
// days_running no desplaza a uno validado).
export function prescore(raw: Pick<ProductRawData, 'days_running' | 'ad_count'>): number {
  const longevity = Math.min(Math.max(raw.days_running ?? 0, 0) / PRESCORE_DAYS_CAP, 1)
  const volume = Math.min(Math.max(raw.ad_count ?? 0, 0) / PRESCORE_ADS_CAP, 1)
  return W_LONGEVITY * longevity + W_VOLUME * volume
}
