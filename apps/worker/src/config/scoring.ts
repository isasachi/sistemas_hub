// Pesos y umbrales (spec §42-44). Viven acá y NO enterrados en el código: son
// las perillas que se van a mover cuando el ranking no convenza, y buscarlas
// dentro de una fórmula es cómo terminan duplicadas.

/** Puntos de cada señal de ecommerce (spec §23). */
export const ECOMMERCE_WEIGHTS = {
  productSchema: 4,
  price: 3,
  addToCart: 4,
  checkout: 3,
  shipping: 2,
  sku: 2,
  inventory: 2,
  productImages: 1,
} as const

/** Penalizaciones. Fuertes a propósito: una sola hunde el score bajo el umbral. */
export const ECOMMERCE_PENALTIES = {
  appointment: -6,
  servicePage: -6,
  software: -6,
} as const

/** Desde acá arriba, la landing cuenta como ecommerce. */
export const ECOMMERCE_THRESHOLD = 7

/**
 * ELEGIBILIDAD (spec §43): PASS/FAIL, separado del ranking. Primero se decide
 * si el candidato es válido y recién después se lo puntúa — así ningún score
 * alto rescata un producto que no cumple.
 */
export const ELIGIBILITY = {
  minRelevance: 0.55,
  minProductConfidence: 0.70,
  minProductShare: 0.70,
} as const

/** Monoproducto (spec §30). Se guarda el NÚMERO; esto solo rotula. */
export const MONOPRODUCT = {
  threshold: 0.70,
  strongThreshold: 0.85,
} as const

/** Pesos del opportunity score (spec §44). Suman 1. */
export const OPPORTUNITY_WEIGHTS = {
  relevance: 0.30,
  monoproduct: 0.25,
  longevity: 0.20,
  ecommerce: 0.10,
  advertiserSignal: 0.10,
  geographicSpread: 0.05,
} as const

/**
 * Días corriendo a partir de los cuales la longevidad puntúa 1. 90 es el mismo
 * techo que ya usa `prescore.ts` del motor viejo — no se inventa una escala
 * nueva para la misma señal.
 */
export const LONGEVITY_CAP_DAYS = 90

/** Anuncios activos del anunciante para que `advertiserSignal` puntúe 1. */
export const ADVERTISER_CAP_ADS = 200

/** Países distintos en los que se vio el producto para que el spread sea 1. */
export const GEO_CAP_COUNTRIES = 5
