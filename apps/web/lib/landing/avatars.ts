import { generateImage } from '@/lib/gemini'
import { DEMOGRAPHIC_PERSONA } from './demographics'
import type { DemographicId } from './types'

// Avatares de testimonios (motor híbrido) → paso 0.b (spec 2026-07-23). Genera 3 retratos de
// clientes DISTINTOS basados en DEMOGRAPHIC_PERSONA[demographic]: misma demografía (edad/rasgos)
// que el talento de la campaña, pero rostros y outfit propios — NO son el mismo cliente
// clonado, ni el talento repetido. Se generan una vez y se cachean en la sesión; la sección
// testimonios los compone como <img>. $0-rule OK (Gemini).

// Un rasgo distintivo por avatar (cabello/encuadre) para que las 3 caras no salgan clonadas,
// manteniendo edad/rasgos de la demografía intactos vía `persona`.
const VARIANT_TRAITS = [
  'distinctive short-to-medium hairstyle, close-up framing',
  'a different hairstyle and face shape from the other two customers, medium framing',
  'yet another distinct hairstyle and facial structure, slight 3/4 angle, close-up framing',
]

// no_talent: sin talento en la campaña → sin caras de testimonios tampoco.
export async function generateAvatars(demographic: DemographicId): Promise<(string | null)[]> {
  if (demographic === 'no_talent') return []
  const persona = DEMOGRAPHIC_PERSONA[demographic]
  return Promise.all(
    VARIANT_TRAITS.map((trait) =>
      generateImage(
        [{
          text: `Photorealistic headshot of ONE real Latin-American person matching this profile: ${persona}. ${trait}. Own everyday casual outfit (do NOT repeat the exact same clothing/accessories as other people in this set). Natural non-idealized skin with real texture, warm candid genuine smile, plain soft neutral studio background, looking into the camera. A DIFFERENT, distinct ordinary customer testimonial photo — not a model, not the same face or person twice. NOT an illustration, cartoon or 3D render. Render ZERO text, logos or watermarks.`,
        }],
        3,
        { aspectRatio: '1:1' },
      ).then((b) => b || null),
    ),
  )
}
