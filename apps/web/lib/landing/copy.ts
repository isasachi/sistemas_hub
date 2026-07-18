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
  return result.sections
}

// Copy de la Oferta HÍBRIDA. Una call estructurada produce copy + tiers (OfferGenSchema fuerza
// el decoy: ≥2 tiers, exactamente uno featured); el resultado se PARTE en `offer` (tiers/urgency,
// nivel de sesión — Fase 5 C5.1) y `copy` (headline/subheadline, propio de la sección). El
// `.refine` se valida post-hoc en callStructured → reintenta si el modelo no cumple.
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
    offer: { tiers: gen.tiers, urgency: gen.urgency },
    copy: { type: 'oferta', headline: gen.headline, subheadline: gen.subheadline },
  }
}
