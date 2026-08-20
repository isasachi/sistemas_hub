// Los tres planes del hub. Datos puros: los lee el paywall, el serving del
// buscador y el contador de créditos, así que viven acá y no en `apps/web`
// (el componente cliente del buscador también los necesita para pintar los
// candados sin pedirle nada al servidor).
//
// ⚠️ ESTA ES LA ÚNICA DEFINICIÓN DE QUÉ INCLUYE CADA PLAN. Duplicar cualquiera
// de estos números en la UI es cómo el paywall termina prometiendo algo que el
// servidor no sirve.
import { RAW_BUCKETS, type RawBucket } from './raw-buckets'

export const TIERS = [1, 2, 3] as const
export type Tier = (typeof TIERS)[number]

export interface Plan {
  tier: Tier
  nombre: string
  /** USD al mes. */
  precio: number
  /**
   * Rangos de anuncios que desbloquea. ACUMULATIVO: el plan 3 incluye los del 1
   * y el 2. Los que no están se muestran igual en la UI, con candado.
   */
  buckets: RawBucket[]
  /** Productos servidos por rango. El servidor recorta; la UI no decide esto. */
  porRango: number
  /** Imágenes por período de facturación (anuncios + branding + landing). */
  creditos: number
}

export const PLANS: Record<Tier, Plan> = {
  1: { tier: 1, nombre: 'Plan 1', precio: 29, buckets: ['0-50'], porRango: 10, creditos: 30 },
  2: { tier: 2, nombre: 'Plan 2', precio: 69, buckets: ['0-50', '50-100'], porRango: 20, creditos: 100 },
  3: { tier: 3, nombre: 'Plan 3', precio: 89, buckets: [...RAW_BUCKETS], porRango: 50, creditos: 180 },
}

export function isTier(v: unknown): v is Tier {
  return v === 1 || v === 2 || v === 3
}

/** Normaliza cualquier entrada a un tier válido. Sin match cae al MÁS BAJO. */
export function toTier(v: unknown): Tier {
  const n = typeof v === 'string' ? Number(v) : v
  return isTier(n) ? n : 1
}

export const planOf = (tier: Tier): Plan => PLANS[tier]

/** ¿Este plan desbloquea este rango? */
export function unlocksBucket(tier: Tier, bucket: RawBucket): boolean {
  return PLANS[tier].buckets.includes(bucket)
}

/** Los rangos que este plan NO desbloquea — los que la UI pinta con candado. */
export function lockedBuckets(tier: Tier): RawBucket[] {
  return RAW_BUCKETS.filter((b) => !unlocksBucket(tier, b))
}

/**
 * ¿Conviene avisarle que se le acaban los créditos?
 *
 * Vive acá y no en `lib/credits.ts` porque lo necesitan la página de cuenta (server)
 * y el contador de la barra (client): importar el módulo de créditos desde el cliente
 * arrastraría `next/headers` y el cliente de Supabase al bundle del navegador.
 *
 * El piso de 3 existe para los planes chicos: el 15% de 30 son 4,5, así que sin él un
 * plan 1 avisaría recién con 4 restantes y un plan de 10 no avisaría nunca.
 */
export function creditosBajos(restantes: number, limite: number): boolean {
  return restantes <= Math.max(3, limite * 0.15)
}
