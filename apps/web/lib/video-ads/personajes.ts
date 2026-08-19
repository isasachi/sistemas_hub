import { z } from 'zod'
import { VoiceProfileSchema, MotionProfileSchema } from './character'

/**
 * VARIOS PERSONAJES EN UN MISMO ANUNCIO (hasta 4).
 * ---------------------------------------------------------------------------
 * El pipeline nació asumiendo UNA persona: `consistency_block`, `voice_profile`,
 * `motion_profile`, `avatar_url` y `character_url` son todos singulares. Pero los
 * anuncios reales tienen varios — la sesión `e6b5beda` es un hijo médico y su padre, y
 * el análisis los metió a los dos dentro del mismo `sujeto: z.string()`:
 *
 *   "Hombre joven (doctor): complexión robusta… Hombre mayor (padre): cabello canoso…"
 *
 * O sea el forense SÍ los ve; lo que faltaba era dónde guardarlos por separado.
 *
 * ⚠️ TODO ACÁ ES ADITIVO. Ningún campo existente cambia de tipo ni de significado: se
 * agrega la columna `personajes` y este accesor, y `personajesDe` devuelve UN personaje
 * armado desde las columnas singulares cuando la sesión es anterior. Así el resto del
 * pipeline no distingue una sesión vieja de una nueva, y no hace falta migrar filas ni
 * re-correr el análisis (que es el paso caro).
 */

/** Tope deliberado. La referencia que lo motivó tiene 4 hablantes: hijo, padre,
 *  reclutador y una señora. Con 2 se quedaba corto. */
export const MAX_PERSONAJES = 4

export const PersonajeSchema = z.object({
  /** Estable y corto: es lo que el diálogo referencia para decir quién habla. */
  id: z.string(),
  /** Cómo lo llama el anuncio ("hijo", "padre"). Para la UI y para el prompt. */
  rol: z.string(),
  desc: z.string(),
  /** ⚠️ Del usuario, NUNCA inferidos — el spec lo prohíbe y la FASE 0 bloquea sin ellos. */
  etnia: z.string(),
  acento: z.string(),
  voz: z.string(),
  /** La foto de referencia que subió el usuario. */
  fotoUrl: z.string().nullable(),
  /** El avatar GENERADO a partir de ella (9:16). */
  avatarUrl: z.string().nullable(),
  consistencyBlock: z.string().nullable(),
  voiceProfile: VoiceProfileSchema.nullable(),
  motionProfile: MotionProfileSchema.nullable(),
})
export type Personaje = z.infer<typeof PersonajeSchema>

/** Lo mínimo de la sesión que hace falta para resolver los personajes. */
export interface FuenteDePersonajes {
  personajes?: unknown
  character_url?: string | null
  avatar_url?: string | null
  character_desc?: string | null
  character_ethnicity?: string | null
  accent?: string | null
  voice?: string | null
  consistency_block?: string | null
  voiceProfile?: never
  voice_profile?: Personaje['voiceProfile']
  motion_profile?: Personaje['motionProfile']
}

/** El id del primer personaje. Es el protagonista y el que hereda una sesión legada. */
export const ID_PRINCIPAL = 'P1'

export function nuevoId(indice: number): string {
  return `P${indice + 1}`
}

/**
 * Los personajes de una sesión, siempre como lista.
 *
 * Si la columna `personajes` tiene datos válidos, se usa. Si no —toda sesión anterior a
 * esta migración—, se arma UNO con las columnas singulares. Nunca devuelve vacío: sin
 * nada de nada, devuelve un personaje en blanco, porque los pasos de más abajo esperan
 * al menos el protagonista y un array vacío los obligaría a todos a mirar el caso.
 */
export function personajesDe(s: FuenteDePersonajes | null | undefined): Personaje[] {
  const guardados = z.array(PersonajeSchema).safeParse(s?.personajes)
  if (guardados.success && guardados.data.length) {
    return guardados.data.slice(0, MAX_PERSONAJES)
  }
  return [{
    id: ID_PRINCIPAL,
    rol: 'protagonista',
    desc: s?.character_desc ?? '',
    etnia: s?.character_ethnicity ?? '',
    acento: s?.accent ?? '',
    voz: s?.voice ?? '',
    fotoUrl: s?.character_url ?? null,
    avatarUrl: s?.avatar_url ?? null,
    consistencyBlock: s?.consistency_block ?? null,
    voiceProfile: s?.voice_profile ?? null,
    motionProfile: s?.motion_profile ?? null,
  }]
}

/**
 * El personaje al que pertenece un id de hablante, tolerando lo que el modelo devuelve.
 *
 * ⚠️ Misma lección que `resolveSlotId` en fill.ts: el modelo reescribe el identificador
 * al citarlo — devuelve `p1`, `P1 (hijo)` o directamente `hijo` en vez de `P1`. Buscar
 * por igualdad exacta hace que la atribución se aplique a NADIE mientras el log dice que
 * sí, que es el modo de fallo más caro. Se compara por id normalizado y, si no matchea,
 * por rol.
 */
export function resolvePersonaje(personajes: Personaje[], ref: string): Personaje | null {
  const norm = (x: string) =>
    x.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  const r = norm(ref)
  if (!r) return null
  return personajes.find((p) => norm(p.id) === r)
    ?? personajes.find((p) => norm(p.rol) === r)
    // `P1 (hijo)` normaliza a `p1hijo`: empieza por el id.
    ?? personajes.find((p) => r.startsWith(norm(p.id)))
    ?? personajes.find((p) => norm(p.rol) && r.includes(norm(p.rol)))
    ?? null
}
