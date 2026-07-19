import { z } from 'zod'
import { TypePairId } from './typography-catalog'

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
// los llena el USUARIO en el wizard. `paymentMethods` es un enum porque cada valor mapea a un
// SVG real de la librería de devices (Fase 0) — es lo que hace posible el ADN de confianza (los
// logos por difusión salen deformados). garantia/cta-final consumen este bloque directamente.
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

// ─── Marca derivada del producto (Fase 3) ────────────────────────────────────
// `DerivedBrand` se resuelve UNA vez por sesión (etapa 2→3), es editable por el usuario
// en el wizard y tiene DOS consumidores: tokens CSS para la composición Satori (theme.ts)
// y descripción textual para el prompt de escena (instructions.ts). Supera a
// `palette`/`typography` (legado + canal del handoff de branding) cuando existe.

// Familia cromática del NICHO — la atmósfera no sale de los píxeles del packaging (el frasco
// blanco de un suplemento no "sabe" que su nicho es azul-pureza). El LLM la clasifica.
export const NicheCode = z.enum([
  'salud-clinico',   // azul-blanco, pureza    → suplementos, skincare
  'fitness-energia', // negro-naranja-lima     → deporte, quemadores
  'belleza-premium', // nude-dorado-crema      → cosmética, joyería
  'hogar-calido',    // terracota-beige        → cocina, decoración
  'tech-limpio',     // gris-azul brillante    → gadgets, electrónica
  'bebe-pastel',     // pastel suave           → bebé, maternidad
])
export type NicheCode = z.infer<typeof NicheCode>

// Casting del talento: demografía como DATO (no texto libre) → la misma persona en todas las
// secciones. `present:false` = producto solo (gadget de auto, herramienta) sin beneficiario.
export const CastingSpecSchema = z.object({
  present:    z.boolean(),
  ageRange:   z.enum(['18-25', '25-35', '35-50', '50-65', '65+']).optional(),
  gender:     z.enum(['femenino', 'masculino', 'mixto']).optional(),
  appearance: z.string().max(120).optional(), // rasgos latinoamericanos, piel real, etc.
  context:    z.string().max(60).optional(),  // baño, cocina, gimnasio, exterior
  wardrobe:   z.string().max(60).optional(),
  expression: z.string().max(60).optional(),  // serena y segura / enérgica
})
export type CastingSpec = z.infer<typeof CastingSpecSchema>

export const DerivedBrandSchema = z.object({
  niche:     NicheCode,
  palette:   LandingStyleSchema.shape.palette, // reusa el shape actual (1-6 colores con rol)
  typePair:  TypePairId,                        // ENUM CERRADO del catálogo (Fase 0), nunca texto libre
  casting:   CastingSpecSchema,
  sceneMood: z.string().max(160),               // reemplazo estructurado de brand_style suelto → prompt de escena
})
export type DerivedBrand = z.infer<typeof DerivedBrandSchema>

// Sección renderizada: copy + imagen.
export interface LandingSection {
  type: SectionType
  order: number
  copy: SectionCopy
  imageUrl: string | null
  status: 'pending' | 'done'
  // Secciones híbridas: URL de la ESCENA cruda (plato de fondo de Gemini, pre-Satori). Se
  // cachea para re-componer el texto/precio a $0 (renderComposite) sin re-generar imagen.
  sceneUrl?: string | null
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
  // Marca derivada del producto (Fase 3): nicho, paleta fusionada, par tipográfico del catálogo,
  // casting del talento y mood de escena. Resuelto una vez (etapa 2→3), editable, alimenta
  // composición (tokens) y prompt de escena (texto). Supera a palette/typography. Ver DerivedBrand.
  derived_brand: DerivedBrand | null
  // Placa canónica del talento (Fase 4): retrato del beneficiario generado UNA vez desde el
  // CastingSpec, sobre fondo neutro. Se pasa como referencia a todas las secciones para que la
  // persona no cambie entre ellas. Null si el producto no lleva persona (casting.present=false).
  talent_canonical_url: string | null
}
