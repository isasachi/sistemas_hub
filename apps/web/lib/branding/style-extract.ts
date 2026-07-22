import { callStructured } from '@/lib/gemini'
import { DesignDnaSchema, type DesignDna, ExtractedStyleSchema, type ExtractedStyle } from './types'
import { STYLE_PRESETS } from './style-presets'
import type { Part } from '@google/genai'

// Extracción QUIRÚRGICA de estilo de una referencia subida por el usuario (logo o
// etiqueta). gemini-2.5-flash (web, $0-rule OK: es Gemini, no Anthropic). Devuelve un
// Design DNA accionable que la generación de imagen luego replica + aplica la marca.
// Reemplaza al viejo analyzeReference (lobotomizado: prohibía colores → inútil).

const SYSTEM = [
  'You are a surgical brand-design analyst. You will be shown ONE reference image (a logo, a product label, or a product MOCKUP).',
  'Extract the transferable DESIGN DNA so another designer could rebuild the same visual system for a DIFFERENT brand.',
  'Be SURGICAL but at an ACTIONABLE altitude — describe what an image generator can act on ("bold condensed all-caps sans, tight tracking, white on color"), NOT pixel measurements.',
  'Capture: typography, color palette (hex + roles), spacing/density system, repeated motifs, component style (badges/pills/cartouches/seals/tags), layout rules, and overall visual personality.',
  'Describe the STYLE, not the literal product/flavor/brand-name — those will be swapped.',
].join(' ')

const FOCUS = {
  logo:
    'This reference is for a LOGO. If it is a clean logo, describe it directly. If it is a product photo/MOCKUP, LOCATE the actual brand logo printed on the packaging (it may be small, in a corner) and fill `logoDesc` with a surgical description of THAT logo: wordmark/mark, letterforms, case, weight, per-letter colors, and any pill/badge/cartouche it sits in — enough to redraw it for another brand name.',
  label:
    'This reference is for a product LABEL. Focus on its information layout, shelf-appeal structure, component style and density. If it is a mockup, analyze the label artwork on the package.',
}

export async function analyzeStyleReference(
  base64: string,
  mimeType: string,
  kind: 'logo' | 'label'
): Promise<DesignDna> {
  const parts: Part[] = [
    { inlineData: { mimeType, data: base64 } },
    { text: FOCUS[kind] },
  ]
  return callStructured('style_dna', DesignDnaSchema, parts, 3, SYSTEM)
}

// Parsea el Design DNA guardado en la columna (JSON string) de forma segura.
export function parseDesignDna(s: string | null | undefined): DesignDna | null {
  if (!s?.trim()) return null
  try {
    const r = DesignDnaSchema.safeParse(JSON.parse(s))
    return r.success ? r.data : null
  } catch { return null }
}

// Modo B: analiza el producto/packaging que subió el usuario y devuelve su estilo
// en la MISMA forma que los 12 presets (un "estilo 13"), MÁS bestFitStyleId (cuál de
// los 12 encaja mejor). gemini-2.5-flash (web, $0-rule OK). Paleta y tipografía se
// toman de la imagen real para alterar mínimo el producto final.

const STYLE_IDS = Object.keys(STYLE_PRESETS)

const EXTRACT_SYSTEM = [
  'You are a surgical brand-design analyst. You are shown ONE product/packaging image.',
  'Extract its transferable DESIGN DNA so an image generator can rebuild the same visual system for a DIFFERENT brand name.',
  'Return every field of the schema at an ACTIONABLE altitude (what an image model can execute), never pixel measurements.',
  'palette: 3-6 real colors read FROM THE IMAGE (hex + descriptive name + role). typography: describe the actual lettering seen. composition/lighting/materials/mood/motifs: infer from the image. avoid: 3-5 anti-patterns that would break this style. styleBlock: one natural-language paragraph ready to inject into an image prompt.',
  `bestFitStyleId: choose the ONE id from this closed list whose aesthetic is closest — [${STYLE_IDS.join(', ')}]. Never invent an id.`,
  'Describe the STYLE, not the literal product/flavor/brand-name — those will be swapped.',
].join(' ')

export async function analyzeUploadedStyle(
  base64: string,
  mimeType: string,
): Promise<ExtractedStyle> {
  const parts: Part[] = [
    { inlineData: { mimeType, data: base64 } },
    { text: 'Analyze this product image and return its full design DNA per the schema.' },
  ]
  const result = await callStructured('branding_extracted_style', ExtractedStyleSchema, parts, 3, EXTRACT_SYSTEM)
  // Blindaje: si el modelo devolvió un id fuera del catálogo, caer al primero.
  if (!STYLE_PRESETS[result.bestFitStyleId]) result.bestFitStyleId = STYLE_IDS[0]
  return result
}

export function parseExtractedStyle(s: string | null | undefined): ExtractedStyle | null {
  if (!s?.trim() && typeof s !== 'object') return null
  try {
    const obj = typeof s === 'string' ? JSON.parse(s) : s
    const r = ExtractedStyleSchema.safeParse(obj)
    return r.success ? r.data : null
  } catch { return null }
}
