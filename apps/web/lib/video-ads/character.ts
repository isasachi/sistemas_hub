import { z } from 'zod'
import type { Part } from '@google/genai'
import type { UserInputs } from './types'
import { corteMuestraPersona, enProsa, type ForensicReport } from './forensic'
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
 * ⚠️ LA VOZ YA NO SE PREGUNTA NI SE INVENTA: sale de acá (2026-08-25).
 *
 * Revierte una regla que este repo tenía como dura —*"etnia y acento NUNCA se marcan
 * confirmados desde la referencia"*— y es decisión del dueño del repo. El acento y la
 * voz eran dos campos del wizard, uno obligatorio y bloqueante y el otro opcional; el
 * anuncio es para el mercado peruano y la respuesta útil era siempre la misma, así que
 * pedirla era fricción que además podía trabar la FASE 0.
 *
 * **La ETNIA no se tocó** y sigue siendo obligatoria por personaje: es lo que sostiene la
 * REGLA DE NO-ASUNCIÓN y el gate de FASE 0 con varios personajes.
 *
 * Dos perfiles, uno por sexo, siempre en español latino neutro. Lo que sigue viniendo del
 * modelo son `edadVocal` y `timbre` (ver `CharacterIdentitySchema`): sin eso, dos
 * personajes del mismo sexo sonarían idénticos en el mismo anuncio.
 */
export const VOZ_POR_DEFECTO: Record<'hombre' | 'mujer', VoiceProfile> = {
  hombre: {
    idioma: 'Español', varianteRegional: 'Latinoamericano neutro', acento: 'Español latino neutro',
    pronunciacion: 'Clara y articulada', ritmo: 'Conversacional', velocidad: 'Moderada',
    entonacion: 'Natural y cercana, sin locución publicitaria', energia: 'Media-alta',
    pausas: 'Cortas, donde caen en el habla real', tono: 'Cálido y directo',
    timbre: 'Masculino adulto, medio', edadVocal: '30-40 años', estilo: 'Conversacional, de persona real hablándole a la cámara',
  },
  mujer: {
    idioma: 'Español', varianteRegional: 'Latinoamericano neutro', acento: 'Español latino neutro',
    pronunciacion: 'Clara y articulada', ritmo: 'Conversacional', velocidad: 'Moderada',
    entonacion: 'Natural y cercana, sin locución publicitaria', energia: 'Media-alta',
    pausas: 'Cortas, donde caen en el habla real', tono: 'Cálido y cercano',
    timbre: 'Femenino adulto, claro', edadVocal: '25-35 años', estilo: 'Conversacional, de persona real hablándole a la cámara',
  },
}

/**
 * La voz de un personaje.
 *
 * ⚠️ CON UN SOLO PERSONAJE SALE ÍNTEGRA DE `VOZ_POR_DEFECTO`, sin una palabra del modelo.
 * `edadVocal` y `timbre` existen por UNA razón —que dos personajes del mismo sexo no
 * suenen idénticos en el mismo anuncio— y con uno solo no hay de quién diferenciarse: son
 * variación pura, y variación es exactamente lo que no se quiere en un anuncio que se
 * renderiza clip por clip y después se concatena. Medido: de **18 sesiones con lista de
 * personajes, NINGUNA tiene más de uno**, así que en la práctica esto vuelve la voz
 * idéntica en todas las sesiones y en todos sus lotes.
 *
 * ⚠️ Y EL CAMPO LIBRE SE CONTRADECÍA CON EL PERFIL FIJO, que es el defecto de verdad.
 * Medido en la sesión `ca62aaed`, el mismo bloque llevaba `entonacion: "Natural y cercana,
 * SIN locución publicitaria"` (fijo) junto a `timbre: "…con una entonación natural y
 * expresiva propia de una LOCUCIÓN de redes sociales"` (del modelo): dos instrucciones
 * opuestas dentro del mismo prompt, el modo de fallo que este repo ya registró cuatro
 * veces. El modelo infla ese campo la mitad de las veces — **10 de 35 perfiles guardados
 * traen un `timbre` de más de 40 caracteres, contra los 24 del fijo**.
 *
 * Cuando SÍ hay varios personajes los diferenciadores se conservan (es su motivo de ser)
 * pero recortados: un timbre es una etiqueta corta, no una frase de estilo con opiniones
 * sobre la locución. El corte es duro y por palabra para que no quede una frase a medias.
 */
const TIMBRE_MAX = 40

function etiquetaCorta(v: string | undefined, porDefecto: string): string {
  const t = v?.trim()
  if (!t) return porDefecto
  if (t.length <= TIMBRE_MAX) return t
  const corte = t.slice(0, TIMBRE_MAX)
  const espacio = corte.lastIndexOf(' ')
  return (espacio > 0 ? corte.slice(0, espacio) : corte).replace(/[,;:.]$/, '')
}

export function vozDe(
  id: { sexoVocal: 'hombre' | 'mujer'; edadVocal?: string; timbre?: string },
  /** ¿Hay más de un personaje del que diferenciarse? Con uno solo, la voz es la fija. */
  diferenciar = false,
): VoiceProfile {
  const base = VOZ_POR_DEFECTO[id.sexoVocal] ?? VOZ_POR_DEFECTO.mujer
  if (!diferenciar) return base
  return {
    ...base,
    edadVocal: etiquetaCorta(id.edadVocal, base.edadVocal),
    timbre: etiquetaCorta(id.timbre, base.timbre),
  }
}

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
  /**
   * ⚠️ EL MODELO OBSERVA EL SEXO, EL CÓDIGO CONSTRUYE LA VOZ (2026-08-25, decisión del
   * dueño del repo). Antes el modelo devolvía el `VoiceProfile` entero y el usuario le
   * daba el acento a mano; los dos campos del wizard se eliminaron y ahora la voz sale de
   * `VOZ_POR_DEFECTO`, fija y siempre en español.
   *
   * Lo único que hace falta preguntarle es a cuál de los dos perfiles corresponde, y eso
   * SÍ es una observación (está en la foto y en el video). Los campos expresivos que el
   * modelo todavía puede aportar —edad vocal y timbre— siguen viniendo de él: con varios
   * personajes son lo que impide que dos hombres suenen exactamente igual.
   */
  sexoVocal: z.enum(['hombre', 'mujer']),
  edadVocal: z.string(),
  timbre: z.string(),
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

/**
 * El encuadre con el que ABRE el anuncio, para que el avatar nazca con él.
 *
 * ⚠️ Se busca el primer corte que MUESTRA A UNA PERSONA, no el primero a secas: un anuncio
 * que abre con un plano de detalle del producto no da un encuadre útil para un retrato, y
 * copiarlo produciría un avatar que no sirve como referencia de identidad.
 *
 * Sin ningún corte con persona (un anuncio íntegramente en voz en off sobre b-roll), se
 * cae al valor que esta línea tenía fijo desde siempre.
 */
function encuadreDeApertura(forensic: ForensicReport): string {
  const c = (forensic.cortes ?? []).find((x) => corteMuestraPersona(x))
  const t = c?.camara?.trim()
  return t || 'plano medio, ángulo levemente bajo'
}

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
          'adjetivos vagos. Y también tienen que SONAR distinto: la voz base es la misma',
          'para todos los de un mismo sexo, así que `edadVocal` y `timbre` son lo ÚNICO que',
          'los separa — dános valores realmente distintos o el anuncio parecerá doblado por',
          'la misma persona.',
          '',
        ].join('\n')
      : '',
    // ⚠️ ESTE BLOQUE SE COPIA, NO SE INTERPRETA — y decía lo contrario. Medido sobre un
    // anuncio de serum: el forense leyó bien el original ("jersey tejido rosa pálido",
    // "pared crema, marco de puerta de madera oscura") y el avatar salió con **blusa
    // blanca sobre top negro en una cocina moderna**, porque la instrucción pedía
    // "vestuario equivalente" y "el mismo TIPO de lugar". El modelo tomó esa latitud.
    //
    // Y el daño no queda en el avatar: esa imagen es `@image(1)` en TODOS los lotes, y la
    // imagen le gana al texto. Los cuatro clips salieron con la ropa equivocada, uno
    // transcurrió literalmente en la cocina del avatar, y los otros tres en habitaciones
    // distintas entre sí porque el texto `SETTING` y la imagen se contradecían.
    //
    // Lo que NO se copia es la CARA: el avatar es una persona nueva por requisito legal.
    // El vestuario y el lugar no son identidad — son la escenografía del anuncio que se
    // está replicando, y replicarlos es justamente el trabajo.
    spec.wornProduct
      ? 'CONTEXTO DEL VIDEO ORIGINAL — se COPIA el escenario; el vestuario NO (es el producto):'
      : 'CONTEXTO DEL VIDEO ORIGINAL — el vestuario y el escenario se COPIAN, no se reinterpretan:',
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
          // ⚠️ EL AVATAR ES UNA PERSONA NUEVA, NO LA DE LA FOTO. La foto la puede haber
          // sacado el usuario de cualquier lado, así que reproducir esa cara sería
          // publicar la imagen de alguien que no dio permiso. Se toma el TIPO físico
          // —edad, complexión, tono de piel, estilo de cabello— y se construye a otra
          // persona con él, combinándolo con lo que el usuario describió en el brief.
          'IMPORTANTE — NO CLONES LA CARA DE LA FOTO. El avatar es una persona NUEVA que',
          'comparte el TIPO físico de la referencia (rango de edad, complexión, tono de',
          'piel, estilo y color de cabello), no sus facciones exactas: distinta forma de',
          'nariz, boca, ojos y mandíbula. La foto marca el tipo; el brief del usuario',
          'manda sobre el resto. Es un requisito legal, no estético: la persona de esa',
          'foto no dio permiso para aparecer en un anuncio.',
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
    'sitúa al personaje EN EL LUGAR OBSERVADO, con su misma iluminación.',
    `  Lugar observado: ${enProsa(forensic.fondo) || 'interior con luz natural'}`,
    // ⚠️ "reproduce el TIPO de espacio" era la puerta por la que se coló una cocina donde
    // el original tiene una pared crema con una puerta de madera oscura. Se copian los
    // ELEMENTOS que el forense nombró (superficies, colores, muebles, temperatura de luz);
    // lo que no se exige es la disposición exacta de una toma suelta.
    'Reproduce los ELEMENTOS que ese texto nombra —superficies, colores, muebles, tipo y',
    'temperatura de luz—, no un lugar "del mismo estilo". Si dice pared crema y puerta de',
    'madera oscura, eso es lo que va detrás: no lo cambies por otra habitación que te',
    'parezca equivalente. Lo único que no se exige es la disposición exacta de los objetos.',
    // ⚠️ Sin esto el modelo abre el plano para "mostrar" el lugar: medido, el avatar
    // pasó de plano medio a cuerpo entero en cuanto se le nombró la tienda. El escenario
    // va DETRÁS y desenfocado; el encuadre lo manda el original, no el decorado.
    'El lugar va DETRÁS del personaje y desenfocado — es contexto, no el tema de la foto.',
    'NO abras el plano para mostrarlo: el encuadre manda sobre el escenario.',
    // 9:16 y no el 2:3 de antes: con el modo de frames de Veo esta imagen no es "una
    // referencia más", es el PRIMER FOTOGRAMA del clip. El encuadre que tenga es el
    // encuadre con el que abre el anuncio.
    // ⚠️ EL ENCUADRE SALE DEL ORIGINAL, NO DE UN VALOR FIJO. Esta línea decía "plano
    // medio" a secas, sin mirar el video de referencia — y como esta imagen es `@image(1)`
    // en todos los lotes y la imagen le gana al texto, ese plano medio se convertía en el
    // encuadre del anuncio ENTERO. Medido sobre un anuncio grabado en primer plano: los
    // cuatro clips salieron con la persona mucho más lejos que el original.
    //
    // Se toma el encuadre del PRIMER CORTE QUE MUESTRA A UNA PERSONA: esta imagen es el
    // primer fotograma del anuncio, así que su encuadre es el de apertura. Si el anuncio
    // abre con un plano de producto, ese corte no sirve de referencia para un retrato y se
    // sigue buscando; sin ninguno, se cae al valor de siempre.
    `La imagen es el primer fotograma de un video vertical de redes: encuádrala como una foto de teléfono real, con el MISMO encuadre con el que abre el original — ${encuadreDeApertura(forensic)}.`,
    'Ese encuadre manda: no lo abras ni lo cierres. Sin teléfonos, cámaras ni trípodes a la vista.',
    // ⚠️ REALISMO ESTRICTO, exigido por el dueño del repo. Es el fallo más visible de un
    // generador de imagen sobre personas: devuelve piel de plástico, luz uniforme y cara
    // de render 3D, y eso delata el anuncio como generado antes de que nadie lo escuche.
    // Y acá pesa el doble, porque este fotograma define cómo se ve el clip entero: una
    // piel acartonada acá contamina todas las tomas que salgan de ella.
    'REALISMO FOTOGRÁFICO ESTRICTO — y esto manda sobre cualquier otra consideración',
    'estética. Piel real con su textura: poros, vello fino, lunares, pequeñas',
    'irregularidades, brillo natural donde la piel es grasa y líneas de expresión propias',
    'de la edad. Iluminación real y desigual, con sombras que caen donde tienen que caer.',
    'PROHIBIDO: piel suavizada o retocada, tonos pastel, acabado acartonado o de plástico,',
    'aspecto de ilustración, de render 3D, de muñeco o de personaje de videojuego,',
    'estilización, glamour de estudio, aerógrafo, filtro de belleza y luz perfecta.',
    'Tiene que poder pasar por un fotograma de un video grabado con un teléfono.',
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
    // ⚠️ El vestuario del avatar termina dentro del bloque de consistencia y viaja a cada
    // lote: si acá se inventa, el anuncio entero sale vestido de otra cosa.
    spec.wornProduct
      ? ''
      : 'VESTUARIO: copia el observado en el original —prenda, color, tejido, cuello, largo— y también sus accesorios (aretes, collares). No lo sustituyas por otra prenda "parecida" ni por una más favorecedora: es la escenografía del anuncio que se replica, no una elección de estilo.',
    spec.wornProduct
      ? 'El vestuario que describas ES EL PRODUCTO: detalla la prenda del usuario (corte, color, tejido, cuello, mangas, puños, largo) como parte de la identidad bloqueada. Es lo único que mantiene la misma prenda en el lote 1 y en el 5.'
      : '',
    '',
    // ⚠️ EL PERFIL DE VOZ YA NO SE PIDE: sale de `VOZ_POR_DEFECTO`, fijo y en español.
    // Lo único que se observa es a cuál de los dos corresponde, más los dos campos que
    // diferencian a personajes del mismo sexo.
    '`sexoVocal`: "hombre" o "mujer", según se ve y se oye en la referencia. Es lo único',
    'que decide qué voz se usa; el idioma es SIEMPRE español latino neutro y no se elige.',
    '`edadVocal`: rango aproximado ("28-35 años"). `timbre`: cómo suena esa voz en concreto',
    '(grave y con aire, clara y brillante, algo nasal…). Los dos salen de lo que se OYE en',
    'el video original.',
    '',
    '`movimiento`: CÓMO SE MUEVE el personaje, leído del video original. Son DOS campos',
    'separados y no se pueden mezclar:',
    '',
    '  `calidadMovimiento` — la física del cuerpo. Describe si el movimiento es continuo',
    '  o entrecortado, su velocidad, cómo desplaza el peso de una pierna a otra, qué',
    '  hacen las manos y los brazos MIENTRAS NO HACEN NADA, y dónde descansa la mirada',
    '  entre una frase y la siguiente.',
    '',
    // ⚠️ EL RITMO DEL ORIGINAL SE COLAPSABA EN UNA ETIQUETA. Medido sobre seis sesiones
    // guardadas: `calidadMovimiento` empezaba con "movimientos fluidos" en las SEIS, tanto
    // en anuncios cuyo ritmo el forense describió como "rápido y dinámico" como en los que
    // describió "pausado y conversacional". O sea el eje del ritmo no llegaba al render —
    // este campo es el único camino por el que puede llegar, porque el prompt del lote no
    // lee `edicion.ritmo`. Es el mismo modo de fallo que ya se corrigió pidiendo detalle
    // reproducible en `style`, `typography` y `creativeConcept`: prohibir la etiqueta.
    '  ⚠️ TIENE QUE REFLEJAR EL RITMO DEL ORIGINAL, que está arriba en "Ritmo de edición',
    '  observado". Un anuncio rápido y uno pausado NO se mueven igual: cambia la velocidad',
    '  del gesto, cuántas veces se mueve por frase y si se queda quieta entre una y otra.',
    '  Dilo con esa concreción — "gesticula en casi cada frase, con las manos moviéndose',
    '  rápido a la altura del pecho" contra "un gesto cada dos o tres frases, las manos',
    '  vuelven al regazo y se quedan ahí".',
    '  PROHIBIDO responder solo "movimientos fluidos y continuos" o cualquier variante: es',
    '  la etiqueta que devuelve TODO video y no distingue nada. Si el movimiento es fluido,',
    '  dilo Y agrega a qué velocidad y con qué frecuencia.',
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
