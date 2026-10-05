// Esquemas de landing v2. Módulo hoja, sin `fs` ni SDKs: lo importa la UI también.
//
// ⚠️ LOS SCHEMAS QUE VIAJAN A UN MODELO (`AnalysisOut`, `SectionCopyOut`, `RenderBriefOut`) SE
// DISEÑAN COMPATIBLES CON OPENAI STRICT DESDE EL ORIGEN: todo campo en `required`, lo opcional como
// `.nullable()`, nada de `.optional()`/`.nullish()` ni `.catch`/`.default`. Así el MISMO schema va
// plano a Gemini y válido a OpenAI (que el AI SDK manda strict por defecto) sin `toStrictSchema`.
// Un `.nullish()` acá saldría del `required` y el modelo lo omitiría en silencio (ley del repo).
// Sin `maxLength`: OpenAI corta exactamente en el tope (landing.md); el largo lo pide el prompt.
import { z } from 'zod'
import { SECTION_IDS, type SectionId } from './catalog'

export const SectionIdSchema = z.enum(SECTION_IDS)

export const NICHES = ['health', 'beauty', 'fitness', 'home', 'other'] as const
export const NicheSchema = z.enum(NICHES)
export type Niche = z.infer<typeof NicheSchema>
export const NICHE_LABELS: Record<Niche, string> = {
  health: 'Salud', beauty: 'Belleza', fitness: 'Fitness', home: 'Hogar', other: 'Otro',
}

// ─── Inputs del usuario ───────────────────────────────────────────────────────

export const PackSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().int().min(1),
  price: z.number().positive(),
  /** Precio anterior (anclaje). */
  compareAt: z.number().positive().nullable(),
  /** Etiqueta tipo "Más vendido". */
  label: z.string().trim().nullable(),
})
export type Pack = z.infer<typeof PackSchema>

export const PricingSchema = z.object({
  packs: z.array(PackSchema).min(1),
  /** Condiciones de compra (envío, contra entrega, garantía, urgencia): SOLO si el usuario las da. */
  notes: z.string(),
})
export type Pricing = z.infer<typeof PricingSchema>

export const LandingInputsSchema = z.object({
  productName: z.string().trim().min(1),
  marketResearch: z.string().trim().min(1),
  pricing: PricingSchema,
  niche: NicheSchema,
  nicheOther: z.string().trim().nullable(),
  productImageUrl: z.string().url(),
  /** Fotos REALES de antes/después. Sin ellas `before_after` no se genera. */
  proofImageUrls: z.array(z.string().url()),
  ctaText: z.string().trim().nullable(),
})
export type LandingInputs = z.infer<typeof LandingInputsSchema>

/** Lo que se va juntando (en el chat llega por partes). */
export const InputsDraftSchema = LandingInputsSchema.partial()
export type InputsDraft = z.infer<typeof InputsDraftSchema>

export const INPUT_LABELS: Record<'productName' | 'marketResearch' | 'pricing' | 'niche' | 'productImageUrl', string> = {
  productName: 'Nombre exacto del producto',
  marketResearch: 'Investigación de mercado y psicología del consumidor',
  pricing: 'Precios, ofertas y packs',
  niche: 'Nicho del producto',
  productImageUrl: 'Imagen del producto',
}

/** Inputs requeridos que faltan, en el orden del system prompt. */
export function missingInputs(d: InputsDraft): (keyof typeof INPUT_LABELS)[] {
  const out: (keyof typeof INPUT_LABELS)[] = []
  if (!d.productName?.trim()) out.push('productName')
  if (!d.marketResearch?.trim()) out.push('marketResearch')
  if (!PricingSchema.safeParse(d.pricing).success) out.push('pricing')
  if (!d.niche || (d.niche === 'other' && !d.nicheOther?.trim())) out.push('niche')
  if (!d.productImageUrl) out.push('productImageUrl')
  return out
}

export function completeInputs(d: InputsDraft): LandingInputs | null {
  const r = LandingInputsSchema.safeParse({ proofImageUrls: [], ctaText: null, nicheOther: null, ...d })
  return r.success ? r.data : null
}

// ─── Sistema visual ──────────────────────────────────────────────────────────

/** Lo que el modelo OBSERVA. La paleta final la decide el código (`analyze.ts`), no el modelo. */
export const AnalysisOutSchema = z.object({
  niche: NicheSchema,
  productForm: z.string(),
  packageHex: z.string(),
  brandHexes: z.array(z.string()),
  typography: z.string(),
  photography: z.string(),
  graphicResources: z.array(z.string()),
  artDirection: z.string(),
  usesPeople: z.boolean(),
  persona: z.string().nullable(),
  testimonials: z.array(z.object({ name: z.string().nullable(), city: z.string().nullable(), text: z.string() })),
})
export type AnalysisOut = z.infer<typeof AnalysisOutSchema>

export const PaletteRole = z.enum(['background', 'surface', 'headline', 'accent', 'brand'])
export const VisualSystemSchema = z.object({
  niche: NicheSchema,
  productForm: z.string(),
  palette: z.array(z.object({ hex: z.string(), role: PaletteRole })),
  polarity: z.enum(['light', 'dark']),
  typography: z.string(),
  photography: z.string(),
  graphicResources: z.array(z.string()),
  artDirection: z.string(),
  usesPeople: z.boolean(),
  persona: z.string().nullable(),
  /** Placa canónica del talento (retrato), si la dirección de arte lleva persona. */
  talentUrl: z.string().nullable(),
})
export type VisualSystem = z.infer<typeof VisualSystemSchema>

export const TestimonialSchema = z.object({ name: z.string().nullable(), city: z.string().nullable(), text: z.string() })
export type Testimonial = z.infer<typeof TestimonialSchema>

// ─── Copy y brief por sección ─────────────────────────────────────────────────

export const SectionCopyOutSchema = z.object({
  headline: z.string(),
  subheadline: z.string().nullable(),
  /** Bloques del wireframe. `group` = columna/grupo (comparativa, segmentación); null = lista única. */
  items: z.array(z.object({ group: z.string().nullable(), title: z.string().nullable(), text: z.string() })),
  closingLine: z.string().nullable(),
  /** Solo en secciones con CTA; el código lo anula en las demás. */
  cta: z.string().nullable(),
})
export type SectionCopy = z.infer<typeof SectionCopyOutSchema>

/** Brief de composición para el modelo de imagen. INTERNO: nunca se muestra al usuario. */
export const RenderBriefOutSchema = z.object({
  composition: z.string(),
  focalPoint: z.string(),
  productPlacement: z.string(),
  usesPerson: z.boolean(),
  background: z.string(),
  typographyTreatment: z.string(),
  ctaTreatment: z.string().nullable(),
})
export type RenderBrief = z.infer<typeof RenderBriefOutSchema>

// ─── Sesión ──────────────────────────────────────────────────────────────────

export const SectionVersionSchema = z.object({
  imageUrl: z.string(),
  /** Qué modelo respondió: el reescalado a 1080x1920 borra la huella del tamaño. */
  model: z.string(),
  feedback: z.string().nullable(),
  createdAt: z.string(),
})
export type SectionVersion = z.infer<typeof SectionVersionSchema>

export const SectionStateSchema = z.object({
  versions: z.array(SectionVersionSchema),
  approved: z.boolean(),
})
export type SectionState = z.infer<typeof SectionStateSchema>

export const LandingSessionSchema = z.object({
  id: z.string(),
  view: z.enum(['wizard', 'chat']),
  inputs: InputsDraftSchema,
  productCanonicalUrl: z.string().nullable(),
  visualSystem: VisualSystemSchema.nullable(),
  testimonials: z.array(TestimonialSchema),
  selected: z.array(SectionIdSchema),
  copies: z.partialRecord(SectionIdSchema, SectionCopyOutSchema),
  sections: z.partialRecord(SectionIdSchema, SectionStateSchema),
  current: SectionIdSchema.nullable(),
})
export type LandingSession = z.infer<typeof LandingSessionSchema>

export function emptySession(id: string, view: LandingSession['view']): LandingSession {
  return {
    id, view, inputs: {}, productCanonicalUrl: null, visualSystem: null, testimonials: [],
    selected: [...SECTION_IDS], copies: {}, sections: {}, current: null,
  }
}

export function latestVersion(s: LandingSession, id: SectionId): SectionVersion | null {
  return s.sections[id]?.versions.at(-1) ?? null
}

/** Error con mensaje en español apto para mostrar al usuario. Cualquier otro error se muestra genérico. */
export class UserError extends Error {}
