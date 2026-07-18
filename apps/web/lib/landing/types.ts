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

// ─── Copy por sección (gate de aprobación) ───────────────────────────────────
// Un esquema flexible cubre los 8 tipos: el LLM rellena solo los campos que aplican.
// Los `.max()` son la primera línea de defensa contra texto largo ilegible en la
// imagen (la segunda es el bloque de disciplina de texto en instructions.ts).
export const SectionCopySchema = z.object({
  type: SectionType,
  headline: z.string().max(60),
  subheadline: z.string().max(90).optional(),
  bullets: z.array(z.string().max(40)).max(5).optional(),
  // cards: testimonios ({title=autor, body=reseña}) · FAQ ({title=pregunta, body=respuesta})
  cards: z.array(z.object({ title: z.string().max(40), body: z.string().max(90) })).max(4).optional(),
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

// `.min(2)` + `.refine(1 featured)` fuerzan ESTRUCTURALMENTE el decoy del ADN — deja de
// depender de que el LLM se acuerde. Si no cumple, callStructured reintenta (maxRetries=3).
export const OfferCopySchema = z.object({
  // enum (no literal): z.toJSONSchema emite `const` para literal y Gemini lo IGNORA (solo
  // respeta `enum`) → el modelo omitía `type` y fallaba la validación. enum de un valor lo fuerza.
  type: z.enum(['oferta']),
  headline: z.string().max(60),
  subheadline: z.string().max(90).optional(),
  urgency: z.string().max(30).optional(),        // "Solo hoy"
  tiers: z.array(OfferTierSchema).min(2).max(4),
}).refine((d) => d.tiers.filter((t) => t.featured).length === 1, {
  message: 'exactamente un tier debe ser featured',
})
export type OfferCopy = z.infer<typeof OfferCopySchema>

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
  // Copy estructurado de la Oferta híbrida (tiers/precio ancla/decoy). Lo compone Satori.
  // Null = la sesión aún no generó la oferta híbrida (motor viejo intacto). Ver OfferCopy.
  offer_copy: OfferCopy | null
}
