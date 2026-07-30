import { z } from 'zod'

// ─── ADN de marca ───────────────────────────────────────────────────────────
// El subconjunto estructural que consumen contrast.ts y generation-prompts.ts.
// Lo satisfacen tanto los presets fijos (legado) como cualquier ExtractedStyle,
// así que los constructores de prompt no necesitan saber de dónde vino el ADN.

export type ColorRole = 'primary' | 'secondary' | 'accent' | 'neutral' | 'background'

export interface PaletteColor {
  hex: string
  name: string
  role: ColorRole
}

export interface Typography {
  /** Estilo del wordmark / titular */
  primary: string
  /** Texto de apoyo (claims, ingredientes, legal) */
  secondary: string
  /** Caja tipográfica dominante */
  case: 'uppercase' | 'lowercase' | 'title' | 'mixed'
  /** Detalle distintivo del lettering */
  detail: string
}

export interface BrandDna {
  /** alma del estilo en una línea */
  essence: string
  /** descriptores para inyección en prompt (orden = prioridad) */
  keywords: string[]
  palette: PaletteColor[]
  typography: Typography
  /** sustratos y acabados típicos */
  materials: string[]
  /** escena fotográfica (NO layout de etiqueta — eso vive en ExtractedLayout) */
  composition: string
  /** iluminación para renders y mockups */
  lighting: string
  mood: string[]
  motifs: string[]
  /** anti-patrones estilísticos (los de layout viven en ExtractedLayout.avoidLayout) */
  avoid: string[]
  /** párrafo natural listo para inyectar en Gemini */
  styleBlock: string
}

/** Une nombre + hex de la paleta en un fragmento de texto para prompts. */
export function paletteToText(palette: PaletteColor[]): string {
  return palette.map((c) => `${c.name} (${c.hex}, ${c.role})`).join(', ')
}

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
  source_mode: 'preset' | 'template' | 'upload' | null
  /** modo plantilla: id del catálogo (`templates.ts`) */
  template_id: string | null
  /** índice de la paleta elegida dentro de las 3 del ADN */
  palette_variant: number | null
  /** modo upload: las paletas derivadas de la imagen del usuario */
  palette_options: PaletteColor[][] | null
  style_id: string | null
  product_type: string | null
  descriptor: string | null
  tagline: string | null
  container_type: string | null
  uploaded_image_url: string | null
  image_analysis: ExtractedStyle | null
  uploaded_wireframe_url: string | null
  preset_version: number | null
  generation_status: 'pending' | 'logo' | 'label' | 'mockup' | 'done' | 'failed' | null
  generation_error: string | null
}

// ─── Modo B (upload): estilo + layout extraídos de la imagen del usuario ──────
// Migración: modo upload es un EXTRACTOR de identidad completa (paleta,
// tipografía, styleBlock...) Y composición (layout) — no un clasificador. El
// `layout` es un `ExtractedLayout` y se usa directo como tal (ver `dna-source.ts`
// `resolveLayout`).
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

/** Bloque de layout listo para inyectar en el prompt. */
export function layoutToPrompt(l: ExtractedLayout): string {
  return [
    `Front panel layout — follow this spatial structure exactly, top to bottom: ${l.anatomy.join('; ')}.`,
    // Sólo geometría: `logoPlacement` es texto crudo del extractor y en varias
    // plantillas trae juicios de escala ("centered PROMINENTLY, MODERATE size")
    // que chocan de frente con la regla del panel — la marca es subordinada al
    // hero (ver brandBandLine). Misma precedencia que ya rige al wireframe: el
    // esqueleto manda en zona/proporción, el resto lo gobierna el texto de arriba.
    `Brand/logo zone (position and room only — its scale and typographic treatment are governed above): ${l.logoPlacement}.`,
    `Product data block: ${l.dataBlock}.`,
    `Margins: ${l.margins}. Dominant alignment: ${l.alignment}.`,
  ].join(' ')
}
