// `analyzeProduct`: define el sistema visual de la landing v2 una vez por sesión, con las reglas del
// system prompt v2 ("autodetect niche… never make user choose style/layout/palette/type… select
// strongest direction and adapt to product/brand/offer/niche"). El usuario solo puede ver el
// resultado y pedir que se rehaga.
import { fetchAsBase64 } from '@/lib/storage'
import { LANDING_V2_GPT_PROMPT } from './system-prompt'
import { structured } from './models'
import { norm } from './verify-copy'
import {
  AnalysisOutSchema, completeInputs, NICHE_LABELS, UserError,
  type LandingSession, type Testimonial, type VisualSystem,
} from './schemas'

const HEX = /^#[0-9a-f]{6}$/i

const TASK = [
  'TASK: establish the visual system of this landing (rules.authority, rules.consistency_brand, niche). It is fixed for all 14 sections.',
  // El prompt literal dice "inspect Knowledge+ALL PDFs first", pero acá no viaja ninguno: el PDF de
  // wireframes pesa 25 MB y lo lee el director en cada sección. Sin esta línea serían dos órdenes opuestas.
  'The Knowledge PDFs are reviewed section by section when each section is designed; this step only sets the visual system from the product and the research.',
  'Image 1 is the real product. The text block is the user\'s market research and offer.',
  '- niche: the product\'s niche among health/beauty/fitness/home/other.',
  '- productForm: what the product physically is (container type, format), as seen in the image.',
  '- palette: 4 to 6 colors as #RRGGBB, each with its role in the landing (e.g. background, surface, headline, accent, brand). Built from the packaging/logo/brand colors; never arbitrary colors that conflict with the product.',
  '- typography: the typographic direction, in one sentence.',
  '- photography: photographic style and lighting, in one sentence.',
  '- artDirection: the art-direction tone for the whole landing, in two sentences, adapted to niche and brand.',
  '- usesPeople: whether the strongest art direction for this product uses people/models.',
  '- peopleDirection: if usesPeople, one sentence on what kind of people (consistent with the research\'s audience); otherwise null.',
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

export async function analyzeProduct(session: LandingSession): Promise<LandingSession> {
  const inputs = completeInputs(session.inputs)
  if (!inputs) throw new UserError('Faltan datos del producto para analizarlo.')

  const photo = await fetchAsBase64(inputs.productImageUrl, 10 * 1024 * 1024)
  const { output: a, model } = await structured({
    name: 'landing_v2_analysis',
    schema: AnalysisOutSchema,
    system: LANDING_V2_GPT_PROMPT,
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

  const { testimonials, ...rest } = a
  const visualSystem: VisualSystem = {
    ...rest,
    // El nicho es input requerido del usuario; el del modelo solo completa "otro".
    niche: inputs.niche === 'other' ? a.niche : inputs.niche,
    palette: a.palette.filter((c) => HEX.test(c.hex)).slice(0, 6),
    peopleDirection: a.usesPeople ? a.peopleDirection : null,
  }
  return { ...session, visualSystem, testimonials: verifiedTestimonials(testimonials, inputs.marketResearch) }
}
