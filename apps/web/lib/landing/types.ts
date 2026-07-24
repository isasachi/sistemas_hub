import { z } from 'zod'

// ─── Catálogo de secciones ───────────────────────────────────────────────────
// El orden del enum NO es el orden de la landing — ese lo define `order` por sesión.
export const SectionType = z.enum([
  'hero',
  'oferta',
  'antes-despues',
  'beneficios',
  'testimonios',
  'faq',
  'garantia',
  'cta-final',
])
export type SectionType = z.infer<typeof SectionType>

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero',
  oferta: 'Oferta',
  'antes-despues': 'Antes y después',
  beneficios: 'Beneficios',
  testimonios: 'Testimonios',
  faq: 'Preguntas frecuentes',
  garantia: 'Garantía',
  'cta-final': 'Llamado final',
}

// ─── Nicho y demografía (spec 2026-07-23, Anexos A/B) ────────────────────────
export const NicheId = z.enum([
  'supplement_skin_female', 'skincare_topical', 'haircare',
  'fitness_weightloss', 'supplement_male_performance',
  'joint_mobility', 'intimate_wellness', 'herbal_natural',
  'baby_maternity', 'pets', 'home_cleaning',
  'tech_gadgets', 'kitchen_tools', 'jewelry_fashion',
  'automotive', 'generic',
])
export type NicheId = z.infer<typeof NicheId>

export const DemographicId = z.enum([
  'female_18_30', 'female_30_45', 'female_45_plus',
  'male_20_35', 'male_35_55', 'senior_55_plus', 'no_talent',
])
export type DemographicId = z.infer<typeof DemographicId>

// Salida del paso 0.a (clasificación). Zod rechaza cualquier valor fuera del set.
export const NicheClassification = z.object({
  niche_id: NicheId,
  demographic_id: DemographicId,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(200),
})
export type NicheClassification = z.infer<typeof NicheClassification>

// Densidad de partículas (spec 0.b C).
export const ParticleDensity = z.enum(['low', 'medium', 'high'])
export const Halo = z.enum(['radial_soft', 'rays', 'backlight', 'rim', 'none'])

// Paleta derivada por fórmula (spec 0.b B). color_body es rgba (opacidad 70%).
export const PaletteTokensSchema = z.object({
  color_headline: z.string(),
  color_accent: z.string(),
  color_body: z.string(),
  bg_start: z.string(),
  bg_end: z.string(),
  color_surface: z.string(),
  color_icon: z.array(z.string()).length(4),
})
export type PaletteTokens = z.infer<typeof PaletteTokensSchema>

// ADN de la sesión (spec 0.b F): fuente única de verdad para las 8 secciones.
// `poses` mapea cada sección seleccionada a una pose única del banco (Anexo B).
export const LandingDnaSchema = z.object({
  brand_base: z.object({ hex: z.string(), h: z.number(), s: z.number(), l: z.number() }),
  palette: PaletteTokensSchema,
  particle_type: z.string(),
  particle_density: ParticleDensity,
  particles_on: z.boolean().default(true),   // el nicho activa/desactiva partículas de fondo (motor de plantillas)
  props: z.array(z.string()).min(1).max(5),
  font_family: z.string(),
  font_accent: z.string().nullable(),
  halo: Halo,
  model_persona: z.string(),
  // clave = SectionType slug; valor = descripción de pose. Parcial: solo las secciones elegidas.
  poses: z.record(z.string(), z.string()),
})
export type LandingDna = z.infer<typeof LandingDnaSchema>

// Puente slug interno ↔ lenguaje del spec + archivo de plantilla curada en Storage
// (bucket ad-uploads, prefijo landing-templates/, subidas por scripts/seed-landing-templates.ts;
// Task 4 — reemplaza al viejo landing-refs/ del motor DNA, ver seed-landing-templates.ts).
export const SECTION_SPEC_KEY: Record<SectionType, string> = {
  hero: 'hero_problem', beneficios: 'benefits', 'antes-despues': 'before_after',
  testimonios: 'testimonials', faq: 'faq', garantia: 'guarantee',
  oferta: 'offer', 'cta-final': 'cta_final',
}
export const SECTION_REF: Record<SectionType, string> =
  Object.fromEntries(SectionType.options.map((s) => [s, `${SECTION_SPEC_KEY[s]}.png`])) as Record<SectionType, string>

// ─── Copy por sección (gate de aprobación) ───────────────────────────────────
// Un esquema flexible cubre los 8 tipos: el LLM rellena solo los campos que aplican.
// Los `.max()` son la primera línea de defensa contra texto largo ilegible en la
// imagen (la segunda es el bloque de disciplina de texto en instructions.ts).
export const SectionCopySchema = z.object({
  type: SectionType,
  headline: z.string().max(60),
  // Sub-cadena EXACTA del headline a resaltar en color de marca (ADN: 1 palabra/frase acento).
  accentWord: z.string().max(40).optional(),
  subheadline: z.string().max(90).optional(),
  // bullets: lista genérica. En `antes-despues` = columna ANTES (problemas). En otras, lista suelta.
  bullets: z.array(z.string().max(40)).max(6).optional(),
  // bulletsAfter: SOLO `antes-despues` = columna DESPUÉS (resultados). Emparejada con bullets.
  bulletsAfter: z.array(z.string().max(40)).max(6).optional(),
  // cards: testimonios ({title="Nombre, Ciudad", body=reseña}) · FAQ ({title=pregunta, body=respuesta})
  //        · beneficios ({title=beneficio, body=detalle de una línea}). Hasta 6 (FAQ llega a 5).
  cards: z.array(z.object({ title: z.string().max(40), body: z.string().max(90) })).max(6).optional(),
  // Campos del motor de plantillas (2026-07-23). Opcionales: cada sección llena los que aplican.
  kicker: z.string().max(40).optional(),        // subtítulo dorado con guiones (beneficios/antes-despues/testimonios/oferta)
  closingBold: z.string().max(40).optional(),   // beneficios: frase bold de la closing_card
  closingSub: z.string().max(90).optional(),    // beneficios: subcopy de la closing_card
  closingStrip: z.string().max(60).optional(),  // antes-despues: franja de cierre (reemplaza trust_bar)
  socialProof: z.string().max(90).optional(),   // testimonios: banda de prueba social
  ctaHeadline: z.string().max(30).optional(),   // cta-final: titular del bloque CTA (mayúsculas)
  ctaSub: z.string().max(90).optional(),        // cta-final: subcopy del bloque CTA
  cta: z.string().max(25).optional(),
})
export type SectionCopy = z.infer<typeof SectionCopySchema>

// La llamada de copy devuelve TODAS las secciones elegidas, en orden.
export const LandingCopySchema = z.object({
  sections: z.array(SectionCopySchema),
})

// ─── Copy de Oferta (motor híbrido, Fase 1) ──────────────────────────────────
// En el híbrido el texto lo compone Satori, así que la oferta deja de ser una string y
// pasa a ser datos ricos: tiers con precio ancla, ahorro, costo por unidad y decoy.
export const OfferTierSchema = z.object({
  label: z.string().max(20),                    // "3 Frascos"
  price: z.string().max(12),                    // "S/ 199"
  priceBefore: z.string().max(12).optional(),   // precio ancla → "S/ 507"
  savingsPct: z.number().int().min(1).max(90).optional(),
  perUnit: z.string().max(28).optional(),       // "S/ 0.7 por cápsula"
  badge: z.string().max(16).optional(),         // "Mejor valor"
  cta: z.string().max(18),
  featured: z.boolean(),                         // el decoy destacado
})
export type OfferTier = z.infer<typeof OfferTierSchema>

// ── Oferta a nivel de SESIÓN (Fase 5 C5.1) ──────────────────────────────────
// Los tiers (con decoy) subieron del copy de UNA sección a la SESIÓN: así el hero y el
// cta-final referencian el tier destacado sin poder contradecirlo, y validateSet tiene una
// sola fuente de precios. `.min(2)` + `.refine(1 featured)` fuerzan estructuralmente el decoy.
export const OfferSchema = z.object({
  tiers: z.array(OfferTierSchema).min(2).max(4),
  urgency: z.string().max(30).optional(),        // "Solo hoy"
}).refine((d) => d.tiers.filter((t) => t.featured).length === 1, {
  message: 'exactamente un tier debe ser featured',
})
export type Offer = z.infer<typeof OfferSchema>

// Copy PROPIO de la sección Oferta: solo su texto. Los tiers/urgency viven en OfferSchema
// (sesión); la sección los CONSUME vía resolveOffer, no los posee.
export const OfferCopySchema = z.object({
  // enum (no literal): z.toJSONSchema emite `const` para literal y Gemini lo IGNORA (solo
  // respeta `enum`) → el modelo omitía `type` y fallaba la validación. enum de un valor lo fuerza.
  type: z.enum(['oferta']),
  headline: z.string().max(60),
  subheadline: z.string().max(90).optional(),
})
export type OfferCopy = z.infer<typeof OfferCopySchema>

// Schema de GENERACIÓN: una sola llamada LLM produce copy + tiers; el caller lo parte en
// session.offer (tiers/urgency) y session.offer_copy (headline/subheadline). También valida el
// offer_copy LEGADO (pre-F5 guardaba los tiers acá) → resolveOffer los recupera de ahí.
export const OfferGenSchema = z.object({
  type: z.enum(['oferta']),
  headline: z.string().max(60),
  subheadline: z.string().max(90).optional(),
  urgency: z.string().max(30).optional(),
  tiers: z.array(OfferTierSchema).min(2).max(4),
}).refine((d) => d.tiers.filter((t) => t.featured).length === 1, {
  message: 'exactamente un tier debe ser featured',
})
export type OfferGen = z.infer<typeof OfferGenSchema>

// Compat (invariante #6): sesiones pre-F5 guardaron los tiers dentro de offer_copy. Devuelve el
// Offer de la sesión, cayendo a esos tiers legados mientras `offer` siga null.
export function resolveOffer(session: Pick<LandingSessionResponse, 'offer' | 'offer_copy'>): Offer | null {
  const cur = OfferSchema.safeParse(session.offer)
  if (cur.success) return cur.data
  const legacy = OfferGenSchema.safeParse(session.offer_copy)
  return legacy.success ? { tiers: legacy.data.tiers, urgency: legacy.data.urgency } : null
}

// ── Bloque de CONFIANZA (Fase 5 C5.2) ───────────────────────────────────────
// Hechos OPERATIVOS del negocio: un modelo no puede inferirlos y no debe inventarlos, así que
// los llena el USUARIO en el wizard. `paymentMethods` es un enum para acotar el prompt a marcas
// reconocibles: en `oferta` el modelo DIBUJA los logos exactos de estos métodos (decisión
// 2026-07-23, ver `paymentLogosText` en instructions.ts); `garantia` deja la banda inferior
// limpia sin logos (ver `PAYMENT_BAND`). garantia/cta-final consumen este bloque directamente.
export const PaymentMethod = z.enum([
  'yape', 'plin', 'mercadopago', 'visa', 'mastercard', 'efectivo', 'transferencia',
])
export type PaymentMethod = z.infer<typeof PaymentMethod>

export const TrustBlockSchema = z.object({
  codDelivery:    z.boolean(),                                   // pago contraentrega
  deliveryTime:   z.string().max(24).optional(),                 // "24/48 horas"
  coverage:       z.array(z.string().max(20)).max(4).optional(), // ["Perú", "EE.UU."]
  paymentMethods: z.array(PaymentMethod).max(7),
  guaranteeDays:  z.number().int().min(0).max(365).optional(),
  guaranteeText:  z.string().max(60).optional(),
  freeShipping:   z.boolean().default(false),
})
export type TrustBlock = z.infer<typeof TrustBlockSchema>

// ─── Estilo de marca (paleta + tipografía) ───────────────────────────────────
// Predomina sobre la plantilla en la generación de imagen. Mismo shape que
// `direction.palette`/`direction.typography` del branding → el handoff mapea directo.
export const LandingStyleSchema = z.object({
  palette: z.array(z.object({
    name: z.string(),
    hex: z.string(),
    usage: z.string().optional(),
  })).min(1).max(6),
  typography: z.object({ headline: z.string(), body: z.string() }),
})
export type LandingStyle = z.infer<typeof LandingStyleSchema>
export type LandingPalette = LandingStyle['palette']
export type LandingTypography = LandingStyle['typography']

// Sección renderizada: copy + imagen.
export interface LandingSection {
  type: SectionType
  order: number
  copy: SectionCopy
  imageUrl: string | null
  status: 'pending' | 'done'
}

// ─── Sesión (forma de respuesta de la API) ───────────────────────────────────
export interface LandingSessionResponse {
  id: string
  created_at: string
  step: number
  product_name: string | null
  price: string | null
  benefits: string | null
  audience: string | null
  tone: string[] | null
  product_photo_urls: string[] | null
  template: string | null
  selected_sections: SectionType[] | null
  copy: SectionCopy[] | null
  sections: LandingSection[] | null
  palette: LandingPalette | null
  typography: LandingTypography | null
  // Estilo gráfico de marca (concept + logoDirection del branding en el handoff tool-to-tool):
  // guía los devices/motivos que el modelo genera. Null en el flujo de producto suelto.
  brand_style: string | null
  // Ancla de producto: render limpio de la 1ª sección generada, reusado como Imagen 1 en las
  // demás secciones para que el producto salga IDÉNTICO (consistencia) con todos sus labels
  // reales (fidelidad). Se cachea una vez; null hasta que se genera la primera sección.
  product_canonical_url: string | null
  // Texto exacto de las etiquetas impresas en el producto (una línea por renglón), tipeado
  // por el usuario. Ground-truth para el prompt de imagen → el modelo renderiza las palabras
  // correctas en vez de confabular texto ilegible de la foto. Null = copiar de la foto.
  product_labels: string | null
  // Copy propio de la sección Oferta (headline/subheadline). Lo compone Satori. Null = la
  // sesión aún no generó la oferta híbrida. En sesiones pre-F5 también trae tiers/urgency. Ver OfferCopy.
  offer_copy: OfferCopy | null
  // Oferta a nivel de sesión (Fase 5): tiers de precio con decoy + urgency. Fuente única de
  // precios — la sección Oferta la consume (resolveOffer), hero/cta-final referencian el tier
  // destacado. Null en sesiones pre-F5 (los tiers siguen en offer_copy → resolveOffer los recupera).
  offer: Offer | null
  // Bloque de confianza (Fase 5): hechos operativos del negocio (contraentrega, medios de pago,
  // plazo, cobertura, garantía). Lo llena el USUARIO en el wizard, no el LLM. Ver TrustBlock.
  trust_block: TrustBlock | null
  // Origen de la placa canónica (Fase 2): 'photo' = derivada de la foto real en etapa 2;
  // 'render' (legado) o null = recortada del render de la 1ª sección. Ver product-box.ts.
  product_canonical_source: string | null
  // Placa canónica del talento (Fase 4): retrato del beneficiario generado UNA vez desde el
  // casting del talento, sobre fondo neutro. Se pasa como referencia a todas las secciones para
  // que la persona no cambie entre ellas. Null si el producto no lleva persona.
  talent_canonical_url: string | null
  // Avatares de testimonios: 3 retratos de clientes DISTINTOS, generados una vez y cacheados,
  // que la sección testimonios compone como <img> (Satori no genera caras). Null hasta generarlos.
  testimonial_avatars: string[] | null
  // Nicho y demografía confirmados por el usuario (paso 0.a). Escalares: se fijan ANTES de la
  // extracción. Null hasta que el wizard los confirma en Identidad.
  niche_id: NicheId | null
  demographic_id: DemographicId | null
  // ADN visual (paso 0.b): paleta por fórmula, partículas, props, tipografía, halo, persona y
  // poses. Fuente única para las 8 secciones. Null en sesiones legadas → el wizard re-extrae.
  landing_dna: LandingDna | null
}
