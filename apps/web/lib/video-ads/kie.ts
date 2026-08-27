import { CPS_MAX, CPS_MIN } from './forensic'

/**
 * Cliente de KIE AI (Grok Imagine `image-to-video`) para el render de video.
 *
 * KIE es ASÍNCRONO: createTask devuelve un taskId al instante (200 ≠ terminado) y el
 * resultado se consulta con recordInfo. Por eso el render NO usa el patrón SSE del
 * generador de anuncios: la ruta crea la tarea y responde, y el cliente hace polling.
 *
 * ⚠️ VUELTA A GROK DESDE VEO 3.1 (2026-08-24, decisión del dueño del repo). Veo vivía en
 * `/api/v1/veo/*` con `successFlag` numérico; este modelo está en el MARKETPLACE
 * (`/api/v1/jobs/createTask` + `recordInfo`), con `state` string y `resultJson` como
 * STRING con JSON adentro. No es un cambio de string de modelo: es otro cliente, otro
 * parser y otro contrato de duraciones.
 *
 * ⚠️ Y NO ES EL MISMO GROK QUE HUBO ANTES. `grok-imagine-video-1-5-preview` (el de la
 * primera época de esta tool) tomaba `duration` INTEGER 1–15, prompt de 4096 y rechazaba
 * `mode`. Éste toma `duration` STRING 6–30, prompt de 5000 y acepta `mode`. Copiar el
 * cliente viejo tal cual lo rechaza la validación.
 *
 * Contrato (docs.kie.ai/market/grok-imagine/image-to-video):
 *   - `image_urls`: hasta **7** imágenes, **10 MB** cada una (no 20), JPEG/PNG/WEBP, y
 *     URLs públicas. Con `resolution: 1080p` solo se admite UNA — otra razón para 720p.
 *   - `prompt`: máx **5000** caracteres, y la doc dice *English only*. Ver `KIE_PROMPT_MAX`
 *     y la nota de idioma en `buildLotePrompt`: el andamiaje va en inglés y la locución
 *     entrecomillada en español, que es lo que el anuncio tiene que decir.
 *   - `duration`: **STRING**, 6–30 segundos en pasos de 1. ⚠️ Medido con el canario: la
 *     API acepta TAMBIÉN el number, así que el `String()` no es lo que evita un 422 —
 *     se manda string porque es lo que dice la doc, no porque el number falle. Los dos
 *     extremos del rango ("6" y "30") pasaron la validación.
 *   - `resolution`: `480p` (default) | `720p` | `1080p`.
 *   - `aspect_ratio`: `9:16` para UGC vertical. ⚠️ "This parameter is invalid if it is a
 *     single image": con UNA sola imagen manda el ratio del origen — ver `vertical.ts`.
 *   - `mode`: `fun` | `normal` (default) | `spicy`. Va `normal` explícito.
 *   - `nsfw_checker`: ⚠️ el default de la API es **false**, y false DESACTIVA el filtro.
 *     Acá va **true** a propósito: queremos el filtro puesto.
 *   - Las imágenes se citan en el prompt como @image(1), @image(2)… en el orden del
 *     array. Sin esa leyenda el modelo mezcla los sujetos.
 *
 * ⚠️ LOS ERRORES VIENEN EN HTTP 200 CON `code: 500` ADENTRO (no 422, y no en el status).
 * Mirar solo `res.ok` deja pasar el fallo como éxito y el polling espera para siempre un
 * taskId que no existe. Por eso `createVideoTask` exige `data.taskId`.
 *
 * EL CANARIO GRATIS (`scripts/canary-grok.ts`, medido el 2026-08-24): la validación corre
 * ANTES de despachar, así que un campo inválido devuelve error SIN `taskId` y sin cobrar.
 * Mandando una `duration` fuera de rango se verifica gratis todo lo demás; y al revés,
 * mandando un prompt de 5001 caracteres se verifica gratis la duración. Así se
 * confirmaron, sin gastar un render: prompt de 5000 OK y 5001 rechazado ("The text length
 * cannot exceed the maximum limit"), 7 imágenes OK, y "6"/"12"/"30" válidas.
 */

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs'
const MODEL = 'grok-imagine/image-to-video'

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
export const MIN_DURATION = 6
export const MAX_DURATION = 30

/**
 * Cuántas imágenes acepta el modelo por tarea. Es el techo del sistema de anclas:
 * avatar + producto + los fotogramas ancla que haga falta generar.
 */
export const MAX_IMAGES = 7

/** Tope de `input.prompt`, CONFIRMADO con el canario. Pasarse = tarea rechazada. */
export const KIE_PROMPT_MAX = 5000

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
 * ⚠️ Un lote más corto que `MIN_DURATION` se sube a 6 s: es el mínimo de la API. Deja un
 * poco de aire al final, que es preferible a no poder renderizarlo.
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
      // ⚠️ STRING, no number. Es la diferencia de contrato con el grok viejo y con Veo.
      duration: String(clampDuration(input.durationSec, input.locucionChars, input.tomas)),
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
