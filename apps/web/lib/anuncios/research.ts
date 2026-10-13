// Investigación de mercado por keywords del nicho. Reemplaza al paso de pegar comentarios de TikTok.
//
// ⚠️ TIENE QUE SER RÁPIDA, y por eso está armada así:
//  - corre EN PARALELO con el scan del producto (`analyzeProduct`), que ya tarda más: no agrega
//    espera a ningún paso;
//  - solo texto (los cuatro campos del formulario), sin imágenes;
//  - Gemini con el thinking al mínimo y un timeout corto por intento;
//  - sin búsqueda web: el grounding suma segundos y no convive con la salida estructurada.
//
// ⚠️ NUNCA BLOQUEA: si falla o tarda, devuelve `null` y el copy se escribe sin ella. Se loguea.
import { structured } from '@/lib/ai-sdk'
import { MarketResearchSchema, type MarketResearch } from './schemas'

// Por intento. Peor caso (Gemini caído → respaldo): el doble, y sigue por debajo del scan.
const TIMEOUT_MS = 6_000

const SYSTEM = [
  'You are a market researcher for direct-response ads sold in Peru.',
  'You know how buyers of each niche talk about their problem and what they type when they look for a solution.',
  'You return structured JSON only. Everything you write is in neutral Peruvian Spanish: tuteo, never voseo, no foreign regionalisms.',
].join('\n')

export interface ProductBrief {
  productName: string
  whatItIs: string | null
  whatItDoes: string
  targetAudience: string
}

export function researchPrompt(p: ProductBrief): string {
  return [
    `Product: ${p.productName}`,
    `What it is: ${p.whatItIs || 'not provided'}`,
    `What it does: ${p.whatItDoes}`,
    `Target audience: ${p.targetAudience}`,
    '',
    'Research the market niche this product sells in. Write buyer vocabulary, never marketing vocabulary.',
    'niche: the market niche, in a few words.',
    'keywords: the search terms and everyday words this market uses for the problem and for this kind of solution — what these buyers type into TikTok, Google or a marketplace. Between 8 and 12 terms, each one to four words.',
    'pains: how these buyers name the problem out loud, in their own words. Between 4 and 6 short phrases.',
    'desires: the outcome they hope for, in their own words. Between 4 and 6 short phrases.',
    'Never include brand names, prices, numbers, percentages, guarantees or claims about this product.',
  ].join('\n')
}

export async function researchMarket(p: ProductBrief): Promise<MarketResearch | null> {
  const t0 = Date.now()
  try {
    const { output, model } = await structured({
      name: 'market_research',
      schema: MarketResearchSchema,
      system: SYSTEM,
      content: [{ type: 'text', text: researchPrompt(p) }],
      intentos: 1,
      timeoutMs: TIMEOUT_MS,
      providerOptions: { google: { thinkingConfig: { thinkingLevel: 'minimal' } } },
    })
    console.log(`[anuncios] investigación de mercado: ${Date.now() - t0} ms (${model})`)
    return output.keywords.length ? output : null
  } catch (e) {
    console.warn(`[anuncios] investigación de mercado falló tras ${Date.now() - t0} ms; el copy sigue sin ella`, e)
    return null
  }
}
