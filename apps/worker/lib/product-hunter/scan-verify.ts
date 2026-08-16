// Medición + veredicto de UN anunciante. Es el corazón del pipeline y vive
// aparte porque lo usan dos entradas distintas: `scan-nicho.ts` (descubre y
// verifica un nicho) y `scan-base.ts` (verifica lo que ya está en la base,
// ordenado por volumen). Dos copias de esta regla es como una se desincroniza.
import type Anthropic from '@anthropic-ai/sdk'
import type { Page } from 'playwright'
import { readConnection, advertiserUrl, type SsrAd } from './ssr-fetch'
import { shareOf, senalNicho, productKey, type SenalNicho } from './product-key'
import { juzgarNicho } from './nicho-verdict'

export const SHARE_MIN = Number(process.env.PH_SCAN_SHARE_MIN ?? 0.5)

export interface Medicion {
  adCount: number
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

// Lo que se lee del anunciante y NO depende del nicho. Se separa de `Medicion`
// porque un mismo anunciante aparece en varios nichos (medido: 66.005 filas
// pendientes son solo 26.743 anunciantes) y `advertiserUrl` va con country=ALL,
// así que la lectura es idéntica para todos ellos: se hace una vez y se reusa.
export interface Lectura {
  adCount: number
  share: number
  dominante: string | null
  distintos: number
  muestra: number
  base: SsrAd[]
}

/**
 * Lee la página del anunciante y calcula rango y share. Todo determinista.
 * null = NO se pudo leer: inconcluso, nunca "no tiene anuncios". Confundirlos
 * fabricaría a la vez un rango bajo y un monoproducto perfecto.
 */
export async function leerAnunciante(page: Page, pageId: string): Promise<Lectura | null> {
  const res = await readConnection(page, advertiserUrl(pageId))
  if (!res || typeof res.count !== 'number') return null

  const s = shareOf(res.ads)
  const delDominante = res.ads.filter((a: SsrAd) => productKey(a) === s.dominante)
  return {
    adCount: res.count, share: s.share, dominante: s.dominante,
    distintos: s.distintos, muestra: s.muestra,
    base: delDominante.length ? delDominante : res.ads,
  }
}

/** La señal SÍ depende del nicho, así que se calcula por fila, no por anunciante. */
export function medicionDe(l: Lectura, terminos: string[]): Medicion {
  return {
    adCount: l.adCount, share: l.share, dominante: l.dominante,
    distintos: l.distintos, muestra: l.muestra,
    senal: senalNicho(terminos, l.dominante, l.base),
    textos: l.base.map((a) => [a.title, a.body].filter(Boolean).join(' — ')).filter((t) => t.trim()),
  }
}

export async function medirAnunciante(
  page: Page, pageId: string, terminos: string[],
): Promise<Medicion | null> {
  const l = await leerAnunciante(page, pageId)
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
