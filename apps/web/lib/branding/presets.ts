/**
 * presets.ts — FUENTE ÚNICA DE VERDAD de la dirección visual.
 * ---------------------------------------------------------------------------
 * El usuario toma 4 decisiones (qué vende, cómo se llama, para quién, qué
 * estilo); todo lo demás — paleta, tipografía, dirección visual — está
 * precomputado acá. No hay pantalla de paleta ni de tipografía: si un valor
 * de diseño no está en este archivo, no existe.
 *
 * `promptStyle` es el fragmento de dirección que el pipeline inyecta en los
 * prompts; se escribe en inglés porque los prompts del motor son en inglés.
 * ---------------------------------------------------------------------------
 */

export type PresetId =
  | 'clinical_premium'
  | 'luxury_minimal'
  | 'botanical_apothecary'
  | 'soft_modern'
  | 'warm_editorial'
  | 'performance_dark'
  | 'heritage_craft'

export type Category = 'suplementos' | 'skincare' | 'cabello' | 'mascotas' | 'bebida' | 'otro'

export interface Preset {
  id: PresetId
  /** etiqueta visible, en español */
  label: string
  /** 1 línea, se muestra en la pantalla de confirmación */
  signature: string
  palette: { primary: string; secondary: string; accent: string; dark: string; light: string }
  typography: { display: string; body: string }
  /** ruta pública de la miniatura del selector */
  thumbnail: string
  /** 5 rutas públicas: referencias de estilo para el motor */
  moodboard: string[]
  /** dirección visual inyectada en los prompts (inglés) */
  promptStyle: string
  /** ordena la grilla de 1.4 según la categoría del brief */
  affinity: Category[]
}

/** Las 5 rutas de moodboard de un preset (convención: ref-1..5.jpg). */
function moodboardOf(id: PresetId): string[] {
  return [1, 2, 3, 4, 5].map((n) => `/presets/${id}/ref-${n}.jpg`)
}

export const PRESETS: Preset[] = [
  {
    id: 'clinical_premium',
    label: 'Clínico y preciso',
    signature: 'Blanco de laboratorio, azul medido y aire: se lee como algo probado.',
    palette: { primary: '#F4F4F1', secondary: '#C9D4DA', accent: '#4A7FA5', dark: '#0E1A24', light: '#FFFFFF' },
    typography: { display: 'Space Grotesk', body: 'Inter' },
    thumbnail: '/presets/clinical_premium/thumb.png',
    moodboard: moodboardOf('clinical_premium'),
    promptStyle:
      'Clinical premium: matte white surfaces, generous negative space, a single measured blue accent, '
      + 'thin geometric sans lettering with wide tracking, one hairline rule as the only ornament, '
      + 'soft even studio light, absolutely no illustration or texture.',
    affinity: ['suplementos', 'skincare'],
  },
  {
    id: 'luxury_minimal',
    label: 'Mínimo de lujo',
    signature: 'Negro mate sobre crema, serif fina y nada más: caro por lo que calla.',
    palette: { primary: '#0B0B0B', secondary: '#3A3A38', accent: '#8C7A5B', dark: '#0B0B0B', light: '#EDE7DE' },
    typography: { display: 'Cormorant Garamond', body: 'Inter' },
    thumbnail: '/presets/luxury_minimal/thumb.png',
    moodboard: moodboardOf('luxury_minimal'),
    promptStyle:
      'Luxury minimal: matte black packaging on a warm cream backdrop, high-contrast serif wordmark in '
      + 'small caps with very wide letter spacing, a discreet warm brass tone, deep quiet shadows, '
      + 'extreme restraint — no icons, no patterns, no gradients.',
    affinity: ['skincare', 'cabello'],
  },
  {
    id: 'botanical_apothecary',
    label: 'Botánico de boticario',
    signature: 'Frasco ámbar y etiqueta de botica: hierbas con formalidad de farmacia antigua.',
    // El fondo crema de la miniatura (#EFE0C4) es solo de la foto: NO va en la paleta.
    palette: { primary: '#1E3A2B', secondary: '#EFE6D2', accent: '#C8862B', dark: '#2B2118', light: '#F7F2E6' },
    typography: { display: 'Libre Baskerville', body: 'Inter' },
    thumbnail: '/presets/botanical_apothecary/thumb.png',
    moodboard: moodboardOf('botanical_apothecary'),
    promptStyle:
      'Botanical apothecary: amber glass and kraft-cream label stock, deep forest green ink, a thin '
      + 'double-rule frame around the type, classic transitional serif with small caps, restrained '
      + 'botanical line engraving, aged pharmacy formality — never cute or hand-drawn.',
    affinity: ['cabello', 'skincare'],
  },
  {
    id: 'soft_modern',
    label: 'Suave y contemporáneo',
    signature: 'Rosados y salvia con curvas redondas: cercano, limpio, nada infantil.',
    palette: { primary: '#F2D9D0', secondary: '#A8C3C0', accent: '#E8C97A', dark: '#4A4540', light: '#FBF8F4' },
    typography: { display: 'Nunito', body: 'Nunito' },
    thumbnail: '/presets/soft_modern/thumb.png',
    moodboard: moodboardOf('soft_modern'),
    promptStyle:
      'Soft modern: dusty pink and sage colour blocking split by one large organic curve, rounded '
      + 'geometric sans in lowercase, generous padding, flat matte finish, warm neutral background, '
      + 'friendly but grown-up — no cartoon characters, no outlines.',
    affinity: ['mascotas', 'skincare'],
  },
  {
    id: 'warm_editorial',
    label: 'Cálido y editorial',
    signature: 'Terracota y serif alto de revista: producto que se lee como portada.',
    palette: { primary: '#C4633F', secondary: '#8A9A6B', accent: '#E8B86D', dark: '#2E2A25', light: '#F0E4D2' },
    typography: { display: 'Fraunces', body: 'Inter' },
    thumbnail: '/presets/warm_editorial/thumb.png',
    moodboard: moodboardOf('warm_editorial'),
    promptStyle:
      'Warm editorial: terracotta and olive on a sand backdrop, tall high-contrast display serif set '
      + 'large and stacked across two lines, magazine-cover hierarchy, one thin rule separating the '
      + 'descriptor, soft daylight, uncoated paper feel.',
    affinity: ['bebida', 'suplementos'],
  },
  {
    id: 'performance_dark',
    label: 'Potente y oscuro',
    signature: 'Negro, naranja y condensada gigante: grita rendimiento desde el estante.',
    palette: { primary: '#121212', secondary: '#3D3D3D', accent: '#FF4D14', dark: '#121212', light: '#E8E8E8' },
    typography: { display: 'Oswald', body: 'Inter' },
    thumbnail: '/presets/performance_dark/thumb.png',
    moodboard: moodboardOf('performance_dark'),
    promptStyle:
      'Performance dark: black matte container, oversized condensed uppercase wordmark filling the '
      + 'width, one screaming orange band holding the descriptor, hard edges, high contrast, gym-shelf '
      + 'aggression — no gradients, no glow, no chrome.',
    affinity: ['suplementos', 'bebida'],
  },
  {
    id: 'heritage_craft',
    label: 'Artesanal de autor',
    signature: 'Kraft, verde profundo y slab serif: receta de casa, hecha a mano.',
    palette: { primary: '#B8865B', secondary: '#2C3E2D', accent: '#D94F2B', dark: '#1A1A18', light: '#F5EFE3' },
    typography: { display: 'Bitter', body: 'Inter' },
    thumbnail: '/presets/heritage_craft/thumb.png',
    moodboard: moodboardOf('heritage_craft'),
    promptStyle:
      'Heritage craft: uncoated kraft paper packaging, deep green slab-serif wordmark stacked in two '
      + 'lines, a single-weight line-art emblem inside a circle above the name, one small burnt-orange '
      + 'accent mark, honest workshop feel — printed in two inks, nothing glossy.',
    affinity: ['mascotas', 'cabello'],
  },
]

export const PRESET_IDS = PRESETS.map((p) => p.id)

export function getPreset(id: PresetId): Preset {
  const p = PRESETS.find((x) => x.id === id)
  if (!p) throw new Error(`Preset desconocido: ${id}`)
  return p
}

export function isPresetId(v: string): v is PresetId {
  return PRESETS.some((p) => p.id === v)
}

/** Orden de la grilla de 1.4: los presets afines a la categoría primero, estable dentro de cada grupo. */
export function presetsForCategory(category: Category | null): Preset[] {
  if (!category) return PRESETS
  return [...PRESETS].sort(
    (a, b) => Number(b.affinity.includes(category)) - Number(a.affinity.includes(category)),
  )
}
