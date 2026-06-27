import { callStructured } from '@/lib/gemini'
import { LandingStyleSchema, type LandingStyle } from './types'
import type { Part } from '@google/genai'

// Deriva paleta + tipografía de la foto del producto (sesión fresca de landing,
// sin handoff de branding). Mismo espíritu que branding/style-extract.ts pero el
// output alimenta la generación de imagen de las secciones (predomina sobre la
// plantilla). gemini-2.5-flash (web, $0-rule OK: es Gemini, no Anthropic).

const SYSTEM = [
  'You are a brand-design analyst. You will be shown ONE product photo.',
  'Extract an ACTIONABLE visual style an image generator can apply to a landing page built around this product:',
  '(1) the DOMINANT color palette as hex codes with a short role for each (1-6 colors), drawn from the product/packaging itself;',
  '(2) a TYPOGRAPHY pair as actionable descriptors (e.g. "bold condensed all-caps sans" for headlines, "clean humanist sans" for body), inferred from the product\'s look — NOT specific font file names.',
  'Be surgical but at an actionable altitude, never pixel measurements.',
].join(' ')

export async function extractLandingStyle(base64: string, mimeType: string): Promise<LandingStyle> {
  const parts: Part[] = [
    { inlineData: { mimeType, data: base64 } },
    { text: 'Extract the palette + typography for a landing page styled after this product.' },
  ]
  return callStructured('landing_style', LandingStyleSchema, parts, 3, SYSTEM)
}
