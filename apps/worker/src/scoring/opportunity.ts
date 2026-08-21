// Elegibilidad y ranking (spec §42-44).
//
// ⚠️ SON DOS PASOS SEPARADOS Y EL ORDEN IMPORTA. Primero PASS/FAIL, después
// score. El §43 lo dice con todas las letras: así ningún puntaje alto rescata un
// candidato inválido. Si se mezclaran en una sola fórmula, un producto con
// share 0,3 podría entrar por tener mucha longevidad.
import {
  ELIGIBILITY, OPPORTUNITY_WEIGHTS, LONGEVITY_CAP_DAYS, ADVERTISER_CAP_ADS, GEO_CAP_COUNTRIES,
} from '../config/scoring'

export interface Candidate {
  physicalProduct: boolean
  ecommerce: boolean
  relevance: number
  productConfidence: number
  productShare: number
  /** Días corriendo del anuncio más viejo del producto. */
  daysActive: number
  ecommerceScore: number
  advertiserAds: number
  countries: number
}

export type RejectionReason =
  | 'NOT_PHYSICAL' | 'NOT_ECOMMERCE' | 'NO_PRODUCT' | 'LOW_RELEVANCE'
  | 'MULTI_PRODUCT' | 'NO_LANDING_PAGE' | 'INVALID_ADVERTISER' | 'SOCIAL_LANDING'

export interface Eligibility {
  eligible: boolean
  reason: RejectionReason | null
}

/**
 * PASS/FAIL. Devuelve el PRIMER motivo que falla, en el orden del embudo del
 * §0 — así un candidato no se atribuye a dos causas y el conteo del §38 suma.
 */
export function eligibility(c: Candidate): Eligibility {
  if (!c.physicalProduct) return { eligible: false, reason: 'NOT_PHYSICAL' }
  if (!c.ecommerce) return { eligible: false, reason: 'NOT_ECOMMERCE' }
  if (c.productConfidence < ELIGIBILITY.minProductConfidence) return { eligible: false, reason: 'NO_PRODUCT' }
  if (c.relevance < ELIGIBILITY.minRelevance) return { eligible: false, reason: 'LOW_RELEVANCE' }
  if (c.productShare < ELIGIBILITY.minProductShare) return { eligible: false, reason: 'MULTI_PRODUCT' }
  return { eligible: true, reason: null }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * Longevidad a partir de `start_date`.
 *
 * ⚠️ El §45 propone calcularla con snapshots día a día. Acá se usa la fecha de
 * inicio que Meta ya devuelve en cada anuncio, y es una desviación deliberada:
 * los snapshots solo empiezan a dar un número después de semanas corriendo el
 * motor, mientras que `start_date` responde desde la primera corrida. Una tabla
 * de snapshots que nadie llena todavía habría sido un cero silencioso.
 */
export function longevityScore(daysActive: number): number {
  return clamp01(daysActive / LONGEVITY_CAP_DAYS)
}

export interface Scored {
  opportunity: number
  parts: Record<string, number>
}

/** Solo para candidatos ELEGIBLES. Rankear un inválido no significa nada. */
export function opportunityScore(c: Candidate): Scored {
  const parts = {
    relevance: clamp01(c.relevance),
    monoproduct: clamp01(c.productShare),
    longevity: longevityScore(c.daysActive),
    // El score de ecommerce no tiene techo fijo; 20 es un valor alto observado.
    ecommerce: clamp01(c.ecommerceScore / 20),
    advertiserSignal: clamp01(c.advertiserAds / ADVERTISER_CAP_ADS),
    geographicSpread: clamp01(c.countries / GEO_CAP_COUNTRIES),
  }
  let total = 0
  for (const [k, w] of Object.entries(OPPORTUNITY_WEIGHTS)) {
    total += (parts[k as keyof typeof parts] ?? 0) * w
  }
  return { opportunity: Number((total * 100).toFixed(1)), parts }
}

/** Días entre la fecha de inicio y hoy. `now` entra por parámetro para testear. */
export function daysActive(startDate: Date | string | null, now = new Date()): number {
  if (!startDate) return 0
  const d = typeof startDate === 'string' ? new Date(startDate) : startDate
  if (Number.isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000))
}
