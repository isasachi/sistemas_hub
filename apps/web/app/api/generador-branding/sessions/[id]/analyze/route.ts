import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
import { analyzeUploadedStyle } from '@/lib/branding/style-extract'
import { renderWireframePng } from '@/lib/branding/wireframe'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Modo B: el usuario sube su producto. Lo guardamos, lo analizamos (Gemini
// vision) como EXTRACTOR de identidad completa (paleta, tipografía,
// styleBlock...) Y composición (layout) — ya no un clasificador que reasigna
// la identidad fija de un preset. El layout extraído se renderiza a un
// wireframe determinista (mismo algoritmo que los 7 presets, ver
// `lib/branding/wireframe.ts`) y se persiste junto al análisis. NO genera
// imágenes con Gemini más allá de la extracción — es un paso de análisis barato.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { blocked } = await checkGenQuota(id, 'branding-analyze')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getBrandingSession(id)
  if (!session) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

  // El cliente sube el archivo como multipart/form-data (campo "image").
  let buffer: Buffer, mimeType: string
  try {
    const form = await req.formData()
    const file = form.get('image')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 })
    mimeType = file.type || 'image/jpeg'
    buffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Form-data inválido' }, { status: 400 })
  }

  const uploadedUrl = await uploadToStorage(id, buffer, mimeType, 'uploaded-product')
  const { data, mimeType: fetchedMime } = await fetchAsBase64(uploadedUrl)
  const extracted = await analyzeUploadedStyle(data, fetchedMime)

  const wf = await renderWireframePng(extracted.layout, 'tu producto')
  const wireframeUrl = await uploadToStorage(id, wf, 'image/png', 'upload-wireframe')

  await updateBrandingSession(id, {
    source_mode: 'upload',
    uploaded_image_url: uploadedUrl,
    image_analysis: extracted,
    uploaded_wireframe_url: wireframeUrl,
  })
  await recordGenQuota(id, 'branding-analyze', userId)

  return NextResponse.json({
    uploadedImageUrl: uploadedUrl,
    analysis: extracted,
  })
}
