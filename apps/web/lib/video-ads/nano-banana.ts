/**
 * Cliente de Nano Banana Pro (Gemini 3 Pro Image) en KIE, para el avatar del personaje
 * y —más adelante— los frames frontera de cada lote.
 *
 * ⚠️ VA POR EL ENDPOINT DEL MARKETPLACE, NO POR EL DE VEO. Nano Banana Pro usa
 * `jobs/createTask` + `jobs/recordInfo` (`state` string, `resultJson` como STRING con
 * JSON adentro); Veo 3.1 tiene los suyos y responde `successFlag` numérico. Son dos
 * contratos distintos en el mismo proveedor — ver `kie.ts`.
 *
 * Por qué reemplaza a gpt-image-2 para el avatar: conserva la identidad y la prenda
 * desde una sola foto de referencia con una fidelidad muy por encima (probado con el
 * avatar real de la sesión de ropa: cara, peinado, plumeti, cuello en V y los dos
 * volantes de la manga, exactos), y hace **9:16 nativo** — que pasa a hacer falta
 * porque el avatar ya no es solo una referencia, es el primer fotograma del clip.
 *
 * Contrato (docs.kie.ai/market/google/pro-image-to-image):
 *   - `prompt` máx 10.000 caracteres;
 *   - `image_input` hasta 8 imágenes por URL pública (JPEG/PNG/WebP, ≤30 MB c/u);
 *   - `aspect_ratio` incluye 9:16 y 2:3; `resolution` 1K | 2K | 4K; `output_format` png | jpg.
 */

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs'
const MODEL = 'nano-banana-pro'

/** Tope de `prompt` en Nano Banana Pro. Pasarse = 422 con la tarea sin crear. */
export const NANO_PROMPT_MAX = 10000

export interface ImageTaskInput {
  prompt: string
  /** URLs públicas de referencia. El modelo genera A PARTIR de ellas, no desde cero. */
  imageUrls?: string[]
  aspectRatio?: '9:16' | '2:3' | '1:1' | '16:9'
  /** 2K por defecto: el frame alimenta un render de 720p, 4K es gasto sin destino. */
  resolution?: '1K' | '2K' | '4K'
}

/** Cuerpo exacto del POST. Puro y exportado para poder verificarlo sin API key. */
export function buildImageTaskBody(input: ImageTaskInput) {
  return {
    model: MODEL,
    input: {
      prompt: input.prompt,
      ...(input.imageUrls?.length ? { image_input: input.imageUrls } : {}),
      aspect_ratio: input.aspectRatio ?? '9:16',
      resolution: input.resolution ?? '2K',
      output_format: 'png' as const,
    },
  }
}

export interface ImageTaskDetail {
  state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'
  imageUrl: string | null
  failMsg: string | null
}

/**
 * Normaliza `recordInfo`. `resultJson` viene como STRING con JSON adentro — el mismo
 * formato que usaba el render de grok, y la razón por la que esto no se puede compartir
 * con el parser de Veo.
 */
export function parseImageTask(data: unknown): ImageTaskDetail {
  const d = (data ?? {}) as Record<string, unknown>
  const state = (typeof d.state === 'string' ? d.state : 'waiting') as ImageTaskDetail['state']
  let imageUrl: string | null = null
  if (typeof d.resultJson === 'string' && d.resultJson) {
    try {
      const urls = (JSON.parse(d.resultJson) as { resultUrls?: unknown }).resultUrls
      if (Array.isArray(urls) && typeof urls[0] === 'string') imageUrl = urls[0]
    } catch {
      /* resultJson corrupto → todavía sin resultado */
    }
  }
  return {
    state,
    imageUrl,
    failMsg: typeof d.failMsg === 'string' && d.failMsg ? d.failMsg : null,
  }
}

function apiKey(): string {
  const key = process.env.KIE_API_KEY
  if (!key) throw new Error('KIE_API_KEY no está configurada')
  return key
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Genera una imagen y devuelve sus BYTES. Crea la tarea, hace polling y descarga.
 *
 * Es síncrona a propósito, al revés que el render de video: una imagen tarda ~30-60 s
 * medidos y la ruta corre con `maxDuration = 300`, así que no hace falta el ida y vuelta
 * de estado por base de datos que sí necesita un lote de video.
 */
export async function generateImage(
  input: ImageTaskInput,
  // ⚠️ El tiempo VARÍA mucho: lo típico medido son ~56 s, pero una corrida se pasó de
  // 240 s y la siguiente con el mismo prompt volvió a 56 s. Como los frames se generan
  // en paralelo, el tope de la ruta lo marca el más lento, así que 240 s es lo máximo
  // que cabe bajo el `maxDuration = 300` dejando margen para crear las tareas de video.
  // Un timeout acá no cuesta ningún render: falla antes de tocar Veo.
  { timeoutMs = 240_000, pollMs = 5_000 } = {},
): Promise<Buffer> {
  if (input.prompt.length > NANO_PROMPT_MAX) {
    throw new Error(
      `El prompt de imagen no entra en el tope de Nano Banana Pro ` +
      `(${input.prompt.length} de ${NANO_PROMPT_MAX} caracteres).`,
    )
  }

  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildImageTaskBody(input)),
  })
  const json = (await res.json().catch(() => null)) as
    | { code?: number; msg?: string; data?: { taskId?: string } }
    | null
  // Mismo cuidado que en `kie.ts`: KIE devuelve 200 con `code` de error adentro.
  if (!res.ok || !json?.data?.taskId) {
    throw new Error(`Nano Banana createTask falló (${json?.code ?? res.status}): ${json?.msg ?? 'sin respuesta'}`)
  }
  const taskId = json.data.taskId

  const limite = Date.now() + timeoutMs
  for (;;) {
    await sleep(pollMs)
    const r = await fetch(`${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    })
    const body = (await r.json().catch(() => null)) as { data?: unknown } | null
    const detail = parseImageTask(body?.data)
    if (detail.state === 'success' && detail.imageUrl) return downloadImage(detail.imageUrl)
    if (detail.state === 'fail') throw new Error(`Nano Banana falló: ${detail.failMsg ?? 'sin motivo'}`)
    if (Date.now() > limite) throw new Error(`Nano Banana no devolvió la imagen en ${timeoutMs / 1000} s.`)
  }
}

/**
 * La URL sale de la respuesta de KIE, no de un input del usuario, pero se exige https
 * igual: es el guard barato contra que una respuesta manipulada convierta esto en un
 * fetch a un recurso interno (`file:`, `http://` a la red privada).
 */
async function downloadImage(url: string): Promise<Buffer> {
  if (!url.startsWith('https://')) throw new Error(`URL de imagen no es https: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo descargar la imagen de KIE (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}
