import { z } from 'zod'

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
  uploaded_wireframe_url: string | null
  preset_version: number | null
  generation_status: 'pending' | 'mockup' | 'deriving' | 'done' | 'failed' | null
  generation_error: string | null
}

// ─── Modo B (upload): estilo + layout extraídos de la imagen del usuario ──────
// Migración: modo upload es un EXTRACTOR de identidad completa (paleta,
// tipografía, styleBlock...) Y composición (layout) — no un clasificador. El
// `layout` tiene la MISMA forma que `LabelLayout` (label-layouts.ts) y se usa
// directo como tal (ver effective-preset.ts `resolveEffectiveLayout`).
export const ExtractedLayoutSchema = z.object({
  anatomy: z.array(z.string()).min(3),
  logoPlacement: z.string(),
  dataBlock: z.string(),
  margins: z.string(),
  alignment: z.enum(['left', 'centered', 'justified']),
  avoidLayout: z.array(z.string()),
})
export type ExtractedLayout = z.infer<typeof ExtractedLayoutSchema>

export const ExtractedStyleSchema = z.object({
  bestFitStyleId: z.string(),
  essence: z.string(),
  keywords: z.array(z.string()),
  palette: z.array(z.object({
    hex: z.string(),
    name: z.string(),
    role: z.enum(['primary', 'secondary', 'accent', 'neutral', 'background']),
  })).min(3).max(6),
  typography: z.object({
    primary: z.string(),
    secondary: z.string(),
    case: z.enum(['uppercase', 'lowercase', 'title', 'mixed']),
    detail: z.string(),
  }),
  materials: z.array(z.string()),
  composition: z.string(),
  lighting: z.string(),
  mood: z.array(z.string()),
  motifs: z.array(z.string()),
  avoid: z.array(z.string()),
  styleBlock: z.string(),
  layout: ExtractedLayoutSchema,
})
export type ExtractedStyle = z.infer<typeof ExtractedStyleSchema>
