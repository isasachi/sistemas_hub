import { z } from 'zod'

// ─── Etapa 2: Dirección de marca (gate de aprobación) ────────────────────────

export const PaletteColorSchema = z.object({
  name: z.string(),        // "Terracota cálido"
  hex: z.string(),         // "#C75B39"
  usage: z.string(),       // "Color principal — botones, acentos de marca"
})
export type PaletteColor = z.infer<typeof PaletteColorSchema>

export const TypographySchema = z.object({
  headline: z.string(),    // familia tipográfica para titulares
  body: z.string(),        // familia para cuerpo de texto
  rationale: z.string(),   // por qué encaja con la marca
})
export type Typography = z.infer<typeof TypographySchema>

export const DirectionSchema = z.object({
  concept: z.string(),                          // concepto/vibe en una frase
  rationale: z.string(),                         // por qué esta dirección para esta marca
  palette: z.array(PaletteColorSchema).min(3).max(6),
  typography: TypographySchema,
  logoDirection: z.string(),                    // cómo debería verse/sentirse el logo
  summaryForUser: z.string(),                   // resumen amable en español para mostrar
})
export type Direction = z.infer<typeof DirectionSchema>

// ─── Sesión (forma de respuesta de la API) ──────────────────────────────────

export interface BrandingSessionResponse {
  id: string
  created_at: string
  step: number
  // brief
  brand_name: string | null
  product_category: string | null
  target_audience: string | null
  personality: string[] | null
  brief_notes: string | null
  // dirección
  direction: Direction | null
  // logo
  logo_options: string[] | null
  logo_url: string | null
  // etiqueta
  label_brief: string | null
  label_url: string | null
  // mockup
  container_mode: 'describe' | 'upload' | null
  container_desc: string | null
  container_url: string | null
  mockup_url: string | null
}
