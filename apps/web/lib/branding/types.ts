import { z } from 'zod'
import type { PaletteColor, Typography } from './style-presets'

// ─── Etapa 2: Dirección de marca (gate de aprobación) ────────────────────────
// Nota: tipos Direction-específicos con "usage" y "rationale". Renombrados
// para evitar conflicto con los tipos de style-presets (que usamos en el nuevo flujo).

export const DirectionPaletteColorSchema = z.object({
  name: z.string(),        // "Terracota cálido"
  hex: z.string(),         // "#C75B39"
  usage: z.string(),       // "Color principal — botones, acentos de marca"
})
export type DirectionPaletteColor = z.infer<typeof DirectionPaletteColorSchema>
// Backward compat alias — código antiguo que importa PaletteColor de types.ts
export const PaletteColorSchema = DirectionPaletteColorSchema

export const DirectionTypographySchema = z.object({
  headline: z.string(),    // familia tipográfica para titulares
  body: z.string(),        // familia para cuerpo de texto
  rationale: z.string(),   // por qué encaja con la marca
})
export type DirectionTypography = z.infer<typeof DirectionTypographySchema>
// Backward compat alias — código antiguo que importa Typography de types.ts
export const TypographySchema = DirectionTypographySchema

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
  logo: z.string().optional(), // cómo construir el LOGO en ese estilo (mark/lockup) — opcional (compat)
  typography: z.string(),
  spacing: z.string(),
  components: z.string(),
  layout: z.string(),
  personality: z.string(),
})

export const DirectionSchema = z.object({
  concept: z.string(),                          // concepto/vibe en una frase
  rationale: z.string(),                         // por qué esta dirección para esta marca
  palette: z.array(DirectionPaletteColorSchema).min(3).max(6),
  typography: DirectionTypographySchema,
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
  // ── flujo por estilo (refactor 2026-07) ──
  source_mode: 'preset' | 'upload' | null
  style_id: string | null
  product_type: string | null
  descriptor: string | null
  tagline: string | null
  container_type: string | null
  uploaded_image_url: string | null
  image_analysis: ExtractedStyle | null
  selected_palette: PaletteColor[] | null
  selected_typography: Typography | null
}

// ─── Modo B (upload): estilo extraído de la imagen del usuario ────────────────
// Misma forma que StylePreset MENOS meta (id/index/name/referenceFolder), MÁS
// bestFitStyleId. Lo produce style-extract.analyzeUploadedStyle (Gemini vision).
export const ExtractedPaletteColorSchema = z.object({
  hex: z.string(),
  name: z.string(),
  role: z.enum(['primary', 'secondary', 'accent', 'neutral', 'background']),
})
export const ExtractedTypographySchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  case: z.enum(['uppercase', 'lowercase', 'title', 'mixed']),
  detail: z.string(),
})
export const ExtractedStyleSchema = z.object({
  essence: z.string(),
  keywords: z.array(z.string()),
  palette: z.array(ExtractedPaletteColorSchema).min(3).max(6),
  typography: ExtractedTypographySchema,
  materials: z.array(z.string()),
  composition: z.string(),
  lighting: z.string(),
  mood: z.array(z.string()),
  motifs: z.array(z.string()),
  avoid: z.array(z.string()),
  styleBlock: z.string(),
  bestFitStyleId: z.string(),
})
export type ExtractedStyle = z.infer<typeof ExtractedStyleSchema>

// Paleta/tipo elegidos en el paso 3 (o extraídos en modo B). Reusa las formas del preset.
export const SelectedPaletteSchema = z.array(ExtractedPaletteColorSchema).min(3).max(6)
export const SelectedTypographySchema = ExtractedTypographySchema
