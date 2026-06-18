import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { uploadToStorage } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 5 (pre-mockup) — guarda el envase: descrito (JSON) o subido (multipart).
// Espeja analyze-product de anuncios: el upload se persiste aquí y el SSE de mockup
// lo lee de la sesión (no se mezcla multipart con el stream).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getBrandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.label_url)
    return NextResponse.json({ error: 'Genera la etiqueta primero' }, { status: 409 })

  const contentType = req.headers.get('content-type') ?? ''

  // ── Modo "subir imagen del envase" ──
  if (contentType.includes('multipart/form-data')) {
    let formData: FormData
    try { formData = await req.formData() } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }
    const file = formData.get('container') as File | null
    if (!file || file.size === 0)
      return NextResponse.json({ error: 'Falta la imagen del envase' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024)
      return NextResponse.json({ error: 'Imagen muy grande (máx 10 MB)' }, { status: 400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const mime = file.type || 'image/png'
    const containerUrl = await uploadToStorage(id, bytes, mime, 'container')

    await updateBrandingSession(id, {
      container_mode: 'upload',
      container_url: containerUrl,
      container_desc: (formData.get('containerDesc') as string | null)?.trim() || null,
    })
    return NextResponse.json({ containerMode: 'upload', containerUrl })
  }

  // ── Modo "describir el envase" ──
  let body: { containerDesc?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const containerDesc = body.containerDesc?.trim()
  if (!containerDesc)
    return NextResponse.json({ error: 'Describe el envase que vas a usar' }, { status: 400 })

  await updateBrandingSession(id, {
    container_mode: 'describe',
    container_desc: containerDesc,
    container_url: null,
  })
  return NextResponse.json({ containerMode: 'describe', containerDesc })
}
