import { generateImage } from '@/lib/gemini'
import type { DemographicId } from './types'

// Avatares de testimonios (motor híbrido) → paso 0.b (spec 2026-07-23). Genera 3 retratos de
// clientes DISTINTOS, informados por la demografía de la campaña (mismo mercado/demografía,
// personas diferentes). Se generan una vez y se cachean en la sesión; la sección testimonios
// los compone como <img>. $0-rule OK (Gemini).

const VARIANTS = [
  'age 22-30, long dark hair',
  'age 30-40, wavy brown hair',
  'age 25-35, straight black hair, glasses',
]

function whoFor(demographic: DemographicId): string {
  if (demographic.startsWith('female_')) return 'woman'
  if (demographic.startsWith('male_')) return 'man'
  return 'person' // senior_55_plus: mixto
}

// no_talent: sin talento en la campaña → sin caras de testimonios tampoco.
export async function generateAvatars(demographic: DemographicId): Promise<(string | null)[]> {
  if (demographic === 'no_talent') return []
  const who = whoFor(demographic)
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
