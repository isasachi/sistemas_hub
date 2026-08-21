import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, updateSession } from '@/lib/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { refineImage } from '@/lib/gemini'
import { aspectRatioOf } from '@/lib/aspect'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'

// gpt-image-2 tarda ~40-90s (medido). Sin esto Vercel corta antes de que vuelva la imagen.
export const maxDuration = 300

const BodySchema = z.object({ feedback: z.string().max(1000).optional() })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked, regensLeft } = await checkGenQuota(id, 'anuncios-image')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
  if (!session.image_url || !session.reference_url || !session.product_url)
    return NextResponse.json({ error: 'Todavía no hay una imagen que ajustar' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch {
    body = {}
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'feedback max 1000 chars' }, { status: 400 })

  const [ref, product, logo, result] = await Promise.all([
    fetchAsBase64(session.reference_url),
    fetchAsBase64(session.product_url),
    session.logo_url ? fetchAsBase64(session.logo_url) : Promise.resolve(null),
    fetchAsBase64(session.image_url),
  ])

  // El ratio se re-mide de la REFERENCIA en cada refine: si no, un ad que ya salió con el
  // formato equivocado lo arrastra en cada regeneración.
  const aspectRatio = await aspectRatioOf(Buffer.from(ref.data, 'base64'))

  const b64 = await refineImage(
    ref.data, ref.mimeType,
    product.data, product.mimeType,
    logo?.data ?? null, logo?.mimeType ?? null,
    result.data, result.mimeType,
    parsed.data.feedback ?? '',
    aspectRatio
  )

  if (!b64) return NextResponse.json({ error: 'La regeneración volvió vacía. Inténtalo de nuevo.' }, { status: 422 })

  const imageBuffer = Buffer.from(b64, 'base64')
  const imageUrl = await uploadToStorage(id, imageBuffer, 'image/png', `result-${Date.now()}`)
  await updateSession(id, { image_url: imageUrl })
  await recordGenQuota(id, 'anuncios-image', userId)
  return NextResponse.json({ imageUrl, regensLeft })
}
