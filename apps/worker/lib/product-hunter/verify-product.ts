// Las tres reglas del buscador, aplicadas a UN producto ya scrapeado:
//   1. Producto físico vendible  → se decide con el anuncio de referencia,
//      SIN navegar, así que el descarte no cuesta navegación.
//   2. Rango por cantidad de anuncios → no necesita trabajo: ya está en ad_count.
//   3. Mayoría de la página del anunciante dedicada al mismo producto (≥60%),
//      y que ese producto PERTENEZCA al nicho buscado. Lo segundo va en la misma
//      llamada que lo primero, así que no cuesta ni un request extra: sin esto
//      un catálogo de moda entra en "espalda" solo porque un anuncio matcheó
//      la keyword, y su página es perfectamente monoproducto.
//
// Sesgo: ante la duda se CONSERVA. Solo se descarta con evidencia suficiente.
//
// ⚠️ COSTO: 1 llamada Haiku por producto (2 si el tipo queda indeterminado y hay
// que reclasificar con el texto de la página). Solo en el worker, nunca Vercel.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Page } from 'playwright'
import { navigateAndCapture, noteNavResult, findConnectionCount } from './scraper'
import {
  scanCollations, weighByText, classifyShare, passesPhysicalGate,
  DEFAULT_MARGIN, type ProductKind, type ShareVerdict,
} from './product-share'
import { cleanJsonText, type RawProductRow } from '@ph/shared'

export const MODEL = process.env.PH_VERIFY_MODEL ?? 'claude-haiku-4-5'
const MAX_TEXTS = Math.max(5, Number(process.env.PH_VERIFY_MAX_TEXTS ?? 60))
const MARGIN = Number(process.env.PH_VERIFY_MARGIN ?? DEFAULT_MARGIN)

const KIND_SYSTEM = `Clasificas anuncios de Meta Ads Library según QUÉ se vende.

- "fisico": un objeto tangible que se envía al comprador (crema, rodillera, collar, arena para gatos, faja).
- "digital": software, apps, juegos, suscripciones a plataformas.
- "contenido": cursos, ebooks, planes de entrenamiento, membresías informativas.
- "servicio": algo que se presta o se visita (clínicas, masajes, parques, delivery, marketplaces que no venden un producto propio).
- "indeterminado": el texto no alcanza para saberlo.

No adivines: si el anuncio no deja claro que se envía un objeto, no es "fisico". Y si de plano no hay información, usa "indeterminado".`

const MATCH_SYSTEM = `Recibes el nicho que buscó el usuario, el anuncio con el que apareció un producto y la lista de anuncios activos de ese mismo anunciante.

Primero: decide si el producto del anuncio de referencia PERTENECE al nicho buscado — es decir, si alguien que busca ese nicho lo consideraría una opción. Un cinturón lumbar pertenece a "espalda"; una blusa de moda no, aunque el anuncio mencione la espalda. Ante la duda, responde que SÍ pertenece: el objetivo es no perder productos legítimos.

Después:

Marca qué anuncios de la lista promocionan EL MISMO producto (o la misma línea: variantes, tamaños, colores o packs del mismo artículo) que el anuncio de referencia.

Criterio: mismo artículo concreto resolviendo el mismo problema. Dos cremas para acné del mismo anunciante SÍ; una crema para acné y una faja NO, aunque ambas sean cuidado personal.

Ante la duda, inclúyelo: el objetivo es no perder productos legítimos.

Devuelve también el nombre corto del producto (dos o tres palabras).`

const KindSchema = z.object({
  kind: z.enum(['fisico', 'digital', 'servicio', 'contenido', 'indeterminado']),
  reason: z.string(),
})
const MatchSchema = z.object({
  // Opcional con default true a propósito: si el modelo lo omite, NO se descarta.
  perteneceAlNicho: z.boolean().optional().default(true),
  nicheReason: z.string().optional().default(''),
  productName: z.string(),
  matchedIndices: z.array(z.number().int()),
  reason: z.string(),
})

const KIND_TOOL: Anthropic.Tool = {
  name: 'clasificar_tipo',
  description: 'Registra qué tipo de cosa vende el anuncio.',
  input_schema: z.toJSONSchema(KindSchema) as Anthropic.Tool.InputSchema,
}
const MATCH_TOOL: Anthropic.Tool = {
  name: 'registrar_analisis',
  description: 'Registra qué anuncios del anunciante son del mismo producto que la referencia.',
  input_schema: z.toJSONSchema(MatchSchema) as Anthropic.Tool.InputSchema,
}

// Página del anunciante SIN `sort_data`: ordenar por impresiones muestra primero
// la vitrina (los anuncios más gastados), donde el producto estrella está
// sobrerrepresentado — medido: sesga la proporción hasta 40 puntos.
export function advertiserUrl(pageId: string): string {
  const p = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: 'ALL',
    is_targeted_country: 'false', media_type: 'all', search_type: 'page',
    view_all_page_id: pageId,
  })
  return `https://www.facebook.com/ads/library/?${p}`
}

export interface VerifyResult {
  kind: ProductKind
  // Total de anuncios leído EN VIVO del mismo payload de la verificación (0
  // navegaciones extra). Importa para las filas importadas del pipeline viejo:
  // su ad_count puede tener semanas y el rango sale de ese número.
  liveAdCount: number | null
  verdict: ShareVerdict
  productName: string | null
  note: string
  texts: number
  weightTotal: number
  weightMatched: number
}

const stripVars = (t: string) => t.replace(/\{\{[^}]*\}\}/g, ' ').replace(/\s+/g, ' ').trim()

async function classifyKind(
  row: RawProductRow, ai: Anthropic, extra?: string[],
): Promise<{ kind: ProductKind; reason: string }> {
  const ref = cleanJsonText([row.raw_data?.title, row.raw_data?.body].filter(Boolean).join(' — ').slice(0, 400))
  const cuerpo = extra?.length
    ? extra.map(stripVars).filter((t) => t.length >= 12).slice(0, 15).join('\n· ')
    : stripVars(ref)
  if (cuerpo.length < 12) return { kind: 'indeterminado', reason: 'el anuncio no trae texto real' }

  const res = await ai.messages.create({
    model: MODEL, max_tokens: 300, temperature: 0, system: KIND_SYSTEM,
    tools: [KIND_TOOL], tool_choice: { type: 'tool', name: KIND_TOOL.name },
    messages: [{ role: 'user', content: `Anunciante "${row.name}": ${cuerpo}` }],
  })
  const use = res.content.find((b) => b.type === 'tool_use')
  if (!use || use.type !== 'tool_use') return { kind: 'indeterminado', reason: 'sin respuesta del clasificador' }
  const parsed = KindSchema.parse(use.input)
  return { kind: parsed.kind, reason: parsed.reason }
}

const rechazado = (kind: ProductKind, note: string, extra: Partial<VerifyResult> = {}): VerifyResult => ({
  kind, note, productName: null, texts: 0, weightTotal: 0, weightMatched: 0, liveAdCount: null,
  verdict: { status: 'descartado', share: null, productAds: null, coverage: 0, ciLow: 0, ciHigh: 0 },
  ...extra,
})

export async function verifyProduct(page: Page, row: RawProductRow, ai: Anthropic): Promise<VerifyResult> {
  // ── Regla 1 ────────────────────────────────────────────────────────────────
  let { kind, reason } = await classifyKind(row, ai)
  if (!passesPhysicalGate(kind)) return rechazado(kind, reason)

  // ── Regla 3 (la 2 ya está resuelta: el rango sale de ad_count) ─────────────
  const payloads = await navigateAndCapture(page, advertiserUrl(row.page_id))
  const groups = [...scanCollations(payloads, row.page_id).values()]
  noteNavResult(groups.length)
  const liveAdCount = payloads.map((p) => findConnectionCount(p)).find((n) => n !== null) ?? null
  const adCount = liveAdCount ?? row.ad_count
  const { texts, weights, total } = weighByText(groups, MAX_TEXTS)

  // Regla 1, segunda oportunidad: el anuncio de referencia de un catálogo suele
  // llegar con placeholders sin renderizar ({{product.name}}) y sin texto el
  // clasificador responde 'indeterminado', que por diseño no descarta — así se
  // colaban los marketplaces. Con la página leída hay texto real de sobra.
  if (kind === 'indeterminado' && texts.length) {
    const re = await classifyKind(row, ai, texts)
    kind = re.kind
    reason = re.reason
    if (!passesPhysicalGate(kind)) {
      return rechazado(kind, `(reclasificado con la página) ${reason}`,
        { texts: texts.length, weightTotal: total, liveAdCount })
    }
  }

  if (texts.length === 0) {
    return {
      kind, productName: null, note: 'sin anuncios legibles en la página del anunciante',
      texts: 0, weightTotal: 0, weightMatched: 0, liveAdCount,
      verdict: classifyShare({ weightMatched: 0, weightTotal: 0, adCount, margin: MARGIN }),
    }
  }

  const ref = cleanJsonText([row.raw_data?.title, row.raw_data?.body].filter(Boolean).join(' — ').slice(0, 300))
  const res = await ai.messages.create({
    model: MODEL, max_tokens: 800, temperature: 0, system: MATCH_SYSTEM,
    tools: [MATCH_TOOL], tool_choice: { type: 'tool', name: MATCH_TOOL.name },
    messages: [{
      role: 'user',
      content:
        `Nicho buscado: "${row.niche}"\n` +
        `Anuncio de referencia — anunciante "${row.name}": ${ref || '(sin texto)'}\n\n` +
        `Anuncios activos del anunciante (numerados desde 1):\n` +
        `${texts.map((t, i) => `${i + 1}. ${cleanJsonText(t)}`).join('\n')}\n\n` +
        `Llama a registrar_analisis con los NÚMEROS (1 a ${texts.length}) de los anuncios del mismo producto.`,
    }],
  })
  const use = res.content.find((b) => b.type === 'tool_use')
  if (!use || use.type !== 'tool_use') throw new Error('sin tool_use en el matching')
  const parsed = MatchSchema.parse(use.input)

  if (!parsed.perteneceAlNicho) {
    return rechazado(kind, `fuera del nicho: ${parsed.nicheReason || 'el producto no corresponde a lo buscado'}`,
      { texts: texts.length, weightTotal: total, liveAdCount })
  }

  // La lista se numera desde 1 y acá se vuelve a base 0. Antes se numeraba desde
  // 0 y el modelo respondía en base 1 igual ("todos los anuncios (1-6)"), así que
  // se perdía el índice 0 — que por el orden de weighByText es el creativo de MÁS
  // peso. Revitalegs, monoproducto al 100%, salía con 27% y se descartaba.
  const idx = new Set(
    parsed.matchedIndices.map((i) => i - 1).filter((i) => i >= 0 && i < texts.length),
  )
  const weightMatched = [...idx].reduce((a, i) => a + weights[i], 0)
  const verdict = classifyShare({ weightMatched, weightTotal: total, adCount, margin: MARGIN })
  // Regla 1 sin confirmar: se conserva pero NO se aprueba. "No pude negar que
  // sea físico" no es lo mismo que "es físico".
  if (kind === 'indeterminado' && verdict.status === 'monoproducto') verdict.status = 'sin_verificar'

  return {
    kind, verdict, productName: parsed.productName, note: parsed.reason,
    texts: texts.length, weightTotal: total, weightMatched, liveAdCount,
  }
}
