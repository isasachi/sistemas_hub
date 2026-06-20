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

// ─── Design DNA: extracción quirúrgica de estilo (refs del usuario + biblioteca) ──
// Mismo esquema para el extractor runtime (style-extract.ts, gemini-2.5-flash sobre
// la ref del usuario) y para las cards curadas (design-system.md). Altitud accionable
// (lo que el modelo de imagen PUEDE ejecutar), no medidas en píxeles.
export const DesignDnaSchema = z.object({
  typography: z.string(),   // familias, peso, caja, tracking, pairing — accionable
  palette: z.string(),      // hex + roles
  spacing: z.string(),      // densidad, ritmo, márgenes
  repetition: z.string(),   // motivos/elementos repetidos
  components: z.string(),   // badges/pills/cartuchos/sellos/tags
  layout: z.string(),       // reglas de layout, alineación, grilla, zonas
  personality: z.string(),  // identidad / personalidad visual
  logoDesc: z.string().optional(), // solo refs de LOGO: descripción quirúrgica del logo localizado en el mockup
})
export type DesignDna = z.infer<typeof DesignDnaSchema>

// Tokens de estilo del exemplar de la biblioteca curada (design-system.md) que el
// LLM eligió por use_case. Opcional (backward-compatible; direction es jsonb).
// Lo consume `instructions.ts` en el path SIN ref del usuario (baseline de calidad).
export const DesignSystemRefSchema = z.object({
  reference: z.string(),    // "NIBRAY (kids supplement)" — qué exemplar y por qué
  typography: z.string(),
  spacing: z.string(),
  components: z.string(),
  layout: z.string(),
  personality: z.string(),
})

export const DirectionSchema = z.object({
  concept: z.string(),                          // concepto/vibe en una frase
  rationale: z.string(),                         // por qué esta dirección para esta marca
  palette: z.array(PaletteColorSchema).min(3).max(6),
  typography: TypographySchema,
  logoDirection: z.string(),                    // cómo debería verse/sentirse el logo
  summaryForUser: z.string(),                   // resumen amable en español para mostrar
  designSystem: DesignSystemRefSchema.optional(), // exemplar curado que ancla el estilo
})
export type Direction = z.infer<typeof DirectionSchema>

// ─── Etiqueta: datos estructurados ──────────────────────────────────────────

export interface LabelData {
  packagingFormat: string         // "frasco de vidrio", "bolsa doypack", "pote 250ml"...
  ingredients: string             // texto libre de ingredientes/composición
  netWeight: string               // "100 g", "500 ml"
  units: string                   // "12 unidades", "1 unidad"
  highlight: string               // sabor / variedad / eslogan (opcional)
}

// ─── Sesión (forma de respuesta de la API) ──────────────────────────────────

export interface BrandingSessionResponse {
  id: string
  created_at: string
  step: number
  // brief
  brand_name: string | null
  product_name: string | null
  product_category: string | null
  target_audience: string | null
  personality: string[] | null
  brief_notes: string | null
  // dirección
  direction: Direction | null
  // logo
  logo_options: string[] | null
  logo_url: string | null
  logo_reference_url: string | null
  logo_reference_analysis: string | null
  // etiqueta
  label_brief: string | null
  label_data: LabelData | null
  label_reference_url: string | null
  label_reference_analysis: string | null
  label_url: string | null
  // mockup
  container_mode: 'describe' | 'upload' | null
  container_desc: string | null
  container_url: string | null
  mockup_url: string | null
}
