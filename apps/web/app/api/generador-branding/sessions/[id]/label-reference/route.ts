import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { uploadToStorage } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 4 (pre-etiqueta) — guarda una etiqueta de referencia subida por el usuario
// (espeja container/route.ts). El SSE de `label` la lee de la sesión y la pasa como
// Image 2; no se mezcla multipart con el stream.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getBrandingSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }
  const file = formData.get('reference') as File | null
  if (!file || file.size === 0)
    return NextResponse.json({ error: 'Falta la imagen de referencia' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'Imagen muy grande (máx 10 MB)' }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = file.type || 'image/png'
  const referenceUrl = await uploadToStorage(id, bytes, mime, 'label-ref')

  await updateBrandingSession(id, { label_reference_url: referenceUrl })
  return NextResponse.json({ referenceUrl })
}
