import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, updateSession } from '@/lib/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { refineImage } from '@/lib/gemini'
import { genQuotaResponse } from '@/lib/gen-quota'

const BodySchema = z.object({ feedback: z.string().min(1).max(1000) })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const blocked = await genQuotaResponse('anuncios-refine')
  if (blocked) return blocked

  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.image_url || !session.reference_url || !session.product_url)
    return NextResponse.json({ error: 'No image to refine yet' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'feedback required (max 1000 chars)' }, { status: 400 })

  const [ref, product, logo, result] = await Promise.all([
    fetchAsBase64(session.reference_url),
    fetchAsBase64(session.product_url),
    session.logo_url ? fetchAsBase64(session.logo_url) : Promise.resolve(null),
    fetchAsBase64(session.image_url),
  ])

  const b64 = await refineImage(
    ref.data, ref.mimeType,
    product.data, product.mimeType,
    logo?.data ?? null, logo?.mimeType ?? null,
    result.data, result.mimeType,
    parsed.data.feedback
  )

  if (!b64) return NextResponse.json({ error: 'Refinement returned empty result' }, { status: 422 })

  const imageBuffer = Buffer.from(b64, 'base64')
  const imageUrl = await uploadToStorage(id, imageBuffer, 'image/png', `result-${Date.now()}`)
  await updateSession(id, { image_url: imageUrl })
  return NextResponse.json({ imageUrl })
}
