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

export async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  let host: string
  try { host = new URL(url).host } catch { throw new Error('Invalid image URL') }
  if (!allowedHosts().has(host)) throw new Error(`Refused to fetch non-storage URL: ${host}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
  const buf = await res.arrayBuffer()
  return { data: Buffer.from(buf).toString('base64'), mimeType }
}
