import { z } from 'zod'
import type { PaletteColor, Typography } from './style-presets'

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
  // logo
  logo_options: string[] | null
  logo_url: string | null
  // etiqueta
  label_brief: string | null
  label_data: LabelData | null
  label_url: string | null
  // mockup
  container_mode: 'describe' | 'upload' | null
  container_desc: string | null
  container_url: string | null
  mockup_url: string | null
  mockup_options: string[] | null
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
