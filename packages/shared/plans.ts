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
  /** Nombre comercial. Se muestra tal cual en la tabla de precios y en Mi cuenta. */
  nombre: string
  /**
   * USD al mes. ⚠️ TIENE QUE COINCIDIR CON EL PRECIO DEL PLAN EN WHOP, que es lo
   * que el usuario ve en el checkout y lo que se le cobra. Verificado contra la
   * API el 2026-08-21: los tres planes devuelven `formatted_price` "$29.90 /
   * month", "$69.90 / month" y "$89.90 / month". Publicar otra cifra acá es la
   * misma clase de mentira que las dos tablas de precios separadas, pero peor:
   * la contradicción aparece en el momento de pagar.
   */
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
  /**
   * Cuántos anuncios puede pedir UNA sesión del flujo de plantilla (decisión del dueño del
   * repo, 2026-09-04). El flujo clásico no tiene lote: es un anuncio por sesión.
   *
   * ⚠️ CADA ANUNCIO DEL LOTE GASTA UN CRÉDITO, así que este número no es solo un tope de
   * producto: es la fracción del mes que un clic puede consumir. Con 3 sobre 30 créditos, un
   * plan 1 gasta el 10 % de su mes por lote; con 10 sobre 180, un plan 3 gasta el 5,6 %. Ese
   * equilibrio es el motivo de que el cap NO escale proporcional a los créditos.
   *
   * Lo recorta el SERVIDOR (`plan-lote` topa `n` acá antes de planificar) y lo pinta el
   * selector. Escribirlo a mano en la UI es cómo el paywall termina ofreciendo un lote que el
   * servidor no sirve.
   */
  anunciosPorLote: number
}

export const PLANS: Record<Tier, Plan> = {
  1: { tier: 1, nombre: 'Legacy Start', precio: 29.9, buckets: ['0-50'], porRango: 10, creditos: 30, anunciosPorLote: 3 },
  2: { tier: 2, nombre: 'Legacy Scale', precio: 69.9, buckets: ['0-50', '50-100'], porRango: 20, creditos: 100, anunciosPorLote: 5 },
  3: { tier: 3, nombre: 'Legacy Empire', precio: 89.9, buckets: [...RAW_BUCKETS], porRango: 50, creditos: 180, anunciosPorLote: 10 },
}

/**
 * Cuántos anuncios puede pedir de verdad este usuario AHORA: el cap de su plan, recortado por
 * los créditos que le quedan.
 *
 * ⚠️ LOS DOS TOPES SON DISTINTOS Y HACEN FALTA LOS DOS. El cap del plan es lo que compró; los
 * créditos son lo que le queda del mes. Sin recortar por créditos, un plan 3 con 4 créditos
 * pide 10 anuncios, el servidor arranca y el lote muere a mitad con parte de los créditos ya
 * gastados — el modo de fallo que este repo ya documenta para el render por lotes de video
 * ("medio video renderizado es dinero gastado en algo inservible").
 *
 * Devuelve 0 cuando no queda ninguno: ahí lo correcto es no dejar disparar, no ofrecer 1.
 */
export function anunciosPosibles(tier: Tier, creditosRestantes: number): number {
  return Math.max(0, Math.min(PLANS[tier].anunciosPorLote, creditosRestantes))
}

/**
 * Las opciones que ofrece el selector (§30 del spec: `[1] [3] [5] [10]`), recortadas a lo que
 * este usuario puede pedir. Siempre incluye el máximo alcanzable, aunque no sea un escalón
 * redondo: con 4 créditos en un plan 3, las opciones son 1, 3 y 4.
 */
export function opcionesDeLote(maximo: number): number[] {
  if (maximo <= 0) return []
  const escalones = [1, 3, 5, 10].filter((n) => n < maximo)
  return [...escalones, maximo]
}

/**
 * El precio como se muestra. Con centavos SIEMPRE: `${29.9}` da "$29.9", que se
 * lee como un precio distinto del "$29.90" que imprime el checkout de Whop.
 */
export function precioUSD(plan: Plan): string {
  return `$${plan.precio.toFixed(2)}`
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
