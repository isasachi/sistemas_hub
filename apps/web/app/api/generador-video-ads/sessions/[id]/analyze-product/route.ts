import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { uploadToStorage } from '@/lib/storage'
import { callStructured } from '@/lib/gemini'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ProductScanSchema } from '@/lib/video-ads/types'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// La foto del producto sí cabe en el body de la función (≤4.5 MB en Vercel), así que
// va por FormData como en el generador de anuncios. El video de referencia no — ese
// sube firmado (ver upload-url).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked } = await checkGenQuota(id, 'video-product')
  if (blocked) return blocked
  const userId = await readUserId()

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.forensic_analysis && !session.character_url)
    return NextResponse.json({ error: 'Completa el paso anterior primero' }, { status: 409 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const productFile = formData.get('product') as File | null
  if (!productFile) return NextResponse.json({ error: 'Falta la foto del producto' }, { status: 400 })
  if (productFile.size > 4 * 1024 * 1024)
    return NextResponse.json({ error: 'La foto pesa más de 4 MB' }, { status: 400 })

  const productName = (formData.get('productName') as string | null)?.trim()
  const whatItDoes = (formData.get('whatItDoes') as string | null)?.trim()
  const targetAudience = (formData.get('targetAudience') as string | null)?.trim()
  if (!productName || !whatItDoes || !targetAudience)
    return NextResponse.json({ error: 'Faltan datos del producto' }, { status: 400 })

  try {
    const bytes = Buffer.from(await productFile.arrayBuffer())
    const mimeType = productFile.type || 'image/jpeg'

    const parts: Part[] = [
      { inlineData: { mimeType, data: bytes.toString('base64') } },
      {
        text: [
          `Product name: ${productName}`,
          `What it does: ${whatItDoes}`,
          `Target audience: ${targetAudience}`,
          'Analyze the product image for a UGC video ad: describe the physical object',
          'precisely (shape, size in hand, label, colors, visible text) so a video model can',
          'keep it identical. Return ProductScan JSON.',
        ].join('\n'),
      },
    ]

    const [productUrl, scan] = await Promise.all([
      uploadToStorage(id, bytes, mimeType, 'product'),
      callStructured('product_scan', ProductScanSchema, parts),
    ])

    await updateVideoSession(id, {
      step: 3,
      product_url: productUrl,
      product_scan: scan,
      product_name: productName,
      what_it_does: whatItDoes,
      target_audience: targetAudience,
    })
    await recordGenQuota(id, 'video-product', userId)
    return NextResponse.json({ scan, productUrl })
  } catch (err) {
    console.error('[video-ads/analyze-product]', err)
    return NextResponse.json({ error: 'No se pudo analizar el producto. Inténtalo de nuevo.' }, { status: 500 })
  }
}
