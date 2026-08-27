import { createHash } from 'crypto'
import type { Part } from '@google/genai'

import { uploadToStorage } from './storage'

/**
 * SEGUNDO RECURSO MIGRADO A KIE: la IMAGEN (2026-08-25).
 * ---------------------------------------------------------------------------
 * `gpt-image-2` y `gemini-3.1-flash-image` —que en KIE se llama `nano-banana-2`— dejan sus SDK y
 * salen por el marketplace: `jobs/createTask` + polling de `recordInfo`.
 *
 * El PAR de proveedores no cambia: gpt-image-2 primario, nano-banana-2 de respaldo, y
 * `preferGemini` lo invierte — exactamente como estaba con los SDK. Quien orquesta el par sigue
 * siendo `generateImage` (gemini.ts); acá vive el transporte de UN modelo.
 *
 * ⚠️ `IMAGE_VIA=direct` devuelve el recurso a los SDK sin desplegar (ver `imagenDirecta`).
 */

const BASE = process.env.KIE_API_BASE ?? 'https://api.kie.ai'
const CREATE_TASK = `${BASE}/api/v1/jobs/createTask`
const RECORD_INFO = `${BASE}/api/v1/jobs/recordInfo`

const HTTP_TIMEOUT_MS = 60_000
const BUDGET_MS = 240_000
const POLL_MS = 3_000

export type ModeloImagen = 'gpt-image-2' | 'nano-banana-2'

function apiKey(): string {
  const k = process.env.KIE_API_KEY
  if (!k) throw new Error('KIE_API_KEY no configurada: no se pueden generar imágenes por KIE')
  return k
}

/**
 * ⚠️ KIE devuelve HTTP 200 con el error DENTRO del cuerpo (`{code:500,…}`) — mirar solo `res.ok`
 * deja pasar el fallo como éxito. Y en Node `fetch` no tiene timeout propio: toda petición lleva
 * `AbortSignal.timeout` (un polling sin tope colgó el dev server una vez, con el proceso al 0 % de
 * CPU y una conexión abierta a api.kie.ai).
 */
async function kieFetch(url: string, init: RequestInit & { timeoutMs?: number }): Promise<Record<string, unknown>> {
  const { timeoutMs = HTTP_TIMEOUT_MS, ...rest } = init
  const res = await fetch(url, {
    ...rest,
    headers: { Authorization: `Bearer ${apiKey()}`, ...(rest.body ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const code = typeof json?.code === 'number' ? json.code : null
  if (!res.ok || (code !== null && code !== 200)) {
    throw new Error(`KIE imagen → ${res.status} ${code ?? ''} ${String(json?.msg ?? '')}`.trim())
  }
  return json ?? {}
}

// Los dos modelos comparten estos ratios; cualquier otro cae a `auto`.
const RATIOS = new Set(['1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '21:9'])

export function imageAspect(aspectRatio?: string): string {
  return aspectRatio && RATIOS.has(aspectRatio) ? aspectRatio : 'auto'
}

/** ⚠️ `auto` y los ratios 5:4/4:5 solo existen en 1K — documentado en los dos modelos. */
export function imageResolution(aspect: string, imageSize?: string): string {
  if (aspect === 'auto' || aspect === '5:4' || aspect === '4:5') return '1K'
  return imageSize === '4K' || imageSize === '1K' ? imageSize : '2K'
}

/**
 * ⚠️ CADA MODELO NOMBRA DISTINTO EL CAMPO DE REFERENCIAS, Y EQUIVOCARSE NO FALLA RUIDOSO:
 * mandando `image_input` a gpt-image-2, KIE crea la tarea, la termina con `state: success` y
 * entrega una imagen generada SOLO desde el prompt — un text-to-image disfrazado de edición.
 * Por eso el body se arma por modelo y hay un test que lo fija.
 *
 * ⚠️ `output_format: 'png'` explícito: el default de nano-banana-2 es **jpg**, y los call sites
 * suben lo que vuelve como `image/png`. Sin esto se guardarían bytes jpg con nombre .png.
 */
export function buildImageBody(modelo: ModeloImagen, prompt: string, urls: string[], aspect: string, resolution: string) {
  const comun = { prompt, aspect_ratio: aspect, resolution, output_format: 'png' }
  if (modelo === 'nano-banana-2') {
    return { model: 'nano-banana-2', input: { ...comun, ...(urls.length ? { image_input: urls } : {}) } }
  }
  return {
    model: urls.length ? 'gpt-image-2-image-to-image' : 'gpt-image-2-text-to-image',
    input: { ...comun, ...(urls.length ? { input_urls: urls } : {}) },
  }
}

/**
 * ⚠️ LOS MODELOS DE IMAGEN NO ACEPTAN BASE64 — al revés que el de chat, donde sí funciona pese a
 * que la doc dice que no. Acá la doc tiene razón: el campo pide "File URL after upload, not file
 * content" y un data URI devuelve `500 File type not supported`. Así que las referencias inline se
 * suben al bucket.
 *
 * El nombre es el HASH del contenido: la misma foto de producto en cinco pasos del wizard sube UNA
 * vez (upsert sobre el mismo path) en vez de cinco.
 *
 * ponytail: `kie-refs/` crece sin poda. El hash acota el volumen (los repetidos se pisan) pero no
 * lo cierra; si el bucket empieza a pesar, el upgrade es prefijo por fecha + un cron que borre los
 * meses viejos, no un reaper por objeto.
 */
async function referenciasComoUrls(parts: Part[]): Promise<string[]> {
  // ⚠️ SE RECORRE EN ORDEN Y SE MEZCLAN LOS DOS TIPOS. El orden de las referencias ES contrato: el
  // prompt de las anclas del video las cita como `@image(n)`, así que reordenarlas le da a una toma
  // la imagen de otra. Por eso no se separan en "inline" y "remotas" y se concatenan después.
  return Promise.all(parts.flatMap((p) => {
    // Ya está en un bucket público: se pasa la URL tal cual. Ahorra bajarla y volver a subirla —
    // que es lo que hacían el avatar y las anclas del video contra su propio bucket.
    if (p.fileData?.fileUri) return [Promise.resolve(p.fileData.fileUri)]
    if (!p.inlineData?.data) return []
    const buf = Buffer.from(p.inlineData.data, 'base64')
    return [uploadToStorage('kie-refs', buf, p.inlineData.mimeType ?? 'image/png', createHash('sha256').update(buf).digest('hex').slice(0, 32))]
  }))
}

async function esperarTarea(taskId: string): Promise<string> {
  const limite = Date.now() + BUDGET_MS
  for (;;) {
    // ⚠️ El presupuesto se comprueba ANTES del fetch y acota el timeout de la petición a lo que
    // queda: una petición no puede sobrevivir al plazo que se supone que respeta.
    const restante = limite - Date.now()
    if (restante <= 0) throw new Error(`KIE imagen: la tarea ${taskId} no terminó en ${BUDGET_MS / 1000} s`)
    const json = await kieFetch(`${RECORD_INFO}?taskId=${encodeURIComponent(taskId)}`, {
      timeoutMs: Math.min(HTTP_TIMEOUT_MS, restante),
    })
    const data = json.data as { state?: string; resultJson?: string; failMsg?: string } | undefined
    if (data?.state === 'success') {
      // `resultJson` es un STRING con JSON adentro — contrato del marketplace.
      const urls = (JSON.parse(data.resultJson ?? '{}') as { resultUrls?: string[] }).resultUrls
      if (urls?.[0]) return urls[0]
      throw new Error(`KIE imagen: tarea ${taskId} terminó en success sin resultUrls`)
    }
    if (data?.state === 'fail') throw new Error(`KIE imagen: tarea ${taskId} falló — ${data.failMsg ?? 'sin motivo'}`)
    await new Promise((r) => setTimeout(r, Math.min(POLL_MS, Math.max(0, limite - Date.now()))))
  }
}

/**
 * Genera con UN modelo y devuelve base64 — el mismo contrato que esperaban los call sites con los
 * SDK, así que ninguno cambió. El par primario/respaldo lo orquesta `generateImage` en gemini.ts.
 */
export async function kieGenerateImage(
  modelo: ModeloImagen,
  parts: Part[],
  maxRetries: number,
  opts?: { aspectRatio?: string; imageSize?: string },
): Promise<string> {
  const prompt = parts.filter((p) => p.text).map((p) => p.text).join('\n')
  const aspect = imageAspect(opts?.aspectRatio)
  const resolution = imageResolution(aspect, opts?.imageSize)
  const urls = await referenciasComoUrls(parts)
  const body = buildImageBody(modelo, prompt, urls, aspect, resolution)

  let lastError: unknown = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      const creada = await kieFetch(CREATE_TASK, { method: 'POST', body: JSON.stringify(body) })
      const taskId = (creada.data as { taskId?: string } | undefined)?.taskId
      if (!taskId) throw new Error('KIE imagen: createTask no devolvió taskId')
      const url = await esperarTarea(taskId)
      // El resultado vive en el CDN de KIE, no en nuestro bucket, así que no pasa por
      // `fetchAsBase64` (su allowlist anti-SSRF solo admite el host de Supabase).
      const img = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
      if (!img.ok) throw new Error(`KIE imagen: no se pudo bajar el resultado (${img.status})`)
      return Buffer.from(await img.arrayBuffer()).toString('base64')
    } catch (e) {
      lastError = e
      console.warn(`[kie-image] ${modelo} intento ${i + 1}/${maxRetries} falló`, e)
    }
  }
  if (lastError) throw lastError
  return ''
}
