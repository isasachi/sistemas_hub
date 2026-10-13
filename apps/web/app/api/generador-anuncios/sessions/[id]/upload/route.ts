import { NextRequest, NextResponse } from 'next/server'
import { uploadToStorage } from '@/lib/storage'
import { errorResponse, load, notFound } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_IMG = 4 * 1024 * 1024 // tope del body de Vercel (4,5 MB); el cliente reduce la foto antes

// Sube un adjunto del chat a Storage y devuelve su URL del bucket propio (lo único que las tools aceptan).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row) return notFound()
  try {
    const file = (await req.formData().catch(() => null))?.get('file')
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'No llegó ningún archivo.' }, { status: 400 })
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Sube una imagen (JPG, PNG o WebP).' }, { status: 400 })
    if (file.size > MAX_IMG) return NextResponse.json({ error: 'La imagen pesa más de 4 MB.' }, { status: 400 })
    const url = await uploadToStorage(id, Buffer.from(await file.arrayBuffer()), file.type, `chat-${Date.now()}`)
    return NextResponse.json({ url, name: file.name })
  } catch (e) { return errorResponse(e) }
}
