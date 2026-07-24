import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { callStructured, sliceToWord } from '@/lib/gemini'
import { LandingCopySchema, OfferGenSchema, SectionCopySchema, SECTION_LABELS, type SectionCopy, type SectionType, type Offer, type OfferCopy, type LandingSessionResponse } from './types'
import { SECTION_DNA } from './section-dna'
import type { Part } from '@google/genai'

// Generación de copy compartida entre la ruta /copy (regenera con feedback) y el
// handoff from-branding (genera el copy inicial). Una llamada estructurada barata.

const LANDING_SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'lib/prompts/landing-system.md'),
  'utf-8'
)

// Los bullets de hero/beneficios/cta-final deben coincidir (decisión #3). Toma el primer array
// no vacío entre hero→beneficios como canónico (4), lo pone en hero y cta-final; beneficios
// conserva su 5.º si lo tiene. $0, sin columna DB — se distribuye en generación.
export function shareBullets(sections: SectionCopy[]): SectionCopy[] {
  const source = sections.find((s) => s.type === 'hero')?.bullets
    ?? sections.find((s) => s.type === 'beneficios')?.bullets
  if (!source?.length) return sections
  const canon = source.slice(0, 4)
  return sections.map((s) => {
    if (s.type === 'hero' || s.type === 'cta-final') return { ...s, bullets: canon }
    if (s.type === 'beneficios') return { ...s, bullets: [...canon, ...(s.bullets ?? []).slice(4)] }
    return s
  })
}

// Checklist de arrays obligatorios (conteo exacto), derivado del ADN — el modelo tiende a omitir
// bullets/cards; nombrarlos explícito y con conteo reduce el fallo (y `missingStructure` lo valida).
function requiredArraysChecklist(sections: SectionType[]): string {
  const rows = sections.map((s) => {
    const r = SECTION_DNA[s].requires
    if (!r) return null
    const bits = [r.bullets && `${r.bullets} bullets`, r.bulletsAfter && `${r.bulletsAfter} bulletsAfter`, r.cards && `${r.cards} cards`].filter(Boolean)
    return bits.length ? `  - ${s}: ${bits.join(' + ')}` : null
  }).filter(Boolean)
  return rows.length
    ? `CAMPOS ARRAY OBLIGATORIOS (conteo EXACTO, NUNCA los omitas ni los dejes vacíos):\n${rows.join('\n')}`
    : ''
}

// Falta de estructura vs el ADN (post-shareBullets): devuelve un mensaje por cada array corto. Puro.
export function missingStructure(sections: SectionType[], copy: SectionCopy[]): string[] {
  const gaps: string[] = []
  for (const s of sections) {
    const req = SECTION_DNA[s].requires
    if (!req) continue
    const c = copy.find((x) => x.type === s)
    if (!c) { gaps.push(`Falta la sección "${s}" completa.`); continue }
    const short = (have: number, need: number, field: string) => { if (have < need) gaps.push(`"${s}" necesita ${need} ${field} (tiene ${have}).`) }
    if (req.bullets !== undefined) short(c.bullets?.length ?? 0, req.bullets, 'bullets')
    if (req.bulletsAfter !== undefined) short(c.bulletsAfter?.length ?? 0, req.bulletsAfter, 'bulletsAfter')
    if (req.cards !== undefined) short(c.cards?.length ?? 0, req.cards, 'cards')
  }
  return gaps
}

function copyPromptParts(session: LandingSessionResponse, sections: SectionType[], feedback?: string): Part[] {
  return [
    {
      text: [
        `Escribe el copy de una landing page para este producto. Devuelve JSON (esquema LandingCopy).`,
        ``,
        `Producto: ${session.product_name ?? 'no especificado'}`,
        `Precio / oferta: ${session.price || 'no especificado'}`,
        `Beneficios clave: ${session.benefits || 'no especificados'}`,
        `Público objetivo: ${session.audience || 'no especificado'}`,
        `Tono deseado: ${(session.tone ?? []).join(', ') || 'no especificado'}`,
        `Nicho: ${session.niche_id ?? 'genérico'}`,
        `Demografía objetivo: ${session.demographic_id ?? 'no especificada'}`,
        `IMPORTANTE — los nombres y perfiles de los testimonios deben ser COHERENTES con la demografía objetivo (mismo género y rango de edad). No mezcles géneros si la demografía es de un solo género.`,
        feedback?.trim() ? `\nAjustes pedidos por el usuario: ${feedback.trim()}` : '',
        ``,
        `Secciones a escribir (en este orden). Para CADA sección respeta EXACTAMENTE la ESTRUCTURA de su ADN de copy (conteos de bullets/cards, campos, patrón) — es la fuente de verdad y NO se toca; lo único que adaptás al producto/nicho es el WORDING:`,
        ...sections.map((s, i) => `  ${i + 1}. type="${s}" — ${SECTION_LABELS[s]}\n     ESTRUCTURA (obligatoria): ${SECTION_DNA[s].copy}`),
        ``,
        requiredArraysChecklist(sections),
        ``,
        `Una entrada por sección, con su "type" correcto. La estructura manda; el wording varía por nicho/producto.`,
      ].filter(Boolean).join('\n'),
    },
  ]
}

// Schema POR SECCIÓN: hace REQUERIDOS los arrays del ADN con `.min(conteo)`. Ataca la causa raíz de
// que Gemini omita bullets/cards (su responseSchema los tenía opcionales → los saltaba); a OpenAI lo
// refuerza (el strict ya los requería, ahora también fuerza el conteo vía minItems). Las secciones
// sin `requires` (oferta) usan el schema base. El card shape replica el de SectionCopySchema.
export function sectionCopySchema(s: SectionType) {
  const req = SECTION_DNA[s].requires
  if (!req) return SectionCopySchema
  // `.length(n)` = minItems=maxItems=n → conteo EXACTO (las plantillas tienen slots fijos: no sirve
  // un rango). Fuerza contra la sub-producción de Gemini Y la sobre-producción de OpenAI.
  const ext: Record<string, z.ZodTypeAny> = {}
  if (req.bullets) ext.bullets = z.array(z.string().max(40)).length(req.bullets)
  if (req.bulletsAfter) ext.bulletsAfter = z.array(z.string().max(40)).length(req.bulletsAfter)
  if (req.cards) ext.cards = z.array(z.object({ title: z.string().max(40), body: z.string().max(90) })).length(req.cards)
  return SectionCopySchema.extend(ext)
}

// Genera el copy de UNA sección (per-sección enfocado > batch-8, que hacía omitir arrays densos).
// 1º con el schema por-sección de arrays requeridos (fuerza presencia+conteo en ambos motores); si el
// modelo no lo cumple tras los reintentos internos, best-effort con el schema laxo (evita 500 — el
// retry correctivo de generateLandingCopy es la red final).
async function generateOneSection(session: LandingSessionResponse, s: SectionType, feedback?: string): Promise<SectionCopy | null> {
  // Prefiere la sección con el type correcto; si el modelo devolvió UNA sola con el type mal escrito,
  // la coacciona a `s` (per-sección pedimos exactamente `s`, así que esa única ES `s`); si no, null —
  // nunca guarda un objeto de OTRO type bajo la clave `s` (corrompería shareBullets/render por type).
  const pick = (r: { sections: SectionCopy[] }): SectionCopy | null =>
    r.sections.find((x) => x.type === s) ?? (r.sections.length === 1 ? { ...r.sections[0], type: s } : null)
  const parts = copyPromptParts(session, [s], feedback)
  try {
    const strict = z.object({ sections: z.array(sectionCopySchema(s)) })
    return pick(await callStructured('landing_copy', strict, parts, 3, LANDING_SYSTEM_PROMPT) as { sections: SectionCopy[] })
  } catch {
    return pick(await callStructured('landing_copy', LandingCopySchema, parts, 2, LANDING_SYSTEM_PROMPT))
  }
}

// Post-trim ANTI-TRUNCADO (engine-agnóstico): un string EXACTAMENTE en su tope de caracteres es señal
// de que el modelo/schema lo cortó a mitad de palabra ("…Sient.", "…Tuali"). Se recorta al último
// límite de palabra; los que están BAJO el tope (copy sano) no se tocan. Mapa alineado a
// SectionCopySchema — si cambian los .max() del schema, actualizar acá.
const COPY_MAX: Record<string, number> = {
  headline: 60, accentWord: 40, subheadline: 90, closingBold: 40, closingSub: 90,
  closingStrip: 60, socialProof: 90, ctaHeadline: 30, ctaSub: 90, cta: 25,
}
const trimAtMax = (s: string, max: number) => (s.length >= max ? sliceToWord(s, max - 1) : s)
export function trimCopyStrings(sections: SectionCopy[]): SectionCopy[] {
  return sections.map((s) => {
    const c = { ...s } as Record<string, unknown>
    for (const [k, max] of Object.entries(COPY_MAX)) if (typeof c[k] === 'string') c[k] = trimAtMax(c[k] as string, max)
    for (const arr of ['bullets', 'bulletsAfter'] as const) if (Array.isArray(c[arr])) c[arr] = (c[arr] as string[]).map((b) => trimAtMax(b, 40))
    if (Array.isArray(c.cards)) c.cards = (c.cards as { title: string; body: string }[]).map((card) => ({ title: trimAtMax(card.title, 40), body: trimAtMax(card.body, 90) }))
    return c as SectionCopy
  })
}

export async function generateLandingCopy(
  session: LandingSessionResponse,
  sections: SectionType[],
  feedback?: string
): Promise<SectionCopy[]> {
  // Per-sección en paralelo (más fiable que batch-8 para llenar bullets/cards).
  const bySection = new Map<SectionType, SectionCopy>()
  const first = await Promise.all(sections.map((s) => generateOneSection(session, s, feedback)))
  sections.forEach((s, i) => { if (first[i]) bySection.set(s, first[i]!) })

  let out = shareBullets([...bySection.values()])
  // Retry correctivo de las secciones que siguen cortas tras shareBullets (cta-final se llena con los
  // bullets del hero, así que ya no aparece corta). El strict schema de OpenAI fuerza la PRESENCIA del
  // array pero no el CONTEO — algunas secciones (testimonios) sub-producen 1; se nombran los faltantes
  // y se insiste hasta 2 rondas (la generación es estocástica). El mensaje ordena INVENTAR de muestra
  // antes que devolver menos (es contenido de plantilla que el usuario editará).
  for (let attempt = 0; attempt < 2; attempt++) {
    // "Corta" = falta la sección entera (generateOneSection devolvió null — incluye oferta y demás sin
    // `requires`, que missingStructure no chequea) O le faltan arrays del ADN.
    const shortSections = sections.filter((s) => !out.some((c) => c.type === s) || missingStructure([s], out.filter((c) => c.type === s)).length > 0)
    if (!shortSections.length) break
    await Promise.all(shortSections.map(async (s) => {
      const gaps = missingStructure([s], out.filter((c) => c.type === s))
      // Con gaps de arrays → mensaje correctivo. Sin gaps (sección faltó entera, ej fallo transitorio
      // de una sin `requires`) → simple re-generación con el feedback original.
      const fb = gaps.length
        ? `${feedback?.trim() ? feedback.trim() + '\n' : ''}CORRIGE la estructura (OBLIGATORIO): ${gaps.join(' ')} Devuelve la sección "${s}" con su array del tamaño EXACTO indicado. Si te faltan ideas, INVENTA entradas realistas de muestra (es contenido de plantilla que el vendedor editará) — NUNCA devuelvas menos del conteo pedido.`
        : feedback
      const fixed = await generateOneSection(session, s, fb)
      if (fixed) bySection.set(s, fixed)
    }))
    out = shareBullets([...bySection.values()])
  }
  return trimCopyStrings(out)
}

// Copy de la Oferta HÍBRIDA. Una call estructurada produce copy + tiers (OfferGenSchema fuerza
// el decoy: ≥2 tiers, exactamente uno featured); el resultado se PARTE en `offer` (tiers/urgency,
// nivel de sesión — Fase 5 C5.1) y `copy` (headline/subheadline, propio de la sección). El
// `.refine` se valida post-hoc en callStructured → reintenta si el modelo no cumple.
// El % de ahorro se CALCULA de los precios (no lo escribe el LLM, que se equivoca y a veces omite
// el mayor descuento en el tier destacado). Sin ancla válida → sin %.
function parsePrice(s?: string): number | null {
  const m = s?.replace(/\s/g, '').match(/(\d[\d.,]*)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
function recomputeSavings(offer: Offer): Offer {
  return {
    ...offer,
    tiers: offer.tiers.map((t) => {
      const now = parsePrice(t.price), before = parsePrice(t.priceBefore)
      const pct = now && before && before > now ? Math.round((1 - now / before) * 100) : undefined
      return { ...t, savingsPct: pct }
    }),
  }
}

export async function generateOfferCopy(
  session: LandingSessionResponse,
  feedback?: string,
): Promise<{ offer: Offer; copy: OfferCopy }> {
  const parts: Part[] = [
    {
      text: [
        `Escribe SOLO el copy de la sección OFERTA de una landing (esquema OfferCopy).`,
        `El campo "type" debe ser exactamente "oferta".`,
        ``,
        `Producto: ${session.product_name ?? 'no especificado'}`,
        `Precio / oferta: ${session.price || 'no especificado'}`,
        `Beneficios clave: ${session.benefits || 'no especificados'}`,
        `Público objetivo: ${session.audience || 'no especificado'}`,
        `Tono deseado: ${(session.tone ?? []).join(', ') || 'no especificado'}`,
        feedback?.trim() ? `\nAjustes pedidos por el usuario: ${feedback.trim()}` : '',
        ``,
        `Reglas de la oferta:`,
        `- Preferentemente 3 tiers de cantidad (1 / 2 / 3 unidades). Precios en soles ("S/ 199").`,
        `- Exactamente UN tier con featured:true — el mediano-alto (el decoy que querés vender).`,
        `- TODOS los tiers llevan priceBefore (precio ancla tachado), savingsPct y perUnit —`,
        `  las cards deben verse pobladas. perUnit = costo por unidad ("S/ 66 c/u").`,
        `- badge corto solo en el featured ("Mejor valor" / "Recomendado").`,
        `- urgency solo si aplica ("Solo hoy", "Stock limitado"). cta corto por tier ("Compra ya").`,
      ].join('\n'),
    },
  ]
  const gen = await callStructured('landing_offer_copy', OfferGenSchema, parts, 3, LANDING_SYSTEM_PROMPT)
  return {
    offer: recomputeSavings({ tiers: gen.tiers, urgency: gen.urgency }),
    copy: { type: 'oferta', headline: gen.headline, subheadline: gen.subheadline },
  }
}
