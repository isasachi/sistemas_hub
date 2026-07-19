import { generateImage } from '@/lib/gemini'
import type { CastingSpec } from './types'

// Avatares de testimonios (motor híbrido). Genera 3 retratos de clientes DISTINTOS, informados por
// el casting de la campaña (mismo mercado/demografía, personas diferentes). Se generan una vez y se
// cachean en la sesión; la sección testimonios los compone como <img>. $0-rule OK (Gemini).

const VARIANTS = [
  'age 22-30, long dark hair',
  'age 30-40, wavy brown hair',
  'age 25-35, straight black hair, glasses',
]

export async function generateAvatars(casting?: CastingSpec | null): Promise<(string | null)[]> {
  const who = casting?.gender === 'masculino' ? 'man' : casting?.gender === 'mixto' ? 'person' : 'woman'
  return Promise.all(
    VARIANTS.map((v) =>
      generateImage(
        [{ text: `Photorealistic headshot of ONE real Latin-American ${who}, ${v}, natural non-idealized skin with real texture, warm candid genuine smile, plain soft neutral studio background, looking into the camera. A DIFFERENT, distinct ordinary person (not a model). NOT an illustration, cartoon or 3D render. Render ZERO text, logos or watermarks.` }],
        3,
        { aspectRatio: '1:1' },
      ).then((b) => b || null),
    ),
  )
}
