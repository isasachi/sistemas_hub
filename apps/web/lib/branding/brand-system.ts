import { z } from 'zod'
import type { Part } from '@google/genai'
import { callStructured } from '@/lib/gemini'
import { fetchAsBase64 } from '@/lib/storage'
import { NICHE_TYPOGRAPHY } from '@/lib/landing/niches'

// ADN de marca (decisión 2026-08-07, análisis en
// docs/superpowers/specs/2026-08-07-landing-branding-como-sistema-analisis.md).
//
// POR QUÉ EXISTE: el refactor 2026-08-06 dejó branding names-only a propósito (`selected_palette`
// guarda NOMBRES; los hex los elige el modelo dentro de la imagen). Así que no hay hex duro que
// persistir: esto los LEE del board de identidad ya generado y los guarda como dato. Es el
// almacenamiento de la opción (B) con la epistemología de la (a) — no lo tipeó nadie.
//
// Se extrae del board de IDENTIDAD porque es la pieza de la que derivan todas las demás (logo,
// etiqueta, mockup se generan con el board adjunto): es la única lectura que representa a la marca
// entera y no a una pieza suelta.

// Catálogo CERRADO de tipografía = la unión de los nombres de NICHE_TYPOGRAPHY (decisión #5). Ojo:
// ese mapa es nicho→fuente, no un catálogo; usarlo como tal significa exactamente esta unión. En el
// camino de DIFUSIÓN los nombres son solo texto del prompt (no hay .ttf bundleado), así que un
// nombre fuera de la lista no rompe nada — el enum existe para que el modelo elija de un set
// conocido en vez de inventar, no para evitar tofu.
export const BRAND_FONTS: string[] = [
  ...new Set(
    Object.values(NICHE_TYPOGRAPHY)
      .flatMap((t) => [t.font_family, t.font_accent])
      .filter((f): f is string => !!f),
  ),
].sort()

const FontName = z.enum(BRAND_FONTS as [string, ...string[]])

// Espeja `ColorRole`/`PaletteColor` de `types.ts` (ahí es un tipo TS; acá hace falta un enum zod).
// No se importa de allá para no crear un ciclo: `types.ts` ya importa el TIPO de este módulo.
export const BrandRole = z.enum(['primary', 'secondary', 'accent', 'neutral', 'background'])

// #RRGGBB estricto: la landing deriva LUMINANCIA de estos hex (polaridad clara/oscura y el loop de
// contraste). Un shorthand `#abc` o un `rgb()` romperían ese cálculo en silencio.
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex debe ser #RRGGBB')

// Polaridad EXPLÍCITA, no inferida de la luminancia del rol `background`.
// POR QUÉ: el board de identidad se genera con "clean layout, editorial product photography"
// (`generation.ts` STYLE) y NADA ata su lienzo a la marca. Ese fondo es la superficie de
// presentación del board, no una decisión de marca — inferir polaridad de ahí devolvería `light`
// casi siempre y la decisión #9 (marca oscura → landing oscura) fallaría en silencio justo en las
// marcas que existe para servir. Así que se le pregunta al modelo, mirando las superficies de la
// MARCA (etiqueta, envase, lockup), no el lienzo.
export const BrandPolarity = z.enum(['light', 'dark'])

// Mitad ESTILÍSTICA del "Nivel 2" (decisión #1): lo que hoy sale de `NICHE_FALLBACK` y pasa a
// mandarlo la marca. NO incluye `particle_type` ni `props` — esos son FÁCTICOS (salen de los
// ingredientes y el material del envase por visión) y que la marca los pise contradiría las reglas
// de fidelidad de producto. `none` colapsa el viejo par `particles_on:false` + densidad.
export const BrandHalo = z.enum(['radial_soft', 'rays', 'backlight', 'rim', 'none'])
export const BrandParticles = z.enum(['none', 'low', 'medium', 'high'])

export const BrandSystemSchema = z.object({
  palette: z.array(z.object({ hex: Hex, name: z.string().max(40), role: BrandRole })).min(2).max(6),
  polarity: BrandPolarity,
  font_family: FontName,
  font_accent: FontName.nullable(),
  halo: BrandHalo,
  particles: BrandParticles,
})
  // La landing pinta el fondo del degradado con el rol `background`; sin él no hay de dónde sacarlo.
  // Se exige en el schema para que la falta dispare el retry de callStructured, no un default
  // silencioso aguas abajo.
  .refine((d) => d.palette.some((c) => c.role === 'background'), {
    message: 'la paleta debe incluir un color con rol background',
  })
export type BrandSystem = z.infer<typeof BrandSystemSchema>

const PROMPT = [
  'Esta imagen es el board de identidad de una marca. Extrae su sistema de diseño.',
  '',
  'IMPORTANTE: el board se presenta sobre un lienzo limpio que NO es una decisión de la marca.',
  'Mirá las superficies de la MARCA — la etiqueta, el envase, el lockup, los bloques de color de la',
  'paleta — y ignorá el lienzo del board al decidir qué es de la marca y qué es presentación.',
  '',
  'palette: de 2 a 6 colores que DEFINEN la marca, cada uno con su hex exacto (#RRGGBB), un nombre',
  'corto en español y su rol. Roles: `background` = el color sobre el que la MARCA se apoya en sus',
  'propias superficies (OBLIGATORIO, exactamente uno); `primary` = el color principal de la marca;',
  '`accent` = el color de énfasis / llamado a la acción; `secondary` y `neutral` = apoyos. Lee los',
  'colores REALES, no los idealices ni los "limpies": si la etiqueta es casi negra, devolvé casi',
  'negro. Ignora los colores de una foto de producto embebida o de una sombra.',
  '',
  'polarity: `dark` si la marca se lee OSCURA (sus superficies son oscuras y el texto encima va',
  'claro), `light` si se lee CLARA. Decidilo por las superficies de la marca, NUNCA por el lienzo',
  'del board — un board sobre lienzo blanco puede perfectamente ser una marca oscura.',
  '',
  'font_family: la fuente del catálogo que MÁS se parece a la tipografía del board (su carácter:',
  'geométrica, humanista, condensada, serif, redondeada). font_accent: una segunda del catálogo SOLO',
  'si el board usa claramente dos tipografías distintas; si usa una sola, devolvé null.',
  '',
  'halo: cómo ilumina la marca a su sujeto. `radial_soft` = resplandor suave y difuso detrás;',
  '`rays` = rayos de luz; `backlight` = contraluz fuerte y dramático; `rim` = filo de luz en el',
  'borde, look técnico; `none` = luz plana, sin halo.',
  '',
  'particles: cuánta materia flotante admite la estética de la marca. `none` = una marca limpia y',
  'sobria, sin nada flotando; `low`/`medium`/`high` = de sutil a abundante. Es una decisión de',
  'ESTILO de la marca, no del producto.',
].join('\n')

// Extrae el ADN de marca del board de identidad. Lanza si la visión falla tras los reintentos de
// `callStructured` — el caller decide (en el flujo de generación NO debe tumbar la corrida).
export async function extractBrandSystem(identityUrl: string): Promise<BrandSystem> {
  const { data, mimeType } = await fetchAsBase64(identityUrl)
  const parts: Part[] = [
    { inlineData: { mimeType, data } },
    { text: `${PROMPT}\n\nCatálogo de fuentes (elegí SOLO de acá): ${BRAND_FONTS.join(', ')}` },
  ]
  // preferGemini: es una tarea de visión sobre una imagen generada y Gemini flash la resuelve más
  // barato que OpenAI. El fallback del helper cubre la caída.
  return callStructured('brand_system_extract', BrandSystemSchema, parts, 3, undefined, { preferGemini: true })
}
