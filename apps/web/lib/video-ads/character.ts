import { z } from 'zod'
import type { Part } from '@google/genai'
import type { UserInputs } from './types'
import type { ForensicReport } from './forensic'

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

export const CharacterIdentitySchema = z.object({
  promptCreacion: z.string(),
  bloqueConsistencia: z.string(),
  voz: VoiceProfileSchema,
})
export type CharacterIdentity = z.infer<typeof CharacterIdentitySchema>

export function buildIdentityInstruction(
  inputs: UserInputs,
  forensic: ForensicReport,
  hasImage: boolean,
): string {
  const acento = inputs.accent.trim() || ACENTO_PENDIENTE
  return [
    'Actúa como director creativo de anuncios UGC.',
    'Construye la identidad visual maestra del personaje y su perfil vocal.',
    '',
    'DATOS DEL USUARIO (fuente de verdad, no los contradigas):',
    `  Personaje: ${inputs.characterDesc || '[VARIABLE PENDIENTE]'}`,
    `  Raza / etnia / origen cultural: ${inputs.characterEthnicity || '[VARIABLE PENDIENTE]'}`,
    `  Acento: ${acento}`,
    inputs.voice ? `  Voz: ${inputs.voice}` : '',
    '',
    'CONTEXTO DEL VIDEO ORIGINAL (solo para encuadre y vestuario equivalente):',
    `  Sujeto observado: ${forensic.sujeto}`,
    `  Vestuario observado: ${forensic.vestuario}`,
    `  Fondo observado: ${forensic.fondo}`,
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
    '`promptCreacion`: un prompt autónomo, listo para un generador de imagen, que cree',
    'la foto base del personaje. Debe incluir identidad visual, edad aparente, sexo /',
    'presentación, rasgos faciales visibles, forma del rostro, ojos, cejas, nariz,',
    'labios, piel, cabello (corte, color, textura), complexión, proporciones corporales',
    'observables, vestuario, accesorios, postura neutra, expresión neutra, iluminación',
    'neutra, fondo neutro, encuadre de referencia, relación de aspecto retrato 2:3 y',
    'nivel de realismo fotográfico. (El generador de imagen solo produce retrato 2:3;',
    'el ratio vertical final del video lo impone después el modelo de video, porque',
    'el personaje nunca va solo en el render.)',
    'Sin texto, sin logos, sin watermarks y sin el producto en el encuadre.',
    '',
    '`bloqueConsistencia`: la descripción EXACTA y reutilizable del personaje, pensada',
    'para copiarse íntegra dentro de cada lote de video. Trátala como una identidad',
    'bloqueada: no la reemplaces nunca ni la resumas con ninguno de estos atajos —',
    '"el mismo personaje", "igual al anterior", "idéntica persona", "as before" — el',
    'generador de video no recuerda nada entre lotes, así que una referencia a algo',
    'anterior produce otra persona.',
    'Debe ser autosuficiente y describir edad, etnia (la del usuario), rostro, cabello,',
    'piel, ojos, complexión, vestuario y accesorios.',
    '',
    '`voz`: perfil vocal completo — idioma, variante regional, acento, pronunciación,',
    'ritmo, velocidad, entonación, energía, pausas, tono, timbre, edad vocal aproximada',
    'y estilo conversacional.',
    `El acento debe ser explícito y estable: usa "${acento}" tal cual.`,
    acento === ACENTO_PENDIENTE
      ? 'NO lo sustituyas por un acento genérico ni "neutro": propaga el marcador.'
      : '',
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
  image?: { data: string; mimeType: string },
): Part[] {
  const parts: Part[] = []
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } })
  parts.push({ text: instruction })
  return parts
}
