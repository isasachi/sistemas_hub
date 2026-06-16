import { isLikelyService } from './competitors'

// Etapa 1 del agente original (AGENTS_PROMPT.md): descarta anunciantes desde la
// card de búsqueda sin visitar su página. Reduce el enrich de cientos a decenas.
// Todos los checks son conservadores: si falta el dato, el candidato pasa.

export const MIN_ADS = 40
export const MIN_DAYS = 10

export interface QuickDiscardCandidate {
  pageName: string
  pageCategories: string[]
  collationCount: number | null  // de la card del anunciante en búsqueda
  startDate: number | null       // unix timestamp segundos del ad más antiguo
  foundCountry: string
}

// Devuelve el motivo de descarte o null (el candidato avanza al enrich).
// Reglas en orden de precedencia:
//   1. Servicio → descartar siempre (no vende producto físico)
//   2. País PE → NO descartar (es el pool de competidores locales, siempre enrichar)
//   3. Volumen < 40 ads → descartar si collationCount disponible
//   4. Muy reciente < 10 días → descartar si startDate disponible
export function quickDiscard(c: QuickDiscardCandidate): string | null {
  if (isLikelyService(c.pageName, c.pageCategories)) return 'servicio'
  if (c.foundCountry === 'PE') return null
  if (c.collationCount !== null && c.collationCount < MIN_ADS) return 'pocos_anuncios'
  if (c.startDate !== null) {
    const daysRunning = Math.floor(Date.now() / 1000 / 86_400 - c.startDate / 86_400)
    if (daysRunning < MIN_DAYS) return 'muy_reciente'
  }
  return null
}

// Casi-ganador (plan 13 parte E): un producto que goldenDiscard rechazó pero
// tiene tracción suficiente para vigilar — un anunciante escalando pasa de ~20
// a 40+ ads en 2-4 semanas. Se guarda en la watchlist para re-chequear, en vez
// de perderlo. Umbrales por debajo de las reglas de oro pero no triviales.
export const NEAR_ADS = 20
export const NEAR_DAYS = 5

export function isNearWinner(adCount: number, daysRunning: number | null): boolean {
  if (daysRunning === null) return false
  return adCount >= NEAR_ADS && daysRunning >= NEAR_DAYS
}

// ⚠️ REGLAS DE ORO (Etapa 2, post-enrich) — requisito explícito del usuario:
// NINGÚN producto entra a ph_products sin cumplir ≥40 ads y ≥10 días activos.
// A diferencia de la Etapa 1 (card, conservadora con datos faltantes), aquí
// los datos son EXACTOS y el filtro es estricto: dato faltante = descartado.
// La tercera regla (no pautado en PE) se cumple por construcción: los
// candidatos PE van a ph_pe_pool, nunca a ph_products.

// Filtro anti-catálogo: el producto específico debe dominar la página de anuncios.
// Si main_product_ad_count / ad_count < 0.6, la página probablemente es un catálogo
// que vende muchos productos distintos — no un producto ganador concreto.
export const MIN_PRODUCT_RATIO = 0.6

export function goldenDiscard(
  adCount: number,
  daysRunning: number | null,
  mainProductAdCount?: number | null,
): string | null {
  if (adCount < MIN_ADS) return 'pocos_anuncios'
  if (daysRunning === null || daysRunning < MIN_DAYS) return 'muy_reciente'
  // Anti-catálogo: solo se aplica si tenemos el count del producto específico y el
  // total de la página es mayor que él (ratio < 1 es posible si la page está activa
  // con más productos que el que encontramos en búsqueda).
  if (mainProductAdCount != null && adCount > 0 && mainProductAdCount / adCount < MIN_PRODUCT_RATIO) {
    return 'catalogo'
  }
  return null
}
