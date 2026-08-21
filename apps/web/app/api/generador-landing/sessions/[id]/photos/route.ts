import { NextRequest, NextResponse } from 'next/server'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { uploadToStorage } from '@/lib/storage'
import { extractProductBox, cropProduct } from '@/lib/landing/product-box'
import type { LandingSessionResponse } from '@/lib/landing/types'
import { readUserId } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30 // + bbox por visión (~2-3s) + crop sobre la 1ª foto (Fase 2 C2.1)

// Etapa 2 — sube 1-3 fotos del producto. Sin LLM: entran como input a Gemini al generar.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getLandingSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Los datos del formulario no son válidos' }, { status: 400 })
  }
  const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return NextResponse.json({ error: 'Sube al menos una foto' }, { status: 400 })
  if (files.length > 3) return NextResponse.json({ error: 'Máximo 3 fotos' }, { status: 400 })
  for (const f of files)
    if (f.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Imagen muy grande (máx 10 MB)' }, { status: 400 })

  const urls: string[] = []
  let firstBuf: Buffer | null = null
  for (let i = 0; i < files.length; i++) {
    const bytes = Buffer.from(await files[i].arrayBuffer())
    if (i === 0) firstBuf = bytes
    urls.push(await uploadToStorage(id, bytes, files[i].type || 'image/png', `photo-${i}`))
  }

  // Placa canónica desde la FOTO REAL (Fase 2 C2.1): bbox por visión + crop sobre la 1ª foto,
  // antes de generar nada. El ancla deja de ser el render de la 1ª sección → sin degradación
  // generacional y sin serialidad entre secciones. Si el bbox falla, queda null → fallback a
  // las fotos crudas (nunca peor que hoy). ponytail: la 1ª foto; "la más grande/frontal" pediría
  // visión por foto — no se compra acá.
  const canonical: Partial<LandingSessionResponse> = {}
  if (firstBuf) {
    try {
      const box = await extractProductBox(firstBuf.toString('base64'), files[0].type || 'image/png')
      if (box) {
        const anchorBuf = await cropProduct(firstBuf, box) // devuelve el recorte, o la foto entera si sharp falla
        const anchorUrl = await uploadToStorage(id, anchorBuf, 'image/png', 'product-canonical')
        canonical.product_canonical_url = anchorUrl
        canonical.product_canonical_source = 'photo'
      }
    } catch (err) {
      console.error('[landing-canonical]', err)
    }
  }

  await updateLandingSession(id, { step: Math.max(session.step, 2), product_photo_urls: urls, ...canonical })
  return NextResponse.json({ urls })
}
