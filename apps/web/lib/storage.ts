import { createClient } from '@supabase/supabase-js'

const BUCKET = 'ad-uploads'

function getStorage() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ).storage.from(BUCKET)
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

function mimeToExt(mime: string): string {
  return EXT[mime] ?? 'jpg'
}

export async function uploadToStorage(
  sessionId: string,
  buffer: Buffer,
  mimeType: string,
  name: string
): Promise<string> {
  const ext = mimeToExt(mimeType)
  const path = `${sessionId}/${name}.${ext}`
  const storage = getStorage()
  const { error } = await storage.upload(path, buffer, { contentType: mimeType, upsert: true })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const { data } = storage.getPublicUrl(path)
  // El path es determinista + upsert, así que regenerar reescribe los bytes pero deja la
  // MISMA URL → el browser/CDN sirve la imagen vieja cacheada (y React no ve cambio de src).
  // Cache-bust por generación: cambia el string en cada upload sin dejar objetos huérfanos.
  return `${data.publicUrl}?v=${Date.now()}`
}

// Hosts permitidos para fetchAsBase64 = el host del proyecto Supabase (de donde
// salen las URLs del bucket). Evita SSRF: hoy todas las *_url las produce
// uploadToStorage, pero esto blinda contra un futuro write-path de URL externa o
// una fila legada manipulada. Lazy: el env está garantizado en runtime.
let _allowedHosts: Set<string> | null = null
function allowedHosts(): Set<string> {
  if (!_allowedHosts) {
    _allowedHosts = new Set(
      [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL]
        .filter((u): u is string => !!u)
        .map((u) => new URL(u).host),
    )
  }
  return _allowedHosts
}

/**
 * URL firmada para que el BROWSER suba directo al bucket, sin pasar por la ruta.
 * Necesario para el video de referencia del generador de video ads: el body de una
 * función serverless de Vercel está topado en 4.5 MB y un video pesa mucho más.
 * El cliente hace `PUT signedUrl` con el archivo como body; después manda solo la
 * publicUrl a la ruta de análisis.
 */
export async function createSignedUpload(
  sessionId: string,
  name: string,
  mimeType: string
): Promise<{ signedUrl: string; publicUrl: string }> {
  const path = `${sessionId}/${name}.${mimeToExt(mimeType)}`
  const storage = getStorage()
  const { data, error } = await storage.createSignedUploadUrl(path, { upsert: true })
  if (error || !data) throw new Error(`Signed upload failed: ${error?.message ?? 'sin datos'}`)
  return {
    signedUrl: data.signedUrl,
    // Mismo cache-bust que uploadToStorage: el path es determinista + upsert.
    publicUrl: `${storage.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`,
  }
}

/** Descarga un objeto del bucket como Buffer (video para el análisis forense). */
export async function fetchAsBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  let host: string
  try { host = new URL(url).host } catch { throw new Error('Invalid URL') }
  if (!allowedHosts().has(host)) throw new Error(`Refused to fetch non-storage URL: ${host}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`)
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get('content-type') ?? 'video/mp4',
  }
}

// URL pública de un path YA existente en el bucket (sin subir nada) — usado para leer refs
// sembradas fuera de banda (p.ej. `landing-refs/<section>.png`, scripts/seed-landing-refs.ts).
export function storagePublicUrl(path: string): string {
  return getStorage().getPublicUrl(path).data.publicUrl
}

/** Lanzada por `fetchAsBase64` cuando `maxBytes` se pasa y el `content-length` de
 * la respuesta lo excede. Clase dedicada (en vez de un Error genérico) para que
 * el caller pueda distinguir "archivo muy grande" de cualquier otro fallo de red
 * y devolver un 413 con mensaje propio en vez de un 500 genérico. */
export class PayloadTooLargeError extends Error {}

/**
 * HEAD contra el bucket: valida el host y el tamaño SIN bajar el archivo.
 *
 * Lo usa el análisis forense desde que el texto/visión de Gemini sale por KIE: ya no baja el
 * video, le pasa la URL pública y KIE la lee. Eso deja sin efecto los dos guards que vivían dentro
 * de `fetchAsBase64` —el allowlist anti-SSRF y el tope de tamaño— y los dos siguen haciendo falta:
 * el primero porque ahora la URL se la damos a un tercero para que la busque, y el segundo porque
 * un video enorme gasta una llamada pagada para fallar.
 */
export async function headStorageFile(url: string, maxBytes: number): Promise<{ mimeType: string }> {
  let host: string
  try { host = new URL(url).host } catch { throw new Error('Invalid file URL') }
  if (!allowedHosts().has(host)) throw new Error(`Refused to fetch non-storage URL: ${host}`)
  const res = await fetch(url, { method: 'HEAD' })
  if (!res.ok) throw new Error(`Failed to head file: ${res.status}`)
  const len = Number(res.headers.get('content-length'))
  if (len > 0 && len > maxBytes) {
    throw new PayloadTooLargeError(`El archivo pesa más de ${Math.round(maxBytes / (1024 * 1024))} MB.`)
  }
  return { mimeType: res.headers.get('content-type') ?? 'video/mp4' }
}

/**
 * @param maxBytes Opcional. Si se pasa, valida `content-length` ANTES de bufferear
 *   el archivo entero en memoria (`arrayBuffer()` + base64 lo infla 4/3). Lo usa
 *   el análisis forense del video de referencia: el tope de 14 MB
 *   (`MAX_VIDEO_MB`) hoy solo se valida en el browser (`Section0Reference`), que
 *   es puro UX — un request armado a mano se lo salta y revienta el runtime de
 *   Node por memoria o timeout al bufferear un video sin tope real.
 *   ponytail: si `content-length` falta (respuesta chunked) o el header no es un
 *   número, deja pasar — mismo criterio fail-open que el resto de los guards del
 *   hub (ver `gen-quota.ts`): bloquear por un chequeo que en sí no respondió es
 *   peor que dejar pasar un archivo que probablemente sí mide lo que dice.
 */
export async function fetchAsBase64(
  url: string,
  maxBytes?: number,
): Promise<{ data: string; mimeType: string }> {
  let host: string
  try { host = new URL(url).host } catch { throw new Error('Invalid image URL') }
  if (!allowedHosts().has(host)) throw new Error(`Refused to fetch non-storage URL: ${host}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  if (maxBytes) {
    const len = Number(res.headers.get('content-length'))
    if (len > 0 && len > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024))
      throw new PayloadTooLargeError(`El archivo pesa más de ${mb} MB.`)
    }
  }
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
  const buf = await res.arrayBuffer()
  return { data: Buffer.from(buf).toString('base64'), mimeType }
}
