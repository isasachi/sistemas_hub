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
  return data.publicUrl
}

export async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
  const buf = await res.arrayBuffer()
  return { data: Buffer.from(buf).toString('base64'), mimeType }
}
