import { CPS_MAX, CPS_MIN } from './forensic'

/**
 * Cliente de KIE AI (Grok Imagine `image-to-video`) para el render de video.
 *
 * KIE es ASÍNCRONO: createTask devuelve un taskId al instante (200 ≠ terminado) y el
 * resultado se consulta con recordInfo. Por eso el render NO usa el patrón SSE del
 * generador de anuncios: la ruta crea la tarea y responde, y el cliente hace polling.
 *
 * ⚠️ VUELTA AL PROMPT MAESTRO Y A `grok-imagine-video-1-5-preview` (2026-09-03, decisión
 * del dueño del repo). Su palabra: *"todo el sistema de video está contaminado después de
 * tantas iteraciones para tratar de arreglarlo"*. La fuente de verdad vuelve a ser
 * `PROMPT_MAESTRO_VIDEO_UGC_ACTUALIZADO.md`, y el prompt que llega a grok vuelve a su forma
 * —bloques rotulados y una secuencia de acciones NUMERADA por toma— en vez de la plantilla
 * en telegrama que fue creciendo a fuerza de parches.
 *
 * ⚠️ ES OTRO MODELO QUE `grok-imagine/image-to-video`, y el contrato cambia con él.
 *
 * ✅ MEDIDO CON EL CANARIO GRATIS (2026-09-03), que es lo único que vale acá: la validación
 * de KIE corre ANTES de despachar, así que un campo inválido vuelve sin `taskId` y sin
 * cobrar. Mandando siempre UN campo inválido se comprueba el resto de balde.
 *   - `prompt`: **4.096** caracteres. 4.097 devuelve *"The text length cannot exceed the
 *     maximum limit"* y 4.096 pasa. Son 904 MENOS que el modelo anterior, así que el
 *     presupuesto del prompt vuelve a ser un problema real.
 *   - `image_urls`: **7 aceptadas** (probado con 3 y con 7).
 *   - `aspect_ratio`: se valida contra una lista cerrada —un valor basura devuelve
 *     *"aspect_ratio is not within the range of allowed options"*— y `9:16` la pasa.
 *   - `duration`: entero. 0 y 999 devuelven *"Value must be within the specified range"*;
 *     el rango de la ficha del modelo es 1–15. Acepta number y también string.
 *   - `mode` y `nsfw_checker`: aceptados.
 *
 * ⚠️ EL RANGO EXACTO DE `duration` NO SE PUDO AISLAR GRATIS, y conviene saber por qué: el
 * único canario disponible enmascara al siguiente (con `aspect_ratio` basura la API se
 * queja de eso y ya no evalúa la duración; con el prompt largo, del largo). Lo que sí está
 * medido son los extremos rechazados. Todo lote nuestro cae dentro de 1–15 por la REGLA
 * MÁXIMA DE 15 SEGUNDOS del spec, así que el rango no se ejercita en los bordes.
 *
 * Contrato (marketplace: `/api/v1/jobs/createTask` + `recordInfo`, `state` string y
 * `resultJson` como STRING con JSON adentro):
 *   - `resolution`: `480p` (default) | `720p` | `1080p`. Va 720p.
 *   - `aspect_ratio`: `9:16`. ⚠️ Sigue siendo inválido con UNA sola imagen — ver
 *     `vertical.ts`, el salvavidas documentado para ese caso.
 *   - `nsfw_checker`: ⚠️ el default de la API es **false**, y false DESACTIVA el filtro.
 *     Acá va **true** a propósito: queremos el filtro puesto.
 *   - Las imágenes se citan en el prompt como @image(1), @image(2)… en el orden del
 *     array. Sin esa leyenda el modelo mezcla los sujetos.
 *
 * ⚠️ LOS ERRORES VIENEN EN HTTP 200 CON `code: 500` ADENTRO (no 422, y no en el status).
 * Mirar solo `res.ok` deja pasar el fallo como éxito y el polling espera para siempre un
 * taskId que no existe. Por eso `createVideoTask` exige `data.taskId`.
 */

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs'
const MODEL = 'grok-imagine-video-1-5-preview'

export type KieState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'

export interface VideoImage {
  /** URL pública (Supabase storage). Ojo: uploadToStorage le añade `?v=<ts>`. */
  url: string
  /** Cómo se nombra en el prompt: "la persona", "el producto". */
  role: string
}

export interface VideoTaskInput {
  images: VideoImage[]
  prompt: string
  durationSec: number
  /** Caracteres de la locución del lote: decide si la duración deja decirla. */
  locucionChars?: number
  /** Cuántas tomas trae el lote. >1 desactiva el techo blando — ver `clampDuration`. */
  tomas?: number
}

/** Rango legal de `duration` en este modelo. Entero, y viaja como STRING. */
export const MIN_DURATION = 1
export const MAX_DURATION = 15

/**
 * Cuántas imágenes acepta el modelo por tarea. Es el techo del sistema de anclas:
 * avatar + producto + los fotogramas ancla que haga falta generar.
 */
export const MAX_IMAGES = 7

/** Tope de `input.prompt`, CONFIRMADO con el canario. Pasarse = tarea rechazada. */
export const KIE_PROMPT_MAX = 4096

/**
 * Ajusta la duración de un lote al rango legal, sin perder ninguna de las dos lecciones
 * que ya estaban medidas cuando el rango era el conjunto discreto {4, 6, 8} de Veo.
 *
 * Con un rango CONTINUO 6–30 esto se vuelve un clamp entre dos cotas en vez de una
 * búsqueda sobre un conjunto, pero las cotas son las mismas:
 *
 *  1. PISO DURO (`>= chars / CPS_MAX`): el texto tiene que poder decirse. Violarlo corta
 *     el diálogo a mitad de frase.
 *  2. TECHO BLANDO (`<= chars / CPS_MIN`): el texto no puede quedar tan suelto que el
 *     modelo rellene. ⚠️ Medido en su momento: 23 caracteres en 6 s (3,8 car/s) hicieron
 *     que el generador dijera la frase DOS VECES para llenar el audio. El techo blando
 *     nunca puede quedar por debajo del piso duro — si chocan, manda el piso.
 *
 * Dentro de esa banda se elige la duración ORIGINAL de la toma, que es lo que conserva
 * el ritmo del anuncio de referencia.
 *
 * Una toma MUDA no tiene techo blando: sin habla no hay nada que repetir, y su duración
 * es un beat visual que conviene respetar tal cual.
 *
 * ⚠️ EL TECHO BLANDO SOLO APLICA A UN CLIP DE UNA SOLA ESCENA, y ese acote es
 * obligatorio con el cap de 30 s. La medición que lo justifica es de un clip de 6 s con
 * UNA línea de 23 caracteres: ahí el modelo no tenía nada más que hacer y repitió la
 * frase. Un clip de 30 s con varias tomas es otra cosa — cada toma trae su propia
 * `accionVisual`, y el silencio entre escenas es la textura que se está copiando del
 * original, no aire muerto.
 *
 * Sin este acote el techo blando recorta el clip a la duración que "merece" su texto y
 * se lleva puestas las escenas de más: medido con estos mismos números, un lote de 30 s
 * con 200 caracteres caía a 22 s y uno con 120 caracteres a **13 s** — o sea 17
 * segundos de shot list descartados en silencio, justo los que tienen su imagen ancla
 * ya generada y pagada.
 *
 * ⚠️ El piso de la API es 1 s, así que ya no infla ningún lote: con el modelo anterior era
 * 6 s y eso metía holgura —que grok rellena inventando— en toda toma corta. La toma de 3 s
 * del spec se renderiza como 3 s.
 */
export function clampDuration(sec: number, locucionChars = 0, tomas = 1): number {
  const objetivo = Number.isFinite(sec) && sec > 0 ? Math.round(sec) : MIN_DURATION
  const piso = Math.max(MIN_DURATION, Math.ceil(locucionChars / CPS_MAX))
  // El techo blando solo existe si hay UNA escena y algo que decir, y jamás por debajo
  // del piso duro: si chocan, manda el piso (el texto tiene que poder decirse).
  const techo = locucionChars > 0 && tomas <= 1
    ? Math.min(MAX_DURATION, Math.max(piso, Math.floor(locucionChars / CPS_MIN)))
    : MAX_DURATION
  return Math.min(techo, Math.max(piso, objetivo))
}

/** 720p fijo: el entregable es un feed vertical, y 1080p además exige UNA sola imagen. */
export function resolutionFor(): '720p' {
  return '720p'
}

/** Cuerpo exacto del POST. Puro y exportado para poder verificarlo sin API key. */
export function buildTaskBody(input: VideoTaskInput) {
  return {
    model: MODEL,
    input: {
      image_urls: input.images.map((i) => i.url),
      prompt: input.prompt,
      // Entero, que es lo que dice la ficha de este modelo (acepta string también).
      duration: clampDuration(input.durationSec, input.locucionChars, input.tomas),
      resolution: resolutionFor(),
      aspect_ratio: '9:16',
      mode: 'normal',
      // true = filtro de contenido ACTIVADO (el default de la API es false, que lo apaga).
      nsfw_checker: true,
    },
  }
}

export const SIN_KEY =
  'Para generar video necesitas tu propia API key de KIE. Cárgala en Mi cuenta y vuelve a intentarlo.'

/**
 * La key con la que se llama a KIE. BYOK ESTRICTO: el render lo paga el usuario con
 * SU cuenta, así que la key sale de `user_settings` y se pasa por parámetro.
 *
 * ⚠️ YA NO HAY KEY GLOBAL. Hasta 2026-08-24 esto caía a `process.env.KIE_API_KEY`
 * cuando el usuario no había cargado la suya: el hub terminaba pagando renders
 * ajenos sin que nada lo reportara. El fallback se quitó entero —también para dev—
 * porque un respaldo silencioso es exactamente el modo de fallo que hay que evitar:
 * si la key falta, se ve.
 *
 * ⚠️ Se resuelve por parámetro y no leyendo la sesión acá adentro para que este
 * módulo siga siendo el cliente HTTP puro que ya era — testeable sin cookies.
 */
export function resolveKey(userKey?: string | null): string {
  const key = (userKey ?? '').trim()
  if (!key) throw new Error('Falta tu API key de KIE: cárgala en Mi cuenta.')
  return key
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
 * ⚠️ Lo rompió de verdad. El bucle de polling de la generación de imagen comprobaba su
 * presupuesto DESPUÉS del `await fetch`, así que un fetch colgado impedía que el tope se
 * evaluara nunca: el dev server quedó bloqueado con 0 % de CPU y una conexión ESTAB a
 * api.kie.ai. En Vercel el síntoma sería distinto y peor de diagnosticar — la función
 * muere en `maxDuration` con las tareas ya creadas y pagadas.
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

/** Crea la tarea de render. Devuelve el taskId; NO espera al video. */
export async function createVideoTask(input: VideoTaskInput, userKey?: string | null): Promise<string> {
  const res = await fetchKie(`${KIE_BASE}/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resolveKey(userKey)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTaskBody(input)),
  })
  const json = (await res.json().catch(() => null)) as
    | { code?: number; msg?: string; data?: { taskId?: string } }
    | null
  // ⚠️ KIE devuelve HTTP 200 con `code` de error adentro en los fallos de validación, así
  // que mirar solo `res.ok` deja pasar el fallo como éxito y después el polling espera
  // para siempre un taskId que no existe.
  if (!res.ok || !json?.data?.taskId) {
    throw new Error(`KIE createTask falló (${json?.code ?? res.status}): ${json?.msg ?? 'sin respuesta'}`)
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
 * Normaliza la respuesta de recordInfo del MARKETPLACE.
 *
 * ⚠️ Distinto de Veo en las dos cosas que importan: el estado es un `state` STRING (no un
 * `successFlag` numérico) y `resultJson` viene como STRING con JSON adentro
 * (`{"resultUrls":["…"]}`), no como objeto. Mezclar los dos parsers deja el polling
 * esperando para siempre un video que ya está listo.
 */
export function parseTaskDetail(data: unknown): TaskDetail {
  const d = (data ?? {}) as Record<string, unknown>
  const estados: KieState[] = ['waiting', 'queuing', 'generating', 'success', 'fail']
  const bruto = typeof d.state === 'string' ? d.state : ''
  const state: KieState = (estados as string[]).includes(bruto) ? (bruto as KieState) : 'waiting'

  let videoUrl: string | null = null
  if (typeof d.resultJson === 'string' && d.resultJson) {
    try {
      const urls = (JSON.parse(d.resultJson) as { resultUrls?: unknown }).resultUrls
      if (Array.isArray(urls) && typeof urls[0] === 'string') videoUrl = urls[0]
    } catch {
      /* resultJson corrupto → todavía sin resultado, no un fallo duro */
    }
  }

  return {
    state,
    progress: typeof d.progress === 'number' ? d.progress : state === 'success' ? 1 : 0,
    videoUrl,
    failMsg: typeof d.failMsg === 'string' && d.failMsg ? d.failMsg : null,
  }
}

/** Consulta el estado de una tarea. */
export async function getTaskDetail(taskId: string, userKey?: string | null): Promise<TaskDetail> {
  const res = await fetchKie(`${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${resolveKey(userKey)}` },
  })
  const json = (await res.json().catch(() => null)) as { data?: unknown } | null
  if (!res.ok) throw new Error(`KIE recordInfo falló (${res.status})`)
  return parseTaskDetail(json?.data)
}
