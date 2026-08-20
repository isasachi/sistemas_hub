import { CPS_MAX, CPS_MIN } from './forensic'

/**
 * Cliente de KIE AI (Veo 3.1) para el render de video.
 *
 * KIE es ASÍNCRONO: generate devuelve un taskId al instante (200 ≠ terminado) y el
 * resultado se consulta con record-info. Por eso el render NO usa el patrón SSE del
 * generador de anuncios: la ruta crea la tarea y responde, y el cliente hace polling.
 *
 * ⚠️ VEO VIVE EN OTRO ENDPOINT QUE EL RESTO DEL MARKETPLACE DE KIE. Grok y Nano Banana
 * Pro van por `/api/v1/jobs/createTask` + `recordInfo`; Veo tiene los suyos y una forma
 * de respuesta distinta (`successFlag` numérico en vez de `state` string). No es un
 * cambio de string de modelo: es otro cliente.
 *
 * Restricciones reales, todas MEDIDAS contra la API el 2026-08-19 (docs.kie.ai/veo3-api):
 *   - `duration` acepta EXACTAMENTE 4, 6 u 8 segundos. Nada de decimales ni de 15.
 *     Ver `snapDuration`, que es donde se decide qué se pierde al ajustar.
 *   - `prompt` topa en 60.000 caracteres (`422 "The prompt word cannot exceed 60000
 *     characters"`). Son 14,6× el tope de grok, y por eso `buildLotePrompt` ya no
 *     necesita la escalera de degradación que existía para caber en 4096.
 *   - `generationType` decide qué significan las imágenes, y los modos son EXCLUYENTES:
 *     `REFERENCE_2_VIDEO` (1–3 refs, solo fast/lite, solo 8 s) o
 *     `FIRST_AND_LAST_FRAMES_2_VIDEO` (1–2 keyframes: primero y último).
 *   - El prompt puede ir en ESPAÑOL y la locución entrecomillada se dice literal, con
 *     acento latinoamericano. Medido con dos renders: la afirmación de que Veo 3.1 solo
 *     acepta inglés es falsa, y `enableTranslation` NO toca el texto entrecomillado.
 *
 * El canario para probar el body sin gastar: mandar `duration: 5` (inválido) devuelve
 * 422 SIN taskId, o sea la validación corre antes de despachar y no cobra. Cualquier
 * otro campo se verifica gratis mandándolo junto a esa duración inválida.
 */

const VEO_BASE = 'https://api.kie.ai/api/v1/veo'
const MODEL = 'veo3_fast'

export type KieState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'

export interface VideoImage {
  /** URL pública (Supabase storage). Ojo: uploadToStorage le añade `?v=<ts>`. */
  url: string
  /** Cómo se nombra en el prompt: "la persona", "el producto". */
  role: string
}

/**
 * `frames`: las imágenes son el primer y el último fotograma del clip — el modelo tiene
 * que llegar de una a la otra, así que el movimiento sale interpolado de verdad en vez
 * de inventado. `reference`: son material de referencia y se citan como @image(n).
 */
export type VideoMode = 'frames' | 'reference'

export interface VideoTaskInput {
  images: VideoImage[]
  prompt: string
  durationSec: number
  /** Caracteres de la locución del lote: decide si una duración legal alcanza. */
  locucionChars?: number
  mode?: VideoMode
}

/** Las únicas duraciones que Veo 3.1 acepta. */
export const DURATIONS = [4, 6, 8] as const
export const MIN_DURATION = DURATIONS[0]
export const MAX_DURATION = DURATIONS[DURATIONS.length - 1]

/** Tope de `prompt` en Veo 3.1. Pasarse = 422 con la cuota ya gastada. */
export const KIE_PROMPT_MAX = 60000

/**
 * Ajusta una duración continua al conjunto legal {4, 6, 8}.
 *
 * Las dos cosas que hay que respetar tiran en direcciones distintas: el clip debería
 * durar lo que duraba la toma en el original (ritmo), y la locución tiene que caber sin
 * atropellarse (inteligibilidad). Redondear siempre hacia arriba mete silencio; siempre
 * hacia abajo corta diálogo a mitad de frase, que es mucho peor.
 *
 * Dos condiciones, en orden de prioridad:
 *
 *  1. DURA (`>= chars / CPS_MAX`): el texto tiene que poder decirse. Violarla corta
 *     diálogo a mitad de frase.
 *  2. BLANDA (`<= chars / CPS_MIN`): el texto no puede quedar tan suelto que el modelo
 *     rellene. ⚠️ Medido: 23 caracteres en 6 s (3,8 car/s) hicieron que Veo dijera la
 *     frase DOS VECES para llenar el audio. Antes solo existía la condición dura, así
 *     que un clip largo con una línea corta pasaba sin que nada lo mirara.
 *
 * Entre las que cumplen las dos se elige la más cercana a la duración original, para
 * conservar el ritmo del anuncio. Si ninguna cumple la blanda se toma la MÁS CORTA de
 * las que cumplen la dura: es la que menos silencio deja para rellenar.
 *
 * Una toma MUDA no entra en esto: sin habla no hay nada que repetir, y su duración es un
 * beat visual que conviene respetar tal cual.
 *
 * Si el texto no entra ni en 8 s, devuelve 8: es el techo de la API y significa que la
 * toma tendría que haberse partido antes (`splitLongToma`), no que acá se pueda arreglar.
 */
export function snapDuration(sec: number, locucionChars = 0): number {
  const objetivo = Number.isFinite(sec) && sec > 0 ? sec : MAX_DURATION
  const cercana = (ds: readonly number[]) =>
    ds.reduce((mejor, d) => (Math.abs(d - objetivo) < Math.abs(mejor - objetivo) ? d : mejor))

  const caben = DURATIONS.filter((d) => d >= locucionChars / CPS_MAX)
  if (caben.length === 0) return MAX_DURATION
  // Sin locución no aplica el piso: el clip es un beat visual, no audio que rellenar.
  if (locucionChars === 0) return cercana(caben)

  const sinHuecos = caben.filter((d) => d <= locucionChars / CPS_MIN)
  return sinHuecos.length ? cercana(sinHuecos) : Math.min(...caben)
}

/** 720p fijo: el entregable es un feed vertical y 1080p multiplica el costo del render. */
export function resolutionFor(): '720p' {
  return '720p'
}

/** Cuerpo exacto del POST. Puro y exportado para poder verificarlo sin API key. */
export function buildTaskBody(input: VideoTaskInput) {
  const mode: VideoMode = input.mode ?? 'reference'
  return {
    model: MODEL,
    prompt: input.prompt,
    imageUrls: input.images.map((i) => i.url),
    generationType:
      mode === 'frames' ? 'FIRST_AND_LAST_FRAMES_2_VIDEO' : 'REFERENCE_2_VIDEO',
    duration: snapDuration(input.durationSec, input.locucionChars),
    resolution: resolutionFor(),
    aspect_ratio: '9:16',
  }
}

/**
 * Tope por petición HTTP. Crear una tarea o consultar su estado son respuestas JSON
 * chicas: si una tarda más que esto, está colgada, no lenta.
 */
export const KIE_HTTP_TIMEOUT_MS = 30_000

/**
 * `fetch` con timeout. NO es una precaución teórica: `fetch` en Node no tiene timeout por
 * defecto, y una conexión que el proveedor deja abierta sin responder cuelga el await
 * para siempre.
 *
 * ⚠️ Lo rompió de verdad. El bucle de polling de `nano-banana.ts` comprobaba su
 * presupuesto DESPUÉS del `await fetch`, así que un fetch colgado impedía que el tope de
 * 240 s se evaluara nunca: el dev server quedó bloqueado con 0 % de CPU y una conexión
 * ESTAB a api.kie.ai. En Vercel el síntoma sería distinto y peor de diagnosticar — la
 * función muere en `maxDuration` con las tareas ya creadas y pagadas.
 */
export async function fetchKie(url: string, init: RequestInit = {}, timeoutMs = KIE_HTTP_TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(`KIE no respondió en ${Math.round(timeoutMs / 1000)} s (${url.split('?')[0]})`)
    }
    throw err
  }
}

/**
 * La key con la que se llama a KIE. BYOK: el render lo paga el usuario con SU
 * cuenta, así que la key sale de `user_settings` y se pasa por parámetro; el env
 * `KIE_API_KEY` queda como respaldo del hub (dev, y las sesiones de quien todavía
 * no cargó la suya).
 *
 * ⚠️ Se resuelve por parámetro y no leyendo la sesión acá adentro para que este
 * módulo siga siendo el cliente HTTP puro que ya era — testeable sin cookies.
 */
export function resolveKey(userKey?: string | null): string {
  const key = (userKey ?? '').trim() || process.env.KIE_API_KEY
  if (!key) throw new Error('Falta la API key de KIE: cárgala en Ajustes.')
  return key
}

/** Crea la tarea de render. Devuelve el taskId; NO espera al video. */
export async function createVideoTask(input: VideoTaskInput, userKey?: string | null): Promise<string> {
  const res = await fetchKie(`${VEO_BASE}/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resolveKey(userKey)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTaskBody(input)),
  })
  const json = (await res.json().catch(() => null)) as
    | { code?: number; msg?: string; data?: { taskId?: string } }
    | null
  // ⚠️ Veo devuelve HTTP 200 con `code: 422` adentro en los errores de validación, así
  // que mirar solo `res.ok` deja pasar un fallo como éxito y después el polling espera
  // para siempre un taskId que no existe.
  if (!res.ok || json?.code !== 200 || !json?.data?.taskId) {
    throw new Error(`KIE veo/generate falló (${json?.code ?? res.status}): ${json?.msg ?? 'sin respuesta'}`)
  }
  return json.data.taskId
}

export interface TaskDetail {
  state: KieState
  progress: number
  videoUrl: string | null
  failMsg: string | null
}

/**
 * Normaliza la respuesta de record-info. Veo usa `successFlag` numérico (0 en curso,
 * 1 ok, 2|3 falló) y devuelve las URLs en `response.resultUrls` como ARRAY — no como el
 * string con JSON adentro que usaba el marketplace. Se conserva el enum `KieState`
 * porque es lo que persiste `Lote.status` y lo que lee la UI; `queuing` simplemente ya
 * no se emite (Veo no distingue cola de generación).
 */
export function parseTaskDetail(data: unknown): TaskDetail {
  const d = (data ?? {}) as Record<string, unknown>
  const flag = typeof d.successFlag === 'number' ? d.successFlag : 0
  const resp = (d.response ?? d) as Record<string, unknown>
  const urls = resp?.resultUrls
  const videoUrl =
    Array.isArray(urls) && typeof urls[0] === 'string' ? (urls[0] as string) : null
  const failMsg =
    typeof d.errorMessage === 'string' && d.errorMessage ? d.errorMessage : null
  if (flag === 1) return { state: 'success', progress: 1, videoUrl, failMsg: null }
  if (flag === 2 || flag === 3) return { state: 'fail', progress: 0, videoUrl: null, failMsg }
  return { state: 'generating', progress: 0, videoUrl: null, failMsg: null }
}

export async function getTaskDetail(taskId: string, userKey?: string | null): Promise<TaskDetail> {
  const res = await fetchKie(`${VEO_BASE}/record-info?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${resolveKey(userKey)}` },
  })
  const json = (await res.json().catch(() => null)) as { data?: unknown; msg?: string } | null
  if (!res.ok) throw new Error(`KIE veo/record-info falló (${res.status}): ${json?.msg ?? ''}`)
  return parseTaskDetail(json?.data)
}
