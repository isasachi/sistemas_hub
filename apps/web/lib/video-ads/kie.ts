/**
 * Cliente de KIE AI (Grok Imagine 1.5) para el render de video.
 *
 * KIE es ASÍNCRONO: createTask devuelve un taskId al instante (200 ≠ terminado) y el
 * resultado se consulta con recordInfo. Por eso el render NO usa el patrón SSE del
 * generador de anuncios: la ruta crea la tarea y responde, y el cliente hace polling.
 *
 * Restricciones reales de la API que este módulo blinda
 * (docs.kie.ai/market/grok-imagine/1-5-preview):
 *   - `duration` es INTEGER, entre 1 y 15 (default 8). Ojo: el otro modelo del
 *     marketplace, `grok-imagine/image-to-video`, usa STRING 6–30 y SÍ acepta `mode`.
 *     Son contratos distintos: cambiar de modelo obliga a revisar este bloque entero,
 *     los tests y el rango que expone el wizard.
 *   - `input` es additionalProperties:false → mandar `mode` rompe la validación.
 *   - `aspect_ratio` default es `auto` → hay que forzar 9:16 para UGC vertical, PERO
 *     "This parameter is invalid if it is a single image": con una sola imagen manda
 *     el ratio del origen → ver `vertical.ts`.
 *   - `resolution: "1080p"` SOLO admite una imagen; acá va 720p fijo igual.
 *   - `prompt` topa en 4096 caracteres (el otro modelo daba 5000 — es MENOS margen
 *     para el detalle forense: el armado del prompt de render, incluido `buildVideoPrompt`,
 *     lo reconstruye el PLAN B — ver `KIE_PROMPT_MAX`).
 *   - Las imágenes se referencian en el prompt como @image(1), @image(2)… en el mismo
 *     orden del array. Sin esa leyenda Grok mezcla los sujetos.
 *   - Máximo 7 imágenes, 20 MB c/u, y deben ser URLs públicas.
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
}

export const MIN_DURATION = 1
export const MAX_DURATION = 15

/** Tope de `input.prompt` en KIE. Pasarse = 422 con la cuota ya gastada. */
export const KIE_PROMPT_MAX = 4096

/**
 * Clamp al rango de Grok 1.5: entero 1–15 s (default 8). Un solo clamp para los dos
 * consumidores —el guión y el render—: dos se desincronizan y la duración fuera de
 * rango solo aparecería al crear la tarea, con la cuota ya gastada.
 */
export function clampDuration(sec: number): number {
  if (!Number.isFinite(sec)) return 8
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(sec)))
}

/**
 * 720p fijo en las tres líneas. 1080p solo existe con UNA imagen (o sea, solo la
 * línea `video-ref`), así que subirlo ahí encarece el render más caro del hub a
 * cambio de una calidad desigual entre líneas que en un feed vertical no se nota.
 * ponytail: un solo tier; si algún día hace falta 1080p, vuelve el parámetro.
 */
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
      duration: clampDuration(input.durationSec),
      resolution: resolutionFor(),
      aspect_ratio: '9:16',
      nsfw_checker: true,
    },
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
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resolveKey(userKey)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTaskBody(input)),
  })
  const json = (await res.json().catch(() => null)) as
    | { code?: number; msg?: string; data?: { taskId?: string } }
    | null
  if (!res.ok || !json?.data?.taskId) {
    throw new Error(`KIE createTask falló (${res.status}): ${json?.msg ?? 'sin respuesta'}`)
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
 * Normaliza la respuesta de recordInfo. `resultJson` viene como STRING con JSON
 * adentro (`{"resultUrls":["…"]}`) — hay que parsearlo aparte. Puro para testear.
 */
export function parseTaskDetail(data: unknown): TaskDetail {
  const d = (data ?? {}) as Record<string, unknown>
  const state = (typeof d.state === 'string' ? d.state : 'waiting') as KieState
  let videoUrl: string | null = null
  if (typeof d.resultJson === 'string' && d.resultJson) {
    try {
      const parsed = JSON.parse(d.resultJson) as { resultUrls?: unknown }
      const urls = parsed.resultUrls
      if (Array.isArray(urls) && typeof urls[0] === 'string') videoUrl = urls[0]
    } catch {
      /* resultJson corrupto → tratamos como sin resultado todavía */
    }
  }
  return {
    state,
    progress: typeof d.progress === 'number' ? d.progress : 0,
    videoUrl,
    failMsg: typeof d.failMsg === 'string' && d.failMsg ? d.failMsg : null,
  }
}

export async function getTaskDetail(taskId: string, userKey?: string | null): Promise<TaskDetail> {
  const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${resolveKey(userKey)}` },
  })
  const json = (await res.json().catch(() => null)) as { data?: unknown; msg?: string } | null
  if (!res.ok) throw new Error(`KIE recordInfo falló (${res.status}): ${json?.msg ?? ''}`)
  return parseTaskDetail(json?.data)
}
