import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { toNiche } from '@/lib/video-ads/niches'
import { uploadToStorage } from '@/lib/storage'
import { callVideoAds } from '@/lib/video-ads/llm'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ProductScanSchema } from '@/lib/video-ads/types'
import { STEP } from '@/lib/video-ads/steps'
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
  // El disjunto `!session.character_url` es de los modos `character-ref`/`character-gen`
  // que este recableado eliminó (una sola línea de entrada: video de referencia
  // obligatorio). Dejarlo vivo abría un bypass del gate de costo: `POST .../inputs`
  // (gratis, no llama LLM) puede persistir `character_url` sin haber analizado
  // ninguna referencia, y con el disjunto ese `character_url` solo bastaba para que
  // esta ruta —pagada— corriera sin video. Ahora el único gate es el forense real.
  if (!session.forensic_analysis)
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
  // `angle` y `problem` son INPUTS del spec (Section1Product los exige junto con los
  // otros tres) pero antes de este fix se quedaban solo en el store del cliente hasta
  // el POST a `/inputs` del paso 2. Recargar entre el paso 1 y el 2 los perdía, y
  // recuperarlos exigía re-subir la foto (`ready` en Section1Product depende de
  // `!!file`, estado local sin rehidratar) — re-ejecutando esta llamada pagada a
  // Gemini por dos campos de texto. Ahora se mandan y persisten acá también.
  const angle = (formData.get('angle') as string | null)?.trim()
  const problem = (formData.get('problem') as string | null)?.trim()
  // `toNiche` normaliza: lo que no sea un nicho conocido cae en 'suplementos', que es
  // el comportamiento de siempre. El cliente no puede meter un valor raro en la fila.
  const niche = toNiche(formData.get('niche'))
  if (!productName || !whatItDoes || !targetAudience || !angle || !problem)
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
      callVideoAds('product_scan', ProductScanSchema, parts),
    ])

    // `step` NO es monotónico acá (a diferencia de `inputs/route.ts`, que hace
    // `Math.max(session.step, STEP.VALIDATION)`): analyze-reference y analyze-product
    // son pasos de ENTRADA — resubir la foto/el video es rehacer ese paso a
    // propósito, así que el resume del wizard debe aterrizar justo después, no
    // conservar un avance que ya no es válido para los datos nuevos. `inputs` en
    // cambio es el último paso antes del gate de Validación: retroceder el resume
    // ahí sí perdería trabajo sin necesidad.
    await updateVideoSession(id, {
      step: STEP.CHARACTER,
      product_url: productUrl,
      product_scan: scan,
      product_name: productName,
      what_it_does: whatItDoes,
      angle,
      problem,
      niche,
      target_audience: targetAudience,
    })
    await recordGenQuota(id, 'video-product', userId)
    return NextResponse.json({ scan, productUrl })
  } catch (err) {
    console.error('[video-ads/analyze-product]', err)
    return NextResponse.json({ error: 'No se pudo analizar el producto. Inténtalo de nuevo.' }, { status: 500 })
  }
}
