import { NextRequest, NextResponse } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { uploadToStorage } from '@/lib/storage'
import { analyzeStyleReference } from '@/lib/branding/style-extract'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 3 (pre-logo) — guarda un logo de referencia + extrae su Design DNA quirúrgico
// (gemini-2.5-flash; localiza el logo si la ref es un mockup). El SSE de `logo` pasa
// la imagen como Image 1 Y el DNA como spec → replica el estilo + aplica la marca.
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
  const referenceUrl = await uploadToStorage(id, bytes, mime, 'logo-ref')

  let dna = null
  try { dna = await analyzeStyleReference(bytes.toString('base64'), mime, 'logo') }
  catch (e) { console.error('[logo-ref] DNA extraction failed:', e) }

  await updateBrandingSession(id, {
    logo_reference_url: referenceUrl,
    logo_reference_analysis: dna ? JSON.stringify(dna) : null,
  })
  return NextResponse.json({ referenceUrl })
}
