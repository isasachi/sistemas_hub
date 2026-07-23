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
  preset_version: number | null
  generation_status: 'pending' | 'mockup' | 'deriving' | 'done' | 'failed' | null
  generation_error: string | null
}

// ─── Modo B (upload): estilo extraído de la imagen del usuario ────────────────
// Migración fase 10: modo upload es solo un CLASIFICADOR — decide a cuál de los
// 7 estilos de identidad fija se parece más la imagen (bestFitStyleId); ya no
// extrae paleta/tipografía/etc (identidad fija = siempre la del preset).
export const ExtractedStyleSchema = z.object({
  bestFitStyleId: z.string(),
  essence: z.string(),
  keywords: z.array(z.string()),
})
export type ExtractedStyle = z.infer<typeof ExtractedStyleSchema>
