import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { uploadToStorage, fetchAsBase64 } from '@/lib/storage'
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
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('reference') as File | null
  if (!file) return NextResponse.json({ error: 'Missing reference image' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || 'image/jpeg'
  const base64 = bytes.toString('base64')
  const precision = ((formData.get('prompt') as string | null) ?? '').trim()

  const [referenceUrl, analysis] = await Promise.all([
    uploadToStorage(id, bytes, mimeType, 'reference'),
    callStructured('reference_analysis', ReferenceAnalysisSchema, [
      { inlineData: { mimeType, data: base64 } },
      { text: `Analyze this reference ad. Return the complete structured analysis including all sceneElements.${precision ? '\nAjuste pedido: ' + precision : ''}` },
    ]),
  ])

  await updateSession(id, { step: 1, reference_url: referenceUrl, reference_analysis: analysis })
  await recordGenQuota(id, 'anuncios-reference', userId)
  return NextResponse.json({ analysis, referenceUrl })
}
