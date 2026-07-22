import { callStructured } from '@/lib/gemini'
import { ExtractedStyleSchema, type ExtractedStyle } from './types'
import { STYLE_PRESETS } from './style-presets'
import type { Part } from '@google/genai'

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

