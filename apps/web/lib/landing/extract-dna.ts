import { z } from 'zod'
import type { Part } from '@google/genai'
import { callStructured } from '@/lib/gemini'
import { fetchAsBase64 } from '@/lib/storage'
import { hslToHex, derivePalette, paletteFromBrand } from './palette-derive'
import { NICHE_TYPOGRAPHY, NICHE_FALLBACK } from './niches'
import { DEMOGRAPHIC_PERSONA, NO_TALENT_SUBSTITUTE, assignPoses } from './demographics'
import {
  Polarity,
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
  // Polaridad del producto suelto (2026-08-07): viaja SEPARADA del color a propósito. El hue no la
  // implica, y un envase negro/blanco cae además al fallback de nicho por baja saturación (s<12),
  // así que sin este campo la señal se perdería dos veces.
  polarity: Polarity,
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
  'Decide además si el producto se lee OSCURO o CLARO (polarity): `dark` si su envase y su etiqueta',
  'son de tonos oscuros y el texto impreso encima va claro (frasco negro mate, ámbar oscuro, lata',
  'negra); `light` si el envase y la etiqueta son claros con texto oscuro encima. Juzgá el ENVASE,',
  'nunca el fondo de la foto ni la iluminación del estudio: un frasco negro fotografiado sobre fondo',
  'blanco es `dark`.',
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
  const brand = session.brand_system
  const extraction = await runVision(session, niche)

  // PRECEDENCIA (decisión #4, 2026-08-07): la MARCA gana sobre el nicho. Cuando hay sistema de
  // marca, él manda paleta, polaridad, tipografía, halo y densidad de partículas; el nicho pasa a
  // ser el fallback del producto suelto. Lo que la marca NO manda es lo FÁCTICO — `particle_type` y
  // `props` salen de los ingredientes y el material del envase (visión), porque pisarlos
  // contradiría las reglas de fidelidad de producto.

  // A + fallback cascada de color: envase blanco/negro/plateado/transparente (s<12) o visión
  // fallida → hue por defecto del nicho con s/l sintéticos (Anexo C).
  const brand_base =
    extraction && extraction.brand_base.s >= 12
      ? extraction.brand_base
      : { h: fallback.hue, s: 70, l: 50, hex: hslToHex(fallback.hue, 70, 50) }

  // C: partículas vagas/genéricas o visión fallida → fallback del nicho. El TIPO es fáctico (sale
  // del producto), pero la DENSIDAD es estilística → la marca la manda, y su `none` apaga.
  const particle_type = extraction?.particle_type?.trim() ? extraction.particle_type : fallback.particles
  const particle_density = brand && brand.particles !== 'none'
    ? brand.particles
    : extraction?.particle_density ?? fallback.particle_density
  const particles_on = brand ? brand.particles !== 'none' : fallback.particles_on

  // D: props vacíos o visión fallida → familia de props del nicho (un solo elemento, mínimo 1).
  const props = extraction?.props?.length ? extraction.props : [fallback.propsFamily]

  // B: paleta por MAPEO DE ROLES si hay marca; si no, por fórmula sobre el único hue de la visión.
  // En ninguno de los dos caminos se le pide al modelo que elija colores.
  // La polaridad del producto suelto sobrevive al fallback de color: un envase negro mate cae al
  // hue del nicho por s<12, pero sigue siendo una pieza oscura. Sin visión → 'light' (histórico).
  const palette = brand ? paletteFromBrand(brand) : derivePalette(brand_base, extraction?.polarity ?? 'light')

  // E: tipografía/halo — de la marca si la hay, si no por lookup de nicho.
  const { font_family, font_accent } = brand
    ? { font_family: brand.font_family, font_accent: brand.font_accent }
    : NICHE_TYPOGRAPHY[niche]
  const halo = brand ? brand.halo : fallback.halo
  const model_persona = demographic === 'no_talent' ? NO_TALENT_SUBSTITUTE[niche] : DEMOGRAPHIC_PERSONA[demographic]
  const poses = assignPoses(order, demographic)

  const dna: LandingDna = {
    brand_base,
    palette,
    particle_type,
    particle_density,
    particles_on,
    props,
    font_family,
    font_accent,
    halo,
    model_persona,
    poses,
  }
  return LandingDnaSchema.parse(dna)
}
