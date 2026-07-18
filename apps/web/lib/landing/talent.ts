import { generateImage } from '@/lib/gemini'
import type { CastingSpec, DerivedBrand } from './types'

// Fase 4 C4.1. Placa canónica del TALENTO: un retrato de referencia generado UNA vez por
// sesión desde el CastingSpec, sobre fondo neutro liso. Se pasa como referencia a todas las
// secciones para que la persona no cambie entre ellas (como el producto canónico en F2). Es
// una PLACA, no una escena: fondo neutro a propósito. $0-rule OK (Gemini, no Anthropic).

// Construye el prompt del retrato. Todo casting-driven; el nicho solo matiza el wardrobe si el
// casting no lo especifica. Pide rasgos reales no idealizados — es lo que hace creíbles las
// referencias del ADN (una cara "de stock IA" delata el creativo).
function buildTalentPrompt(casting: CastingSpec, brand: DerivedBrand): string {
  const bits = [
    casting.ageRange && `age ${casting.ageRange}`,
    casting.gender,
    casting.appearance,
    casting.wardrobe && `wearing ${casting.wardrobe}`,
    casting.expression && `${casting.expression} expression`,
  ].filter(Boolean).join(', ')
  return [
    `Generate a HALF-BODY PORTRAIT of ONE real Latin-American person to be used as the fixed talent reference for a Peruvian e-commerce campaign${bits ? `: ${bits}` : ''}.`,
    `Plain, smooth, evenly-lit NEUTRAL background (soft light grey/beige, no scenery, no props, no furniture). Soft, directional studio lighting. The person faces the camera, looking into the lens, natural relaxed posture, head and torso in frame.`,
    `REAL, non-idealized features: visible skin texture, pores, freckles or fine lines as appropriate to the age, natural hair, believable body — NOT an airbrushed, glossy or "AI stock" look. A real Peruvian person you would meet, photographed well.`,
    `This is a REFERENCE PLATE, not an ad: render ZERO text, letters, numbers, logos, watermarks, captions or graphics anywhere in the image. No product, no packaging.`,
    // brand para coherencia tonal sutil (no un mandato de escena — el fondo es neutro).
    brand.sceneMood ? `Overall tone consistent with: ${brand.sceneMood}. Keep the background neutral regardless.` : ``,
  ].filter(Boolean).join('\n')
}

// Genera la placa de talento (base64) o null si el producto no lleva persona. El caller sube a
// Storage y persiste talent_canonical_url. 3:4 retrato (como pide la fase).
export async function generateTalent(casting: CastingSpec, brand: DerivedBrand): Promise<string | null> {
  if (!casting.present) return null
  const b64 = await generateImage([{ text: buildTalentPrompt(casting, brand) }], 3, { aspectRatio: '3:4' })
  return b64 || null
}
