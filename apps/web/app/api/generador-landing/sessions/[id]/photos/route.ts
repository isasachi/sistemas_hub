import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { uploadToStorage } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 2 — sube 1-3 fotos del producto. Sin LLM: entran como input a Gemini al generar.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }
  const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return NextResponse.json({ error: 'Sube al menos una foto' }, { status: 400 })
  if (files.length > 3) return NextResponse.json({ error: 'Máximo 3 fotos' }, { status: 400 })
  for (const f of files)
    if (f.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Imagen muy grande (máx 10 MB)' }, { status: 400 })

  const urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const bytes = Buffer.from(await files[i].arrayBuffer())
    urls.push(await uploadToStorage(id, bytes, files[i].type || 'image/png', `photo-${i}`))
  }

  await updateLandingSession(id, { step: Math.max(session.step, 2), product_photo_urls: urls })
  return NextResponse.json({ urls })
}
