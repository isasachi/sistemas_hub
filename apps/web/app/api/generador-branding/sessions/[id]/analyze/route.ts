import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
import { analyzeUploadedStyle } from '@/lib/branding/style-extract'
import { getPreset } from '@/lib/branding/style-presets'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Modo B: el usuario sube su producto. Lo guardamos, lo analizamos (Gemini vision)
// y persistimos el estilo extraído + el bestFit + paleta/tipo por defecto (los del
// producto real). NO genera imágenes — es un paso de análisis barato.
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

  const preset = getPreset(extracted.bestFitStyleId)
  await updateBrandingSession(id, {
    source_mode: 'upload',
    style_id: extracted.bestFitStyleId,
    uploaded_image_url: uploadedUrl,
    image_analysis: extracted,
    // default: paleta/tipo del producto real (el usuario puede variarlos en el paso 3)
    selected_palette: extracted.palette,
    selected_typography: extracted.typography,
  })
  await recordGenQuota(id, 'branding-analyze', userId)

  return NextResponse.json({
    styleId: extracted.bestFitStyleId,
    styleName: preset.name,
    palette: extracted.palette,
    typography: extracted.typography,
    uploadedImageUrl: uploadedUrl,
  })
}
