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
 * El personaje SALE DE LA FOTO de referencia y de ningún otro lado: ni de una
 * descripción escrita ni del video original, cuyo protagonista es otra persona. De la
 * foto se lee el TIPO físico; la cara es nueva (ver `promptCreacion`).
 *
 * La VOZ no se le pregunta al usuario: son cuatro perfiles fijos (`VOZ_ESTANDAR`) y el
 * modelo solo elige cuál corresponde al personaje. El ACENTO tampoco: se infiere del
 * mismo personaje. Los dos eran campos del wizard y ya no lo son.
 */

/** Los cuatro perfiles vocales estándar. Lo único que el modelo elige es CUÁL. */
export const PERFILES_VOCALES = ['mujer-joven', 'mujer-mayor', 'varon-joven', 'varon-mayor'] as const
export type PerfilVocal = (typeof PERFILES_VOCALES)[number]

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
 * Los cuatro perfiles. Comparten todo lo que hace a una locución UGC creíble —español
 * latino neutro, ritmo conversacional, sin locución publicitaria— y se diferencian
 * solo en lo que depende del cuerpo: tono, timbre y edad vocal. `acento` lo rellena
 * la inferencia del personaje, por eso nace vacío acá.
 */
const BASE = {
  idioma: 'Español',
  varianteRegional: 'Español latinoamericano',
  acento: '',
  pronunciacion: 'Clara y natural, sin sobrearticular',
  ritmo: 'Conversacional, con pausas naturales entre frases',
  velocidad: 'Media',
  entonacion: 'Natural y cercana, sin locución publicitaria',
  energia: 'Media, cálida',
  pausas: 'Breves, donde caen en el habla espontánea',
  estilo: 'Habla a cámara como a una amiga, tono UGC',
} as const

export const VOZ_ESTANDAR: Record<PerfilVocal, VoiceProfile> = {
  'mujer-joven': { ...BASE, tono: 'Medio-agudo', timbre: 'Claro y luminoso', edadVocal: '25-35 años' },
  'mujer-mayor': { ...BASE, tono: 'Medio', timbre: 'Cálido y con cuerpo', edadVocal: '45-60 años' },
  'varon-joven': { ...BASE, tono: 'Medio', timbre: 'Claro y directo', edadVocal: '25-35 años' },
  'varon-mayor': { ...BASE, tono: 'Medio-grave', timbre: 'Grave y sereno', edadVocal: '45-60 años' },
}

export const CharacterIdentitySchema = z.object({
  promptCreacion: z.string(),
  bloqueConsistencia: z.string(),
  /** Cuál de los cuatro perfiles fijos corresponde al personaje de la foto. */
  perfilVocal: z.enum(PERFILES_VOCALES),
  /** Inferido del personaje. No se le pregunta al usuario. */
  acento: z.string(),
})
export type CharacterIdentity = z.infer<typeof CharacterIdentitySchema>

/** El perfil fijo que le toca al personaje, con su acento inferido dentro. */
export function vozDe(identity: CharacterIdentity): VoiceProfile {
  return { ...VOZ_ESTANDAR[identity.perfilVocal], acento: identity.acento.trim() || 'Español latino neutro' }
}

/**
 * Textura y luz del avatar, en CÓDIGO y no en la instrucción del LLM.
 *
 * Lo único que llega al generador de imagen es `promptCreacion`, que lo redacta un
 * modelo de texto: una regla escrita solo en la instrucción es una que el LLM tiene
 * que acordarse de copiar, y este repo ya pagó cinco veces esa apuesta. Peor acá,
 * porque el LLM está describiendo a una persona para un anuncio y su vocabulario por
 * defecto es el de la publicidad de belleza —"piel radiante, luminosa, perfecta"—, que
 * es exactamente el acabado de plástico que este bloque viene a evitar.
 *
 * Va al FINAL del prompt: en un modelo de difusión la cola pesa, y así manda sobre
 * cualquier adjetivo de belleza que se haya colado antes.
 *
 * ⚠️ Las imperfecciones son las de una cara real, no un problema dermatológico: el
 * producto suele ser skincare y un avatar con lesiones contradice lo que el anuncio
 * promete. La asimetría y la textura desigual son lo que rompe el look de IA; una
 * herida es otra cosa.
 */
export const REALISMO_AVATAR = [
  'ACABADO — foto real de cámara frontal de teléfono, NO una imagen generada:',
  'PIEL con textura visible y desigual: poros abiertos en nariz y mejillas, vello facial',
  'fino a contraluz, lunares y pecas repartidos de forma asimétrica, brillo graso en',
  'frente y nariz conviviendo con zonas mates, líneas de expresión en ojos y boca, y la',
  'rojez natural donde la piel la tiene (aletas de la nariz, párpados, pómulos).',
  'LA CARA NO ES SIMÉTRICA: ceja, ojo y comisura de un lado difieren del otro.',
  'LUZ natural y direccional, desigual, con sombras suaves reales — nunca luz plana de',
  'estudio ni un halo uniforme.',
  'CÁMARA: foco en los ojos con caída natural del resto, grano leve, ligera dominante',
  'cálida, nitidez de teléfono y no de campaña publicitaria.',
  'PROHIBIDO: piel alisada, cerosa o de muñeca; brillo uniforme tipo "glow"; aerógrafo;',
  'filtro de belleza; retoque; simetría facial exacta; render 3D; CGI; ilustración; HDR;',
  'sobresaturación; y el acabado lavado, liso y sin poros que delata a una imagen de IA.',
  'Las imperfecciones son LEVES y corrientes en una cara real: nada de heridas,',
  'erupciones, cicatrices ni lesiones.',
].join('\n')

/**
 * Lo que se manda de verdad al generador de imagen. Se persiste tal cual en
 * `character_prompt`: ese campo tiene que decir qué se renderizó, no qué escribió el LLM.
 */
export function promptDeAvatar(promptCreacion: string): string {
  return `${promptCreacion.trim()}\n\n${REALISMO_AVATAR}`
}

/** El encuadre del primer corte, que es el fotograma con el que abre el anuncio. */
function encuadreDeApertura(forensic: ForensicReport): string {
  return forensic.cortes?.[0]?.camara?.trim() || 'plano medio, ángulo levemente bajo'
}

export function buildIdentityInstruction(
  inputs: UserInputs,
  forensic: ForensicReport,
): string {
  return [
    'Actúa como director creativo de anuncios UGC.',
    'Construye la identidad visual maestra del personaje y elige su perfil vocal.',
    '',
    'LA FOTO ADJUNTA ES EL PERSONAJE. Es la única fuente de su apariencia: edad',
    'aparente, tono de piel, cabello, complexión y rasgos salen de ahí, nunca de una',
    'descripción escrita ni del video original (su protagonista es otra persona).',
    '',
    // Lo que NO se copia es la CARA. El vestuario y el lugar no son identidad: son la
    // escenografía del anuncio que se está replicando. "Equivalente" era la latitud por
    // la que se coló una cocina blanca y una camisa blanca donde el original tiene una
    // pared crema y un suéter rosa — y como esta imagen es Image1 en TODOS los lotes y
    // el prompt del lote ya no describe el escenario, si no está en la imagen no está
    // en ningún lado. Medido en píxeles (AGENTS.md, 2026-08-26).
    'CONTEXTO DEL VIDEO ORIGINAL — el vestuario y el escenario se COPIAN, no se reinterpretan:',
    `  Sujeto observado: ${forensic.sujeto}`,
    `  Vestuario observado: ${forensic.vestuario}`,
    `  Lugar observado: ${forensic.fondo}`,
    'Reproduce los ELEMENTOS que ese texto nombra —prendas y colores, superficies, muebles,',
    'tipo y temperatura de luz—, no un lugar ni una ropa "del mismo estilo". Si dice pared',
    'crema y puerta de madera oscura, eso es lo que va detrás. El lugar va DETRÁS del',
    'personaje y desenfocado: es contexto, no el tema de la foto. NO abras el plano para',
    'mostrarlo.',
    '',
    'DATOS DEL PRODUCTO (contexto del anuncio):',
    `  Producto: ${inputs.productName}`,
    `  Público objetivo: ${inputs.targetAudience}`,
    inputs.constraints ? `  Restricciones: ${inputs.constraints}` : '',
    '',
    '`promptCreacion`: un prompt autónomo, listo para un generador de imagen, que cree',
    'la foto del personaje.',
    '',
    '⚠️ LA CARA ES NUEVA, NO LA DE LA FOTO. Toma de la foto el TIPO físico —rango de',
    'edad, complexión, tono de piel, corte y color de cabello, presentación— y construye',
    'con él a OTRA persona: distinta nariz, distinta boca, distintos ojos, distinta',
    'mandíbula. La foto la pudo sacar el usuario de cualquier lado, así que reproducir',
    'esa cara sería publicar la imagen de alguien que no dio permiso. Es un requisito',
    'legal, no estético.',
    '',
    'El prompt debe incluir: edad aparente, sexo / presentación, rasgos faciales, forma',
    'del rostro, ojos, cejas, nariz, labios, piel, cabello (corte, color, textura),',
    'complexión, proporciones observables, el vestuario del video original, accesorios,',
    'postura y expresión neutras, la luz y el lugar del video original de fondo,',
    // El encuadre sale del ORIGINAL, no de un valor fijo: esta imagen es Image1 en todos
    // los lotes y la imagen le gana al texto, así que su encuadre se vuelve el del
    // anuncio entero. Medido sobre un anuncio en primer plano: con "plano medio" fijo
    // los cuatro clips salieron con la persona mucho más lejos que el original.
    `el MISMO encuadre con el que abre el original — ${encuadreDeApertura(forensic)} — sin`,
    'abrirlo ni cerrarlo, sin teléfonos ni trípodes a la vista, relación de aspecto vertical 9:16.',
    '',
    // ⚠️ El acabado NO se le pide al LLM: se anexa en código (`REALISMO_AVATAR`). Lo que
    // sí hace falta es que no lo contradiga — describiendo a una persona para un anuncio,
    // su vocabulario por defecto es el de la publicidad de belleza, y "piel radiante y
    // perfecta" dentro del prompt es justo el acabado de plástico que se quiere evitar.
    'NO describas el acabado, la textura de la piel ni el estilo de la foto: eso lo fija',
    'el sistema al final del prompt. Y no uses vocabulario de publicidad de belleza —nada',
    'de piel "perfecta", "radiante", "luminosa", "impecable", "de porcelana", "sin poros"',
    'ni "sin imperfecciones"—: describe la piel de esta persona como es (tono, si es grasa',
    'o seca, marcas o pecas que se vean en la foto), no como la de un catálogo.',
    'El 9:16 es el del anuncio: esta foto es el ancla visual del personaje en cada lote,',
    'así que su encuadre es el del video.',
    'Sin texto, sin logos, sin watermarks y sin el producto en el encuadre.',
    '',
    '`bloqueConsistencia`: la descripción EXACTA y reutilizable del personaje. Debe ser',
    'autosuficiente —edad, rostro, cabello, piel, ojos, complexión, vestuario y',
    'accesorios— y no puede resumirse con "el mismo personaje", "igual al anterior" ni',
    '"idéntica persona": son referencias a un contexto que no existe.',
    '',
    '`perfilVocal`: cuál de estos cuatro le corresponde al personaje de la foto, por su',
    'sexo y su edad aparentes — mujer-joven, mujer-mayor, varon-joven, varon-mayor.',
    '',
    '`acento`: el acento con el que hablaría este personaje, inferido de él y del',
    'contexto del anuncio (por ejemplo "español peruano de Lima"). Concreto, no',
    '"neutro" a secas.',
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
  image: { data: string; mimeType: string },
): Part[] {
  return [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: instruction }]
}
