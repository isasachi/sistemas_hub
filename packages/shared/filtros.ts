// Filtros globales del buscador: país y antigüedad del anuncio. Aplican tanto a
// la búsqueda por categoría como a la búsqueda por nicho.

/**
 * Países servibles. Es `COUNTRIES` (los 6 de LATAM que scrapea el worker) más
 * US, que entra por `FALLBACK_COUNTRIES` cuando un nicho junta pocos candidatos.
 * Verificado contra la base 2026-08-20: CO 15.359 · MX 14.224 · AR 9.831 ·
 * CL 9.044 · EC 6.443 · PE 5.253 · US 56 filas servibles.
 */
export const PAISES = ['MX', 'CO', 'AR', 'CL', 'EC', 'PE', 'US'] as const
export type Pais = (typeof PAISES)[number]

export const PAIS_LABEL: Record<Pais, string> = {
  MX: 'México', CO: 'Colombia', AR: 'Argentina', CL: 'Chile',
  EC: 'Ecuador', PE: 'Perú', US: 'Estados Unidos',
}

export function isPais(v: unknown): v is Pais {
  return typeof v === 'string' && (PAISES as readonly string[]).includes(v)
}

/**
 * Antigüedad MÍNIMA del anuncio más viejo del anunciante, en días.
 *
 * El sentido del filtro es "lleva corriendo al menos X", no "es reciente": un
 * anuncio que sigue vivo después de meses es la señal de que el producto
 * funciona — es la misma lógica de la regla de oro del proyecto (≥10 días) y
 * del índice de longevidad de `prescore.ts`.
 */
export const ANTIGUEDADES = [0, 10, 30, 90] as const
export type Antiguedad = (typeof ANTIGUEDADES)[number]

export const ANTIGUEDAD_LABEL: Record<Antiguedad, string> = {
  0: 'Cualquiera',
  10: '10+ días',
  30: '30+ días',
  90: '90+ días',
}

export function isAntiguedad(v: unknown): v is Antiguedad {
  return typeof v === 'number' && (ANTIGUEDADES as readonly number[]).includes(v)
}

/** Días corriendo a partir del unix timestamp del anuncio más viejo. */
export function diasCorriendo(startDate: number | null | undefined, now = Date.now()): number | null {
  if (typeof startDate !== 'number' || startDate <= 0) return null
  return Math.max(0, Math.floor(now / 86_400_000 - startDate / 86_400))
}
