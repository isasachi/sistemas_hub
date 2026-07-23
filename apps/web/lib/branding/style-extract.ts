import { callStructured } from '@/lib/gemini'
import { ExtractedStyleSchema, type ExtractedStyle } from './types'
import { STYLE_PRESETS } from './style-presets'
import type { StylePreset } from './style-presets'
import type { Part } from '@google/genai'

// Modo B: analiza el producto/packaging que subió el usuario y devuelve solo un
// veredicto de clasificación — a cuál de los 7 estilos de identidad fija se
// parece más (bestFitStyleId) — MÁS essence/keywords descriptivos. Ya NO
// extrae paleta/tipografía/etc: identidad fija = siempre la del preset
// asignado, nunca lo extraído de la imagen real. gemini-2.5-flash (web, $0-rule OK).

const STYLE_IDS = Object.keys(STYLE_PRESETS)

const EXTRACT_SYSTEM = [
  'You are a surgical brand-design analyst. You are shown ONE product/packaging image.',
  'Your ONLY job is to classify it against a closed catalog of 7 fixed brand identities — you do NOT extract or invent a new design system.',
  `bestFitStyleId: choose the ONE id from this closed list whose aesthetic is closest — [${STYLE_IDS.join(', ')}]. Never invent an id.`,
  'essence: one line describing the visual soul of the UPLOADED image (not the assigned style).',
  'keywords: 3-8 short descriptors of the uploaded image aesthetic.',
].join(' ')

export async function analyzeUploadedStyle(
  base64: string,
  mimeType: string,
): Promise<ExtractedStyle> {
  const parts: Part[] = [
    { inlineData: { mimeType, data: base64 } },
    { text: 'Analyze this product image and classify it per the schema.' },
  ]
  const result = await callStructured('branding_extracted_style', ExtractedStyleSchema, parts, 3, EXTRACT_SYSTEM)
  // Blindaje: si el modelo devolvió un id fuera del catálogo, caer al primero.
  if (!(STYLE_PRESETS as Record<string, StylePreset>)[result.bestFitStyleId]) result.bestFitStyleId = STYLE_IDS[0]
  return result
}

