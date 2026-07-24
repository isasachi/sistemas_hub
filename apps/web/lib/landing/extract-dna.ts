import { z } from 'zod'
import type { Part } from '@google/genai'
import { callStructured } from '@/lib/gemini'
import { fetchAsBase64 } from '@/lib/storage'
import { hslToHex, derivePalette } from './palette-derive'
import { NICHE_TYPOGRAPHY, NICHE_FALLBACK } from './niches'
import { DEMOGRAPHIC_PERSONA, NO_TALENT_SUBSTITUTE, assignPoses } from './demographics'
import {
  LandingDnaSchema,
  ParticleDensity,
  type LandingDna,
  type NicheId,
  type DemographicId,
  type SectionType,
  type LandingSessionResponse,
} from './types'

// Paso 0.b del spec (2026-07-23), secciones A/C/D: UNA sola llamada de visión sobre la foto
// real del producto extrae el color de marca (A), las partículas (C) y los props (D). B
// (paleta) y E (tipografía/talento) NO se le piden al modelo — se calculan por fórmula/lookup
// (ver derivePalette, NICHE_TYPOGRAPHY, DEMOGRAPHIC_PERSONA/NO_TALENT_SUBSTITUTE/assignPoses).
const DnaExtractSchema = z.object({
  brand_base: z.object({ hex: z.string(), h: z.number(), s: z.number(), l: z.number() }),
  particle_type: z.string(),
  particle_density: ParticleDensity,
  props: z.array(z.string()).min(1).max(5),
})
type DnaExtract = z.infer<typeof DnaExtractSchema>

const PROMPT = [
  'Analiza el envase del producto, no el fondo de la foto. Identifica el color cromático',
  'dominante de la etiqueta, la tapa o el material del envase. Ignora blancos, grises, negros y',
  'cualquier color que provenga del fondo, la superficie o la iluminación. Devuelve ese color en',
  'HEX y en HSL (brand_base).',
  '',
  'A partir del producto y su categoría, describe qué partículas flotarían de forma físicamente',
  'creíble en su entorno. Deben pertenecer al registro sensorial del producto: su estado de la',
  'materia, su textura, sus ingredientes o su contexto de uso. Prohibido usar partículas',
  'genéricas sin relación con el producto (particle_type + particle_density: low/medium/high).',
  '',
  'Lee la línea de ingredientes y el formato del envase. Lista de 3 a 5 objetos físicos reales',
  'que representen esos ingredientes en su forma cruda o su origen, más el formato de consumo',
  'del producto. Cada prop debe poder apoyarse en una superficie o recostarse contra el envase.',
  'Nada abstracto, nada decorativo sin relación (props).',
].join('\n')

// Corre la visión (foto + niche/labels como contexto). null si no hay foto, falla la visión o
// agota los reintentos internos de callStructured — el caller aplica el fallback del Anexo C.
async function runVision(session: LandingSessionResponse, niche: NicheId): Promise<DnaExtract | null> {
  try {
    const photoUrl = session.product_photo_urls?.[0]
    if (!photoUrl) return null
    const { data, mimeType } = await fetchAsBase64(photoUrl)
    const ctx = [`Nicho: ${niche}`, session.product_labels && `Etiquetas: ${session.product_labels}`]
      .filter(Boolean)
      .join('\n')
    const parts: Part[] = [
      { inlineData: { mimeType, data } },
      { text: `${PROMPT}\n\n${ctx}` },
    ]
    return await callStructured('landing_dna_extract', DnaExtractSchema, parts)
  } catch {
    return null
  }
}

// Extrae el ADN visual de la sesión (paso 0.b). Una sola llamada de visión + fallback en
// cascada al Anexo C por campo (color / partículas / props) + lookups deterministas
// (paleta por fórmula, tipografía/halo por nicho, persona/poses por demografía).
export async function extractDna(
  session: LandingSessionResponse,
  niche: NicheId,
  demographic: DemographicId,
  order: SectionType[],
): Promise<LandingDna> {
  const fallback = NICHE_FALLBACK[niche]
  const extraction = await runVision(session, niche)

  // A + fallback cascada de color: envase blanco/negro/plateado/transparente (s<12) o visión
  // fallida → hue por defecto del nicho con s/l sintéticos (Anexo C).
  const brand_base =
    extraction && extraction.brand_base.s >= 12
      ? extraction.brand_base
      : { h: fallback.hue, s: 70, l: 50, hex: hslToHex(fallback.hue, 70, 50) }

  // C: partículas vagas/genéricas o visión fallida → fallback del nicho.
  const particle_type = extraction?.particle_type?.trim() ? extraction.particle_type : fallback.particles
  const particle_density = extraction?.particle_density ?? fallback.particle_density

  // D: props vacíos o visión fallida → familia de props del nicho (un solo elemento, mínimo 1).
  const props = extraction?.props?.length ? extraction.props : [fallback.propsFamily]

  // B: paleta SIEMPRE por fórmula — nunca se le pide al modelo que elija colores.
  const palette = derivePalette(brand_base)

  // E: tipografía/halo/persona/poses — por lookup, no por extracción.
  const { font_family, font_accent } = NICHE_TYPOGRAPHY[niche]
  const halo = fallback.halo
  const model_persona = demographic === 'no_talent' ? NO_TALENT_SUBSTITUTE[niche] : DEMOGRAPHIC_PERSONA[demographic]
  const poses = assignPoses(order, demographic)

  const dna: LandingDna = {
    brand_base,
    palette,
    particle_type,
    particle_density,
    particles_on: fallback.particles_on,
    props,
    font_family,
    font_accent,
    halo,
    model_persona,
    poses,
  }
  return LandingDnaSchema.parse(dna)
}
