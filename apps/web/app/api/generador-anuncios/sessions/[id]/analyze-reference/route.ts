import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { uploadToStorage } from '@/lib/storage'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ReferenceAnalysisSchema } from '@/lib/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'anuncios-reference')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Los datos del formulario no son válidos' }, { status: 400 })
  }

  const file = formData.get('reference') as File | null
  if (!file) return NextResponse.json({ error: 'Falta la imagen de referencia' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'La imagen pesa más de 10 MB' }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || 'image/jpeg'
  const base64 = bytes.toString('base64')
  const precision = ((formData.get('prompt') as string | null) ?? '').trim()

  const [referenceUrl, analysis] = await Promise.all([
    uploadToStorage(id, bytes, mimeType, 'reference'),
    // preferGemini: gpt-4o-mini leyó una referencia 335x597 (vertical) como "16:9" y devolvió
    // style/typography de una línea ("moderno", "estilo moderno y limpio") — el análisis es la
    // base de TODO lo que sigue, así que ahí es donde más cuesta el modelo chico.
    callStructured('reference_analysis', ReferenceAnalysisSchema, [
      { inlineData: { mimeType, data: base64 } },
      { text: `Analyze this reference ad. Return the complete structured analysis including all sceneElements.${precision ? '\nAjuste pedido: ' + precision : ''}` },
    ], 3, undefined, { preferGemini: true }),
  ])

  await updateSession(id, { step: 1, reference_url: referenceUrl, reference_analysis: analysis })
  await recordGenQuota(id, 'anuncios-reference', userId)
  return NextResponse.json({ analysis, referenceUrl })
}
