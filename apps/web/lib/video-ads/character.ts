import { z } from 'zod'
import type { Part } from '@google/genai'
import type { UserInputs } from './types'
import { enProsa, type ForensicReport } from './forensic'
import { nicheSpec } from './niches'
import type { Personaje } from './personajes'

/**
 * FASE 4 + 4.5 del prompt maestro — identidad visual y vocal bloqueada.
 * ---------------------------------------------------------------------------
 * El `bloqueConsistencia` es el artefacto central de todo el sistema de lotes: como
 * el generador no recuerda nada entre tareas, la ÚNICA forma de que el personaje sea
 * el mismo en el lote 1 y en el 3 es repetir su descripción íntegra en cada prompt.
 * Por eso el spec prohíbe explícitamente "el mismo personaje" / "igual al anterior":
 * son referencias a un contexto que no existe.
 *
 * Etnia y acento vienen del usuario, nunca de la imagen ni del video. Sin acento
 * confirmado se propaga el marcador, no un default: un acento genérico es una
 * decisión de producto tomada por el modelo a espaldas del usuario.
 */

export const ACENTO_PENDIENTE = '[ACENTO PENDIENTE DE CONFIRMACIÓN]'

export const VoiceProfileSchema = z.object({
  idioma: z.string(),
  varianteRegional: z.string(),
  acento: z.string(),
  pronunciacion: z.string(),
  ritmo: z.string(),
  velocidad: z.string(),
  entonacion: z.string(),
  energia: z.string(),
  pausas: z.string(),
  tono: z.string(),
  timbre: z.string(),
  edadVocal: z.string(),
  estilo: z.string(),
})
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>

/**
 * FASE 4.6 — CÓMO SE MUEVE. El tercer artefacto bloqueado, junto al bloque de
 * consistencia (cómo se ve) y el perfil de voz (cómo suena).
 *
 * ⚠️ SON DOS CAMPOS SEPARADOS Y NO SE PUEDEN COLAPSAR EN UNO. El fallo que esto existe
 * para arreglar es que los renders salían "robóticos", y la trampa es leer eso como
 * falta de energía: un video sereno también tiene movimiento fluido. La fluidez y la
 * energía son ejes independientes, y un solo campo hace que el modelo devuelva
 * "energía media" donde hacía falta "movimientos lentos y continuos".
 *
 *  - `calidadMovimiento`: la FÍSICA del cuerpo — continuo o entrecortado, velocidad,
 *    desplazamiento de peso, qué hacen las manos cuando no hacen nada, dónde descansa
 *    la mirada entre frases.
 *  - `manerismos`: los tics involuntarios de esa persona, que no cumplen ninguna
 *    función narrativa. Un cuerpo que solo hace movimientos con propósito es un robot,
 *    y `accionVisual` solo describe movimientos con propósito.
 */
export const MotionProfileSchema = z.object({
  calidadMovimiento: z.string(),
  manerismos: z.string(),
})
export type MotionProfile = z.infer<typeof MotionProfileSchema>

export const CharacterIdentitySchema = z.object({
  promptCreacion: z.string(),
  bloqueConsistencia: z.string(),
  voz: VoiceProfileSchema,
  movimiento: MotionProfileSchema,
})

/**
 * Las identidades de TODOS los personajes, resueltas en UNA sola llamada.
 *
 * Una llamada por personaje sería más simple de escribir y peor de resultado: el modelo
 * no vería a los demás y devolvería cuatro personas que se parecen entre sí. Acá los ve
 * juntos y puede diferenciarlos, que es justamente el trabajo.
 */
export const IdentidadesSchema = z.object({
  personajes: z.array(CharacterIdentitySchema.extend({
    /** El `id` del personaje del usuario al que corresponde esta identidad. */
    id: z.string(),
  })).min(1),
})
export type Identidades = z.infer<typeof IdentidadesSchema>
export type CharacterIdentity = z.infer<typeof CharacterIdentitySchema>

export function buildIdentityInstruction(
  inputs: UserInputs,
  forensic: ForensicReport,
  personajes: Personaje[],
  niche?: unknown,
): string {
  const spec = nicheSpec(niche)
  const varios = personajes.length > 1
  const hasImage = personajes.some((p) => !!p.fotoUrl)
  const datos = (p: Personaje) => [
    `  Personaje: ${p.desc || '[VARIABLE PENDIENTE]'}`,
    `  Raza / etnia / origen cultural: ${p.etnia || '[VARIABLE PENDIENTE]'}`,
    `  Acento: ${p.acento.trim() || ACENTO_PENDIENTE}`,
    p.voz ? `  Voz: ${p.voz}` : '',
  ].filter(Boolean).join('\n')
  return [
    'Actúa como director creativo de anuncios UGC.',
    varios
      ? `Construye la identidad visual y el perfil vocal de LOS ${personajes.length} PERSONAJES de este anuncio.`
      : 'Construye la identidad visual maestra del personaje y su perfil vocal.',
    '',
    'DATOS DEL USUARIO (fuente de verdad, no los contradigas):',
    varios
      ? personajes.map((p) => `[${p.id}] ${p.rol}\n${datos(p)}`).join('\n\n')
      : datos(personajes[0]),
    '',
    // ⚠️ Con varios personajes lo que hay que evitar es que se parezcan entre sí. Por eso
    // se resuelven todos en la MISMA llamada: el modelo los ve juntos y puede
    // diferenciarlos. Una llamada por personaje devolvería cuatro variantes del mismo.
    varios
      ? [
          '⚠️ SON PERSONAS DISTINTAS Y TIENEN QUE VERSE DISTINTAS. Diferéncialos en rasgos',
          'CONCRETOS —edad, complexión, forma del rostro, cabello, piel, vestuario— y no en',
          'adjetivos vagos. Y también tienen que SONAR distinto: dos perfiles de voz',
          'idénticos hacen que el anuncio parezca doblado por la misma persona.',
          'Respeta el acento que el usuario dio a CADA UNO: no los uniformes.',
          '',
        ].join('\n')
      : '',
    spec.wornProduct
      ? 'CONTEXTO DEL VIDEO ORIGINAL (solo para encuadre; el vestuario NO se copia):'
      : 'CONTEXTO DEL VIDEO ORIGINAL (solo para encuadre y vestuario equivalente):',
    `  Sujeto observado: ${enProsa(forensic.sujeto)}`,
    `  Vestuario observado: ${enProsa(forensic.vestuario)}`,
    // ⚠️ En ropa/zapatos el PRODUCTO Y EL VESTUARIO SON EL MISMO OBJETO. Sin esta
    // nota el bloque de consistencia describe la ropa del video original y viaja a
    // cada lote junto a `productDesc`, o sea el prompt afirma "viste camiseta rosa" y
    // "el producto es una blusa crema" en el mismo texto. La prenda del usuario gana.
    spec.avatarNote,
    `  Fondo observado: ${enProsa(forensic.fondo)}`,
    // El ritmo de edición lo mide el forense y hasta ahora no llegaba a ningún prompt:
    // se generaba, se persistía y nadie lo leía. Es la evidencia objetiva de cómo se
    // mueve el original, así que es lo primero que necesita el perfil de movimiento.
    `  Ritmo de edición observado: ${forensic.edicion?.ritmo ?? '[no medido]'}`,
    forensic.cortes?.length
      ? `  Movimiento observado en los cortes: ${forensic.cortes.slice(0, 6).map((c) => c.accion).join(' | ')}`
      : '',
    '',
    hasImage
      ? [
          'HAY IMAGEN DE REFERENCIA DEL PERSONAJE. Es la fuente primaria de identidad',
          'visual: analiza únicamente rasgos observables y conserva proporciones faciales,',
          'estructura del rostro, cabello (corte y color), complexión, rasgos distintivos',
          'visibles y edad aparente. No mezcles rasgos con otros personajes. Si un rasgo',
          'no puede observarse con certeza, no inventes ese rasgo.',
          'De la foto SOLO se leen rasgos observables (edad aparente, tono de piel,',
          'cabello, facciones, complexión). NUNCA infieras de la foto la etnia, el',
          'origen cultural ni el acento del personaje: esos dos datos vienen',
          'exclusivamente del usuario, en la sección de arriba, y de nadie más — ni de',
          'la imagen ni del video original.',
        ].join('\n')
      : [
          'NO hay imagen de referencia: construye el personaje desde la descripción del',
          'usuario. No inventes rasgos que el usuario no mencionó ni los deduzcas del',
          'video original — el personaje del original NO es el personaje nuevo.',
        ].join('\n'),
    '',
    varios
      ? `Devuelve \`personajes\`: UNA entrada por cada personaje de arriba, con su \`id\` exacto (${personajes.map((p) => p.id).join(', ')}) y los cuatro campos de abajo. No inventes personajes que no estén en la lista ni omitas ninguno.`
      : `Devuelve \`personajes\` con UNA sola entrada, \`id\`: "${personajes[0].id}".`,
    '',
    '`promptCreacion`: un prompt autónomo, listo para un generador de imagen, que cree',
    'la foto base del personaje. Debe incluir identidad visual, edad aparente, sexo /',
    'presentación, rasgos faciales visibles, forma del rostro, ojos, cejas, nariz,',
    'labios, piel, cabello (corte, color, textura), complexión, proporciones corporales',
    'observables, vestuario, accesorios, postura neutra, expresión neutra,',
    'relación de aspecto VERTICAL 9:16 y nivel de realismo fotográfico.',
    '',
    // ⚠️ EL AVATAR YA NO PUEDE NACER EN FONDO NEUTRO, y esto es una desviación
    // deliberada de la FASE 4 del spec ("fondo neutro", "iluminación neutra").
    //
    // Esa regla es correcta cuando el avatar es una FOTO DE REFERENCIA. Con el modo de
    // frames de Veo dejó de serlo: el avatar es el primer fotograma del clip, y de él
    // salen todos los frames frontera. Un avatar sobre pared blanca hace que el anuncio
    // ENTERO transcurra sobre una pared blanca — medido en la sesión `02fa1205`, cuyo
    // original es una tienda con maniquíes, estantes de vidrio y un letrero "NOVATA", y
    // cuyos cinco clips salieron en un estudio vacío.
    //
    // En modo frames el prompt del lote ya no manda descripción de escenario (no hay
    // manera fiable de acotar a un clip un texto que describe el video entero), así que
    // si la escena no está EN LA IMAGEN no está en ningún lado.
    'ESCENARIO — la imagen es el primer fotograma del anuncio, no un retrato de estudio:',
    'sitúa al personaje EN EL MISMO TIPO DE LUGAR que el video original, con su misma',
    `iluminación. Lugar observado: ${enProsa(forensic.fondo) || 'interior con luz natural'}`,
    'Reproduce el TIPO de espacio y su luz, no los objetos concretos de una toma suelta.',
    // ⚠️ Sin esto el modelo abre el plano para "mostrar" el lugar: medido, el avatar
    // pasó de plano medio a cuerpo entero en cuanto se le nombró la tienda. El escenario
    // va DETRÁS y desenfocado; el encuadre lo manda el original, no el decorado.
    'El lugar va DETRÁS del personaje y desenfocado — es contexto, no el tema de la foto.',
    'NO abras el plano para mostrarlo: el encuadre manda sobre el escenario.',
    // 9:16 y no el 2:3 de antes: con el modo de frames de Veo esta imagen no es "una
    // referencia más", es el PRIMER FOTOGRAMA del clip. El encuadre que tenga es el
    // encuadre con el que abre el anuncio.
    'La imagen es el primer fotograma de un video vertical de redes: encuádrala como una',
    'foto de teléfono real (plano medio, ángulo levemente bajo), no como un retrato de',
    'estudio. Sin teléfonos, cámaras ni trípodes a la vista.',
    spec.wornProduct
      ? 'Sin texto, sin logos y sin watermarks. El producto SÍ va en el encuadre: el personaje lo lleva puesto, tal como se ve en su imagen.'
      : 'Sin texto, sin logos, sin watermarks y sin el producto en el encuadre.',
    '',
    '`bloqueConsistencia`: la descripción EXACTA y reutilizable del personaje, pensada',
    'para copiarse íntegra dentro de cada lote de video. Trátala como una identidad',
    'bloqueada: no la reemplaces nunca ni la resumas con ninguno de estos atajos —',
    '"el mismo personaje", "igual al anterior", "idéntica persona", "as before" — el',
    'generador de video no recuerda nada entre lotes, así que una referencia a algo',
    'anterior produce otra persona.',
    'Debe ser autosuficiente y describir edad, etnia (la del usuario), rostro, cabello,',
    'piel, ojos, complexión, vestuario y accesorios.',
    spec.wornProduct
      ? 'El vestuario que describas ES EL PRODUCTO: detalla la prenda del usuario (corte, color, tejido, cuello, mangas, puños, largo) como parte de la identidad bloqueada. Es lo único que mantiene la misma prenda en el lote 1 y en el 5.'
      : '',
    '',
    '`voz`: perfil vocal completo — idioma, variante regional, acento, pronunciación,',
    'ritmo, velocidad, entonación, energía, pausas, tono, timbre, edad vocal aproximada',
    'y estilo conversacional.',
    // El acento es POR PERSONAJE: uniformarlos borraría justamente el dato que la FASE 0
    // exige confirmar uno por uno.
    varios
      ? 'El acento de cada uno es el que su bloque de DATOS DEL USUARIO indica, tal cual. No los uniformes.'
      : `El acento debe ser explícito y estable: usa "${personajes[0].acento.trim() || ACENTO_PENDIENTE}" tal cual.`,
    personajes.some((p) => !p.acento.trim())
      ? 'NO sustituyas un acento pendiente por uno genérico ni "neutro": propaga el marcador.'
      : '',
    '',
    '`movimiento`: CÓMO SE MUEVE el personaje, leído del video original. Son DOS campos',
    'separados y no se pueden mezclar:',
    '',
    '  `calidadMovimiento` — la física del cuerpo. Describe si el movimiento es continuo',
    '  o entrecortado, su velocidad, cómo desplaza el peso de una pierna a otra, qué',
    '  hacen las manos y los brazos MIENTRAS NO HACEN NADA, y dónde descansa la mirada',
    '  entre una frase y la siguiente.',
    '',
    '  `manerismos` — los gestos involuntarios y repetidos de esa persona, los que no',
    '  cumplen ninguna función en el guión: acomodarse el pelo, tocarse la cara,',
    '  parpadear fuerte, encogerse de hombros, ladear la cabeza al escuchar.',
    '',
    '⚠️ FLUIDEZ Y ENERGÍA SON EJES DISTINTOS, y confundirlos es el error a evitar. Un',
    'video sereno puede tener un movimiento perfectamente fluido; uno enérgico puede ser',
    'entrecortado. En `calidadMovimiento` describe CÓMO se mueve el cuerpo, no CUÁNTA',
    'energía tiene: "movimientos lentos y continuos, sin pausas bruscas entre gestos" es',
    'la clase de respuesta correcta; "energía baja" NO lo es, no dice nada sobre el',
    'movimiento y ya está cubierto por el perfil de voz.',
    '',
    'Los dos campos describen al personaje NUEVO, pero se leen del video original: es su',
    'lenguaje corporal lo que hay que replicar, no su apariencia.',
    '',
    'Todo el output va en español.',
  ].filter(Boolean).join('\n')
}

/**
 * Arma los parts para `callStructured`: la foto del personaje (si el usuario ya
 * subió una) va ANTES del texto, mismo orden que `analyze-reference/route.ts` y
 * `analyze-product/route.ts`. Sin esto, el modelo recibe solo texto y fabrica el
 * bloque de consistencia a ciegas — probablemente copiando al `sujeto` del forense,
 * que es la persona del video de referencia, justo lo que este prompt prohíbe.
 * Pura y testeable por separado del route handler (que hace I/O de red y DB).
 */
export function buildCharacterParts(
  instruction: string,
  /** Las fotos de referencia, en el ORDEN de `personajes`. El prompt las cita por ese
   *  orden, así que mezclarlas le da a un personaje la cara de otro. */
  image?: { data: string; mimeType: string } | { data: string; mimeType: string }[],
  /** La prenda / el calzado, cuando el producto se lleva puesto: sin verla, el modelo
   *  describe un vestuario inventado y el avatar no sale con el producto del usuario. */
  product?: { data: string; mimeType: string } | null,
): Part[] {
  const parts: Part[] = []
  for (const img of image ? (Array.isArray(image) ? image : [image]) : []) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })
  }
  if (product) parts.push({ inlineData: { mimeType: product.mimeType, data: product.data } })
  parts.push({ text: instruction })
  return parts
}
