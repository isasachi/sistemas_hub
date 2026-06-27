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
}
