// `analyzeProduct`: define el sistema visual de la landing v2 una vez por sesión.
//
// "El modelo observa, el código decide" (landing.md, polaridad): el modelo devuelve lo que VE
// (color del envase, colores de marca, tipo de producto, dirección de arte) y el código deriva la
// paleta con `polarityFromPackage` / `derivePalette`. Pedirle al razonador veredictos de color en la
// misma llamada contaminaba la observación (medido en v1: 3/6 oscuras → 6/6 claras al separarlo).
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { extractProductBox, cropProduct } from '@/lib/landing/product-box'
import { derivePalette, hexToHsl, polarityFromPackage } from '@/lib/landing/palette-derive'
import { generateTalent } from '@/lib/landing/talent'
import type { DemographicId } from '@/lib/landing/types'
import { LANDING_V2_SYSTEM_PROMPT } from './system-prompt'
import { structured } from './models'
import { gate, record, TALENT_KIND, type Ctx } from './quota'
import { norm } from './verify-copy'
import {
  AnalysisOutSchema, completeInputs, NICHE_LABELS, UserError,
  type LandingSession, type Testimonial, type VisualSystem,
} from './schemas'

// ponytail: partículas y props de v1 (`LandingDna.particles_on`, `props`) quedan FUERA de v2 por
// decisión del dueño del repo (2026-10-05). Constante y no env var: AGENTS.md prohíbe los escapes
// globales. Para recuperarlos: ponerla en true y sumar el campo al análisis y al prompt de render.
export const PROPS_PARTICLES = false

const HEX = /^#[0-9a-f]{6}$/i

const TASK = [
  'TASK: product analysis to set the landing\'s visual system. You OBSERVE; you do not design yet.',
  'Image 1 is the real product. The text block is the user\'s market research and offer.',
  '- niche: the product\'s niche among health/beauty/fitness/home/other.',
  '- productForm: what the product physically is (container type, format), as seen in the image.',
  '- packageHex: the dominant color of the PACKAGING itself as #RRGGBB.',
  '- brandHexes: up to 4 distinct colors that appear on the packaging/logo, as #RRGGBB, most prominent first.',
  '- typography: the typographic direction that fits this brand and niche (families style, weight, case), in one sentence.',
  '- photography: photographic style and lighting that fit, in one sentence.',
  '- graphicResources: up to 4 graphic resources that suit the brand (e.g. textures, shapes, materials). Nothing that conflicts with the packaging.',
  '- artDirection: the art-direction tone for the whole landing, in two sentences, adapted to niche and brand.',
  '- usesPeople: whether the strongest art direction for this product includes a person on camera.',
  '- persona: if usesPeople, ONE sentence describing that person (age range, look, wardrobe, expression) consistent with the research\'s audience; otherwise null.',
  '- testimonials: ONLY testimonials that appear LITERALLY in the research, copied verbatim (name and city only if written there, else null). If there are none, return an empty array. Never write one.',
].join('\n')

/** Testimonios cuya cita aparece literal en la investigación. El resto se descarta: no se inventan. */
export function verifiedTestimonials(found: Testimonial[], research: string): Testimonial[] {
  const src = norm(research).replace(/\s+/g, ' ')
  return found.filter((t) => {
    const q = norm(t.text).replace(/["“”«»]/g, '').replace(/\s+/g, ' ').trim()
    return q.length >= 12 && src.includes(q)
  })
}

export async function analyzeProduct(session: LandingSession, ctx: Ctx): Promise<LandingSession> {
  const inputs = completeInputs(session.inputs)
  if (!inputs) throw new UserError('Faltan datos del producto para analizarlo.')

  // Recorte del producto (ancla de las secciones). Sin recorte confiable, la foto completa:
  // `extractProductBox` devuelve null a propósito antes que un recorte malo.
  const photo = await fetchAsBase64(inputs.productImageUrl, 10 * 1024 * 1024)
  let productCanonicalUrl = inputs.productImageUrl
  const box = await extractProductBox(photo.data, photo.mimeType)
  if (box) {
    const crop = await cropProduct(Buffer.from(photo.data, 'base64'), box)
    productCanonicalUrl = await uploadToStorage(session.id, crop, 'image/png', 'v2-product')
  }

  const { output: a, model } = await structured({
    name: 'landing_v2_analysis',
    schema: AnalysisOutSchema,
    system: LANDING_V2_SYSTEM_PROMPT,
    content: [
      { type: 'file', data: Buffer.from(photo.data, 'base64'), mediaType: photo.mimeType },
      { type: 'text', text: TASK },
      { type: 'text', text: [
        `PRODUCT NAME: ${inputs.productName}`,
        `NICHE GIVEN BY USER: ${NICHE_LABELS[inputs.niche]}${inputs.nicheOther ? ` (${inputs.nicheOther})` : ''}`,
        `MARKET RESEARCH:\n${inputs.marketResearch}`,
      ].join('\n\n') },
    ],
  })
  console.info(`[landing-v2] análisis ${session.id} por ${model}`)

  // Paleta: decisión del código sobre lo observado.
  const brand = a.brandHexes.filter((h) => HEX.test(h)).slice(0, 4)
  const base = brand[0] ?? (HEX.test(a.packageHex) ? a.packageHex : '#808080')
  const polarity = polarityFromPackage(a.packageHex)
  const t = derivePalette(hexToHsl(base), polarity)
  const palette: VisualSystem['palette'] = [
    { hex: t.bg_start, role: 'background' },
    { hex: t.color_surface, role: 'surface' },
    { hex: t.color_headline, role: 'headline' },
    { hex: t.color_accent, role: 'accent' },
    ...brand.map((hex) => ({ hex, role: 'brand' as const })),
  ]

  // Placa canónica del talento (decisión 3 del plan): sin paso de UI, solo si la dirección de arte
  // lleva persona. Es la cara que se repite entre secciones; sin ella cada sección inventa otra.
  let talentUrl: string | null = session.visualSystem?.talentUrl ?? null
  const persona = a.usesPeople ? a.persona?.trim() || null : null
  if (persona && !talentUrl) {
    await gate(session.id, TALENT_KIND, ctx)
    // `generateTalent` ignora demografía y paleta (quedan en su firma "para futuros matices").
    const b64 = await generateTalent(persona, 'no_talent' as DemographicId, t)
    if (b64) {
      talentUrl = await uploadToStorage(session.id, Buffer.from(b64, 'base64'), 'image/png', 'v2-talent')
      await record(session.id, TALENT_KIND, ctx)
    }
  }

  const visualSystem: VisualSystem = {
    // El nicho lo da el usuario (input requerido); el del modelo solo completa "otro".
    niche: inputs.niche === 'other' ? a.niche : inputs.niche,
    productForm: a.productForm,
    palette, polarity,
    typography: a.typography,
    photography: a.photography,
    graphicResources: a.graphicResources.slice(0, 4),
    artDirection: a.artDirection,
    usesPeople: !!persona && !!talentUrl,
    persona,
    talentUrl,
  }
  return {
    ...session,
    productCanonicalUrl,
    visualSystem,
    testimonials: verifiedTestimonials(a.testimonials, inputs.marketResearch),
  }
}
