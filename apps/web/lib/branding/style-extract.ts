import { callStructured } from '@/lib/gemini'
import { DesignDnaSchema, type DesignDna } from './types'
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
