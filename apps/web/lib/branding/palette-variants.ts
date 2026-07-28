/**
 * palette-variants.ts
 * ---------------------------------------------------------------------------
 * Segunda pasada de extracción sobre una imagen de producto: el tipo de envase
 * (que el prompt de mockup necesita) y 2 paletas ALTERNATIVAS a la de la foto.
 *
 * Las alternativas conservan la LÓGICA de la paleta original — misma cantidad
 * de colores, mismos roles, misma relación de contraste — y cambian el color.
 * Así las 3 variantes son intercambiables sin romper la legibilidad, que es lo
 * que `contrast.ts` le promete al prompt de la etiqueta.
 *
 * Lo comparten `scripts/seed-branding-templates.ts` (las 30 plantillas) y la
 * ruta `analyze` (la referencia que sube el usuario).
 * ---------------------------------------------------------------------------
 */
import { z } from 'zod'
import { callStructured } from '@/lib/gemini'
import { legalTextPairs } from './contrast'
import type { PaletteColor } from './types'
import type { Part } from '@google/genai'

const PaletteColorSchema = z.object({
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'hex debe ser #RRGGBB'),
  name: z.string(),
  role: z.enum(['primary', 'secondary', 'accent', 'neutral', 'background']),
})

export const TemplateExtrasSchema = z.object({
  containerType: z.string(),
  variants: z.array(z.array(PaletteColorSchema).min(3).max(6)).length(2),
})
export type TemplateExtras = z.infer<typeof TemplateExtrasSchema>

/**
 * ¿Esta paleta permite poner microtexto legal legible? Es la misma pregunta que
 * `contrastToPrompt` le hace al ADN antes de generar la etiqueta: si no hay ni
 * un par texto/fondo >= 4.5:1, el prompt sale sin instrucción de legibilidad.
 */
export function hasLegalPair(palette: PaletteColor[]): boolean {
  return legalTextPairs({ palette }).length > 0
}

const EXTRAS_SYSTEM = [
  'You are a packaging design analyst. You are shown ONE product image and told its current color palette.',
  '',
  'containerType: describe, in Spanish, concretely and briefly, the SPECIFIC physical container or support you',
  'can actually see in THIS photo — never the generic or typical container for this kind of product. Write it as',
  'ONE natural, flowing Spanish noun phrase (never a list of parts, never joined with "+" or separated by',
  'brackets) that folds in, in this order of priority: the material, the form, the closure or dispensing',
  'mechanism (only if one is visible), and any other distinguishing feature actually visible. Name the closure or',
  'dispensing mechanism ONLY IF the photo actually shows one: bomba/dispensador (pump), gotero (dropper), spray,',
  'tapa flip (flip-cap), tapa rosca (screw-cap), cierre zip (zip). Many containers — a heat-sealed sachet, a flat',
  'pouch, a tear-open single-use pack — have NO reclosure mechanism at all: if you cannot actually see a cap,',
  'pump, zip or similar in the image, do not invent one — say so plainly (e.g. "sellado, sin cierre visible") or',
  'simply omit that part of the description instead of guessing. Singular/plural MUST match what is actually in',
  'frame — say plural only if the photo shows more than one unit of that container, and keep this consistent',
  'with what you say elsewhere about how the product is arranged. Never reuse the wording of this instruction\'s',
  'own examples verbatim — they illustrate the SHAPE of a good answer, not a menu to pick from. Before committing',
  'to your answer, re-check it against the pixels: if it is a bare packaging noun with no material or closure',
  'detail attached, that is a sign you defaulted to a generic label instead of describing the photo — look again',
  'and be specific about what is actually there.',
  '',
  'variants: propose EXACTLY 2 ALTERNATIVE color palettes for this same product.',
  'Each variant MUST keep the STRUCTURE of the original palette: the same number of colors, the same set of',
  'roles in the same proportion, and a comparable light/dark distribution. Change the hues, not the system.',
  'EXACTLY ONE color per variant must have role "background".',
  'Every variant MUST contain at least one text/background pair with a WCAG contrast ratio of 4.5:1 or higher —',
  'this is a hard requirement, a palette that fails it is unusable.',
  'Each color needs a hex in #RRGGBB form and a short descriptive name in Spanish.',
  'The two variants must be clearly different from the original and from each other.',
].join(' ')

/**
 * Frases que una versión anterior de `EXTRAS_SYSTEM` ofrecía como ejemplos de
 * `containerType`. Hallazgo 2026-07-27: el modelo copiaba estos ejemplos en vez
 * de describir la foto — 3/6 fotos de `belleza` salieron con copias literales,
 * una de ellas ("doypack con ventana" para un sachet plano sin ventana) fabricando
 * un envase que la foto no tiene. Sirven de guard determinista (offline, gratis):
 * si el modelo devuelve una de estas EXACTA, es señal de copia, no de descripción.
 */
export const CONTAINER_TYPE_EXAMPLE_PHRASES = [
  'frasco de vidrio esmerilado con gotero',
  'caja de cartón impresa con colgador',
  'doypack con ventana',
  'bolsa con cabecera de cartón',
  'tubo plástico',
]

function normalizeContainerType(s: string): string {
  return s.trim().toLowerCase()
}

/** ¿`containerType` es (probablemente) una copia literal de un ejemplo que el prompt ofreció alguna vez? */
export function isSuspectedExampleCopy(containerType: string): boolean {
  const norm = normalizeContainerType(containerType)
  return CONTAINER_TYPE_EXAMPLE_PHRASES.some((ex) => normalizeContainerType(ex) === norm)
}

export async function extractTemplateExtras(
  base64: string,
  mimeType: string,
  original: PaletteColor[],
): Promise<TemplateExtras> {
  const parts: Part[] = [
    { inlineData: { mimeType, data: base64 } },
    {
      text:
        `Current palette: ${original.map((c) => `${c.name} ${c.hex} (${c.role})`).join(', ')}. ` +
        'Identify the container and propose 2 alternative palettes per the schema.',
    },
  ]
  return callStructured('branding_template_extras', TemplateExtrasSchema, parts, 3, EXTRAS_SYSTEM)
}

/**
 * Las 3 paletas finales: la original primero, después las variantes que pasan
 * el contraste. Las que no pasan se descartan en silencio — el caller decide
 * si re-pide (el script lo hace) o se conforma con menos (la ruta `analyze`).
 * Si la original misma es ilegible, es un problema del ADN, no de las variantes:
 * se lanza, porque generar con ella produciría etiquetas ilegibles.
 */
export function buildPalettes(
  original: PaletteColor[],
  variants: PaletteColor[][],
): PaletteColor[][] {
  if (!hasLegalPair(original)) {
    throw new Error('La paleta original no tiene ningún par texto/fondo con contraste >= 4.5:1')
  }
  return [original, ...variants.filter(hasLegalPair)]
}
