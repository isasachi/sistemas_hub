import { z } from 'zod'
import type { Part } from '@google/genai'
import { callStructured } from '@/lib/gemini'
import { fetchAsBase64 } from '@/lib/storage'
import { hslToHex, derivePalette, paletteFromBrand } from './palette-derive'
import { NICHE_TYPOGRAPHY, NICHE_FALLBACK } from './niches'
import { personaFor, NO_TALENT_SUBSTITUTE, assignPoses, DEMOGRAPHIC_LABELS, BODY_FOCUS_LABELS } from './demographics'
import {
  Polarity,
  LandingDnaSchema,
  ParticleDensity,
  type LandingDna,
  type NicheId,
  type DemographicId,
  type BodyFocus,
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
  // ⚠️ REQUERIDO, NUNCA `.nullish()`. Un campo nullish sale del `required` del JSON Schema y el
  // modelo lo omite en silencio: el eje entero quedaría en no-op con el síntoma idéntico al del
  // avatar genérico que vino a arreglar (ya pasó con `body_focus` en landing y con `style` en el
  // ADN de marca). El único fail-safe es que la visión ENTERA falle, y esa rama ya existe.
  talent: z.object({
    // Solo la CONSTITUCIÓN FÍSICA. Sexo, edad y peinado los manda `DEMOGRAPHIC_PERSONA` y el
    // usuario los eligió en el wizard: si el modelo pudiera escribirlos acá, un producto de
    // musculación devolvería "hombre musculoso" para una sesión de mujer 30-45.
    // ⚠️ El techo lleva HOLGURA DE COMPLETADO, misma lección que los ceilings del copy: el modelo
    // aplica maxLength al decodificar, así que un tope justo no acorta la frase — la CORTA. Medido
    // con 80: "…con desarrollo muscular visible en glúteos y," partida a mitad, y esa línea viaja
    // literal a las dos placas y a las 8 secciones. El prompt sigue pidiendo 2-8 palabras.
    physique: z.string().max(140),
    poses: z.array(z.string().max(200)).min(3).max(5),
    // El VESTUARIO era la tercera pata que seguía saliendo del nicho, ciega a la promesa: un
    // suplemento masculino vestía "camiseta deportiva ajustada o musculosa" fuera una creatina o
    // unas gomitas de melatonina. Medido sobre el caso reportado, la persona quedaba diciendo
    // "complexión común y sana, proyectando descanso, viste camiseta deportiva ajustada" — la misma
    // autocontradicción dentro de un solo string que este eje viene arreglando.
    wardrobe: z.string().max(140),
  }),
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
  'Nada abstracto, nada decorativo sin relación (props). Si abajo se declara el FORMATO del',
  'producto, ese dato manda sobre lo que la etiqueta sugiera: los props tienen que ser coherentes',
  'con ESE formato de consumo, y ninguno puede ser otro producto envasado ni un utensilio de un',
  'formato distinto (un vaso mezclador o una cuchara dosificadora no van con unas gomitas).',
  '',
  'Por último, decidí la COMPLEXIÓN y las POSES de la persona que protagoniza la pieza (talent).',
  'No hay una lista de casos: decidilo vos a partir de lo que este producto promete.',
  '',
  'talent.physique — la complexión la decide la PROMESA, no la categoría. Preguntate qué cuerpo',
  'hace CREÍBLE el resultado que este producto ofrece: si lo que promete es rendimiento o',
  'desempeño físico, el cuerpo tiene que leerse entrenado; si promete desarrollo o volumen',
  'muscular, con musculatura desarrollada y visible; si promete pérdida de grasa o figura, una',
  'constitución acorde al resultado que se está vendiendo; si lo que promete es descanso, calma,',
  'digestión, defensas o cualquier bienestar interno, una constitución común y sana, sin nada',
  'marcado — ahí un cuerpo atlético distrae de la promesa en vez de sostenerla. Sigue siendo una',
  'persona real y alcanzable, jamás un cuerpo de portada retocado.',
  'Escribí SOLO la constitución física, de 2 a 8 palabras. El sexo, la edad y el peinado ya están',
  'decididos y NO los podés tocar: tu texto los refina, nunca los reemplaza.',
  '',
  'talent.poses — 4 poses. Cada una es un MOMENTO REAL, no un retrato posando de catálogo. Elegí',
  'el momento con este criterio, en este orden:',
  '  1. Si el producto se APLICA o se USA sobre una parte del cuerpo, la persona lo está usando o',
  '     acaba de aplicarlo, y esa parte del cuerpo es lo que ocupa el cuadro.',
  '  2. Si el producto se TOMA o se consume, la pose es el momento cotidiano en que su resultado',
  '     se nota: la persona haciendo aquello que el producto le devuelve la capacidad de hacer, o',
  '     descansando/moviéndose/actuando como lo hace alguien para quien el producto ya funcionó.',
  '  3. Si la promesa se ve en una zona concreta, esa zona manda el cuadro y la pose la exhibe.',
  'Describí siempre QUÉ HACE EL CUERPO: la postura, qué hacen las manos, sobre qué se apoya, a',
  'dónde mira, en qué momento del día ocurre. Una pose que solo dice una emoción no sirve.',
  'Las 4 tienen que ser CLARAMENTE distintas entre sí — van en 4 secciones de la misma pieza, y',
  'repetirse se lee como un error.',
  'El encuadre de esta pieza nunca se abre más allá del medio cuerpo, así que describí lo que el',
  'cuerpo hace dentro de ese límite.',
  'Si abajo se declara el FORMATO del producto y la pose incluye el momento de tomarlo o aplicarlo,',
  'tiene que ser ESE formato: nadie disuelve un polvo si el producto son gomitas.',
  '',
  'talent.wardrobe — qué ropa lleva puesta, en el REGISTRO del momento que describen las poses: la',
  'ropa de alguien que está haciendo eso, en ese lugar y a esa hora. Preguntate si una persona real',
  'se vestiría así para ese momento — no para una foto de producto. Es ropa común y creíble, nunca',
  'un uniforme de la categoría del producto. De 3 a 12 palabras, sin marcas ni logos.',
].join('\n')

// Corre la visión (foto + niche/labels como contexto). null si no hay foto, falla la visión o
// agota los reintentos internos de callStructured — el caller aplica el fallback del Anexo C.
async function runVision(
  session: LandingSessionResponse,
  niche: NicheId,
  demographic: DemographicId,
  focus?: BodyFocus | null,
): Promise<DnaExtract | null> {
  try {
    const photoUrl = session.product_photo_urls?.[0]
    if (!photoUrl) return null
    const { data, mimeType } = await fetchAsBase64(photoUrl)
    // La foto y las etiquetas alcanzaban para color/partículas/props, que son FÁCTICOS del envase.
    // La complexión y el momento de uso salen de la PROMESA, y eso no está impreso en el frasco:
    // sin beneficios, público y zona, el modelo decide el cuerpo por la categoría — que es
    // exactamente el atajo que este eje existe para evitar.
    const ctx = [
      `Nicho: ${niche}`,
      session.product_labels && `Etiquetas: ${session.product_labels}`,
      // El vendedor declara QUÉ es el producto. Sin esto la visión deduce el formato de la
      // etiqueta: con unas gomitas cuya etiqueta nombra vitamina C devolvió props de POLVO.
      session.product_form && `Formato del producto (dato del vendedor, manda sobre la etiqueta): ${session.product_form}`,
      session.benefits && `Qué promete: ${session.benefits}`,
      session.audience && `Público: ${session.audience}`,
      `Persona ya decidida (no la cambies): ${DEMOGRAPHIC_LABELS[demographic]}`,
      focus && `Zona del cuerpo sobre la que actúa: ${BODY_FOCUS_LABELS[focus]}`,
    ]
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
  // Zona del producto: reparte las poses entre el banco demográfico (hero) y el de zona (resto).
  focus?: BodyFocus | null,
): Promise<LandingDna> {
  const fallback = NICHE_FALLBACK[niche]
  const brand = session.brand_system
  const extraction = await runVision(session, niche, demographic, focus)

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
  // Dirección de arte: la manda la MARCA y solo la marca. Sin board de identidad no hay identidad
  // que leer, así que un producto suelto sale con el acabado histórico (`styleOf(undefined)`).
  const style = brand?.style
  // El vestuario ya NO viene incrustado en la persona: se compone del nicho (qué registro) y de
  // la zona (qué tiene que dejarse ver). Ver `personaFor`.
  // Complexión y poses contextuales (2026-08-21): las decide la visión a partir de la PROMESA.
  // Si la visión cayó, `extraction` es null y las dos llamadas reciben `undefined` → persona y
  // poses deterministas, idénticas a las de antes de este eje.
  const model_persona = demographic === 'no_talent'
    ? NO_TALENT_SUBSTITUTE[niche]
    // `?.talent?.` y no `?.talent.`: el campo es REQUERIDO en el schema (que es lo que obliga al
    // modelo a producirlo), pero una respuesta que igual llegue sin él debe caer al camino
    // determinista, no tumbar la extracción entera con un TypeError. Lo cazó un test.
    : personaFor(demographic, niche, focus, extraction?.talent?.physique, extraction?.talent?.wardrobe)
  const poses = assignPoses(order, demographic, focus, extraction?.talent?.poses)

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
    style,
    model_persona,
    poses,
  }
  return LandingDnaSchema.parse(dna)
}
