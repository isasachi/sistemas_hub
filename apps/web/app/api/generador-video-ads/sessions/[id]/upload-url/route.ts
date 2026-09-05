import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getVideoSession } from '@/lib/video-ads/db'
import { createSignedUpload } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// El video de referencia NO puede subir por una ruta: el body de una función
// serverless de Vercel está topado en 4.5 MB. Esta ruta solo firma la subida; el
// browser hace `PUT signedUrl` con el archivo y después manda la publicUrl.
const BodySchema = z.object({
  name: z.enum(['reference-video', 'character']),
  mimeType: z.string().min(3).max(100),
})

const ALLOWED: Record<string, string[]> = {
  'reference-video': ['video/mp4', 'video/quicktime', 'video/webm'],
  character: ['image/jpeg', 'image/png', 'image/webp'],
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })

  const { name, mimeType } = parsed.data
  if (!ALLOWED[name].includes(mimeType))
    return NextResponse.json({ error: `Formato no soportado: ${mimeType}` }, { status: 400 })

  try {
    const { signedUrl, publicUrl } = await createSignedUpload(id, name, mimeType)
    return NextResponse.json({ signedUrl, publicUrl })
  } catch (err) {
    console.error('[video-ads/upload-url]', err)
    return NextResponse.json({ error: 'No se pudo preparar la subida' }, { status: 500 })
  }
}
