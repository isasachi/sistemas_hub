import { callStructured } from '@/lib/gemini'
import { ExtractedStyleSchema, type ExtractedStyle } from './types'
import type { Part } from '@google/genai'

// EXTRACTOR de identidad completa (paleta, tipografía, materiales, composición,
// lighting, mood, motifs, styleBlock) Y de composición (layout: anatomy de zonas
// top-to-bottom, logoPlacement, dataBlock, margins, alignment, avoidLayout) a
// partir de UNA imagen de producto.
//
// Lo usan los dos caminos del sistema: el script de seed sobre las 30 fotos de
// plantilla (offline, commiteado) y la ruta `analyze` sobre la referencia que
// sube el usuario (en vivo). gemini-2.5-flash (web, regla de costo OK).
//
// Ya NO clasifica contra un catálogo cerrado de estilos: ese catálogo no existe.

const EXTRACT_SYSTEM = [
  'You are a surgical brand-design analyst. You are shown ONE product/packaging image.',
  'Your job is to extract a COMPLETE, reusable design identity AND its composition/layout from this image — describe the STYLE and STRUCTURE, never the literal product or brand name.',
  '',
  '(A) IDENTITY:',
  'palette: 3 to 6 colors, each with hex, a short descriptive name and a role (primary/secondary/accent/neutral/background). EXACTLY ONE color must have role "background". Include at least one clearly dark or clearly light neutral so there is at least one text/background pair with contrast ratio >= 4.5:1.',
  'typography: primary (wordmark/titular style), secondary (support text style), case (uppercase/lowercase/title/mixed), detail (distinctive lettering trait).',
  'materials: substrates/finishes visible or implied (paper, glass, matte plastic, foil, kraft, etc).',
  'composition: ONLY the photographic scene (product placement, backdrop, surface) — never label layout.',
  'lighting: the lighting setup for a studio product photo of this style.',
  'mood: 2-5 emotional/aesthetic states it evokes.',
  'motifs: 2-5 recurring graphic devices.',
  'avoid: stylistic anti-patterns — what must NOT appear in this style (colors, textures, tone).',
  'styleBlock: one ready-to-inject English paragraph describing this packaging design language for an image-generation prompt.',
  '',
  '(B) LAYOUT (composition of the front panel):',
  'layout.anatomy: an ordered array (top to bottom) of the visible zones/bands of the front panel. EVERY entry MUST include its height as a percentage of the panel in the literal form "(~N%)" (e.g. "banda de marca (~22%): nombre centrado"), and the percentages across all banded entries should sum to roughly 100. Non-banded structural entries (like a frame/border note) do not need a percentage.',
  'layout.logoPlacement: where the logo/wordmark sits and its approximate scale.',
  'layout.dataBlock: where ingredients/net-weight/legal microtext live.',
  'layout.margins: minimum breathing room, as % of panel width.',
  'layout.alignment: the dominant alignment axis — one of left, centered, justified.',
  'layout.avoidLayout: layout anti-patterns to avoid.',
  '',
  'essence: one line describing the visual soul of the image.',
  'keywords: 3-8 short descriptors of the image aesthetic.',
].join(' ')

export async function analyzeUploadedStyle(
  base64: string,
  mimeType: string,
): Promise<ExtractedStyle> {
  const parts: Part[] = [
    { inlineData: { mimeType, data: base64 } },
    { text: 'Analyze this product image and extract its identity + layout per the schema.' },
  ]
  return callStructured('branding_extracted_style', ExtractedStyleSchema, parts, 3, EXTRACT_SYSTEM)
}
