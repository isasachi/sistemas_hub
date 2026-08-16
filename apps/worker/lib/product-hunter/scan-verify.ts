// Medición + veredicto de UN anunciante. Es el corazón del pipeline y vive
// aparte porque lo usan dos entradas distintas: `scan-nicho.ts` (descubre y
// verifica un nicho) y `scan-base.ts` (verifica lo que ya está en la base,
// ordenado por volumen). Dos copias de esta regla es como una se desincroniza.
import type Anthropic from '@anthropic-ai/sdk'
import type { Page } from 'playwright'
import { readConnection, advertiserUrl, type SsrAd } from './ssr-fetch'
import { isPersistentlyBlocked, PersistentBlockError, rateGateMs } from './scraper'
import { shareOf, senalNicho, productKey, type SenalNicho } from './product-key'
import { juzgarNicho } from './nicho-verdict'
import { nonPhysicalSignal } from '@ph/shared'

export const SHARE_MIN = Number(process.env.PH_SCAN_SHARE_MIN ?? 0.5)

export interface Medicion {
  adCount: number          // en el país objetivo: es el que define el rango
  adCountGlobal: number    // todos los mercados, para poder comparar
  share: number
  dominante: string | null
  distintos: number
  muestra: number
  senal: SenalNicho
  textos: string[]
}

export interface Veredicto {
  status: 'monoproducto' | 'sin_verificar' | 'descartado'
  kind: string
  nota: string
  productName: string | null
  medicion: Medicion
}

// Lo que se lee del anunciante. `adCount` define el RANGO y se mide en el país
// donde apareció el producto; el resto sale de la lectura global, que tiene más
// muestra para calcular el share.
export interface Lectura {
  adCount: number          // en el país objetivo → es el que manda el rango
  adCountGlobal: number    // todos los mercados, informativo
  share: number
  dominante: string | null
  distintos: number
  muestra: number
  base: SsrAd[]
}

/** Espera lo que pida el rate-control compartido antes de tocar la IP. */
export async function esperarTurno(): Promise<void> {
  if (isPersistentlyBlocked()) throw new PersistentBlockError()
  const gate = rateGateMs()
  if (gate > 0) await new Promise((r) => setTimeout(r, gate))
  const jitter = Math.max(0, Number(process.env.PH_JITTER_MS ?? 500))
  if (jitter) await new Promise((r) => setTimeout(r, Math.random() * jitter))
}

/**
 * Lee la página del anunciante y calcula rango y share. Todo determinista.
 * null = NO se pudo leer: inconcluso, nunca "no tiene anuncios". Confundirlos
 * fabricaría a la vez un rango bajo y un monoproducto perfecto.
 *
 * ⚠️ SON DOS LECTURAS PORQUE SON DOS PREGUNTAS DISTINTAS. El rango es la
 * promesa que lee el usuario y la tool existe para encontrar productos que
 * funcionan en LATAM, así que se mide en `country`. El share necesita muestra y
 * se mide global — acotarlo al país la achicaría justo en los anunciantes que
 * apenas pautan ahí, que es donde el share ya es más frágil.
 *
 * Sin `country` (o con 'ALL') se comporta como antes: una sola lectura global.
 */
export async function leerAnunciante(
  page: Page, pageId: string, country?: string | null,
): Promise<Lectura | null> {
  const global = await readConnection(page, advertiserUrl(pageId))
  if (!global || typeof global.count !== 'number') return null

  let adCount = global.count
  if (country && country !== 'ALL') {
    await esperarTurno()
    const local = await readConnection(page, advertiserUrl(pageId, country))
    // Si la lectura local no se pudo hacer, NO se inventa un rango con el
    // global: sin ese dato la fila queda inconclusa y vuelve a la cola.
    if (!local || typeof local.count !== 'number') return null
    adCount = local.count
  }

  const s = shareOf(global.ads)
  const delDominante = global.ads.filter((a: SsrAd) => productKey(a) === s.dominante)
  return {
    adCount, adCountGlobal: global.count,
    share: s.share, dominante: s.dominante,
    distintos: s.distintos, muestra: s.muestra,
    base: delDominante.length ? delDominante : global.ads,
  }
}

/** La señal SÍ depende del nicho, así que se calcula por fila, no por anunciante. */
export function medicionDe(l: Lectura, terminos: string[]): Medicion {
  return {
    adCount: l.adCount, adCountGlobal: l.adCountGlobal,
    share: l.share, dominante: l.dominante,
    distintos: l.distintos, muestra: l.muestra,
    senal: senalNicho(terminos, l.dominante, l.base),
    textos: l.base.map((a) => [a.title, a.body].filter(Boolean).join(' — ')).filter((t) => t.trim()),
  }
}

export async function medirAnunciante(
  page: Page, pageId: string, terminos: string[], country?: string | null,
): Promise<Medicion | null> {
  const l = await leerAnunciante(page, pageId, country)
  return l ? medicionDe(l, terminos) : null
}

/**
 * Decide el estado final. El share se resuelve en código; solo si lo pasa se
 * gasta una llamada a Haiku, y solo para "¿es un producto físico DEL nicho?".
 *
 * `ai` en null = modo sin LLM: mide y marca 'sin_verificar' (esas filas SE
 * SIRVEN, pero sin sello).
 */
export async function juzgarAnunciante(
  ai: Anthropic | null, niche: string, advertiser: string | null, m: Medicion,
): Promise<Veredicto> {
  if (m.share < SHARE_MIN) {
    return {
      status: 'descartado', kind: 'indeterminado', productName: null, medicion: m,
      nota: `no es monoproducto: ${Math.round(m.share * 100)}% del dominante entre ${m.distintos} productos`,
    }
  }
  // ⚠️ LA LISTA NEGRA VA ANTES QUE EL MODELO, y no solo por ahorrar la llamada.
  // `nonPhysicalSignal` (@ph/shared) ya está medida sobre 4.492 anuncios
  // etiquetados y reconoce marketplaces, clínicas, cursos y apps por el nombre
  // del anunciante. Sin este gate el modelo aprobó **Temu Argentina** como
  // monoproducto: con 44 anuncios activos y 96% del mismo organizador, los
  // textos que le llegan describen un producto concreto y nada delata que la
  // página es un marketplace. Sus hermanas con miles de anuncios (Shoptemu,
  // Temu México, TemuColombia) sí cayeron, porque ahí la variedad se nota — o
  // sea que el fallo aparece justo cuando el marketplace parece un producto.
  const negra = nonPhysicalSignal(m.textos.join(' ').slice(0, 600), advertiser)
  if (negra) {
    return {
      status: 'descartado', kind: negra.cluster === 'marketplace' || negra.cluster === 'plataforma' ? 'servicio' : 'indeterminado',
      productName: null, medicion: m,
      nota: `no es producto físico (${negra.cluster}): "${negra.match}" en el anunciante`,
    }
  }

  if (!ai) {
    return {
      status: 'sin_verificar', kind: 'indeterminado', productName: null, medicion: m,
      nota: 'medido sin verificación de nicho (--sin-llm)',
    }
  }

  const v = await juzgarNicho(ai, { niche, advertiser, productPath: m.dominante, textos: m.textos })
  const fisico = v.kind === 'fisico'
  const status = !fisico || !v.perteneceAlNicho ? 'descartado'
    // Sin cita textual que lo respalde el veredicto no se publica: va a revisión.
    : !v.citaVerificada ? 'sin_verificar'
    : 'monoproducto'
  const nota = !fisico ? `no es producto físico (${v.kind}): ${v.motivo}`
    : !v.perteneceAlNicho ? `fuera del nicho: ${v.motivo}`
    : !v.citaVerificada ? `sin cita textual que respalde el veredicto: ${v.motivo}`
    : v.motivo
  return { status, kind: v.kind, nota, productName: v.productName || null, medicion: m }
}

// Un fallo de la API NO es un veredicto sobre el producto: marcar la fila por
// esto sería mentir y quemar navegaciones. Mismo criterio que verify-products.ts,
// que nació de perder 309 productos por quedarse sin saldo a mitad de un lote.
export function esFalloDeApi(msg: string): boolean {
  return /credit balance|rate_limit|overloaded|429|5\d\d \{|authentication_error|permission_error/i.test(msg)
}
