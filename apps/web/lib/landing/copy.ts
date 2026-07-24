import fs from 'fs'
import path from 'path'
import { callStructured } from '@/lib/gemini'
import { LandingCopySchema, OfferGenSchema, SECTION_LABELS, type SectionCopy, type SectionType, type Offer, type OfferCopy, type LandingSessionResponse } from './types'
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

export async function generateLandingCopy(
  session: LandingSessionResponse,
  sections: SectionType[],
  feedback?: string
): Promise<SectionCopy[]> {
  const parts: Part[] = [
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
        feedback?.trim() ? `\nAjustes pedidos por el usuario: ${feedback.trim()}` : '',
        ``,
        `Secciones a escribir (en este orden), usa exactamente estos "type":`,
        ...sections.map((s, i) => `  ${i + 1}. ${s} — ${SECTION_LABELS[s]}`),
        ``,
        `Una entrada por sección, con su "type" correcto y el copy corto que aplique a ese tipo.`,
      ].join('\n'),
    },
  ]

  const result = await callStructured('landing_copy', LandingCopySchema, parts, 3, LANDING_SYSTEM_PROMPT)
  return shareBullets(result.sections)
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
