import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { isNiche, NICHE_DEFAULT } from '@/lib/video-ads/niches'
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

  const session = await getVideoSession(id, await readUserId())
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 })
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
    return NextResponse.json({ error: 'Los datos del formulario no son válidos' }, { status: 400 })
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
  // Se ESCRIBE con `isNiche`, no con `toNiche`, y la diferencia importa mientras haya
  // nichos bloqueados: la columna guarda lo que el usuario quiso (`ropa`), y quien
  // RENDERIZA lo normaliza a suplementos vía `toNiche`. Normalizar acá borraría la
  // intención para siempre y al desbloquear no habría cómo distinguir esas sesiones.
  // Lo que no sea un nicho conocido sigue cayendo al default: el cliente no puede meter
  // un valor raro en la fila.
  const nicheRaw = formData.get('niche')
  const niche = isNiche(nicheRaw) ? nicheRaw : NICHE_DEFAULT
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
          'Analyze the product image for a UGC video ad. Return ProductScan JSON with TWO',
          'clearly different fields:',
          '',
          'productDescription = the physical object: shape, size in the hand, material,',
          '  cap, proportions and colors, precisely enough for a video model to keep it',
          '  identical across clips.',
          '',
          // ⚠️ ESTE CAMPO ES UNA TRANSCRIPCIÓN, NO UNA RESEÑA — y el prompt de video nunca
          // lo decía. Medido contra el de anuncios, que sí lo pide: anuncios transcribe en
          // 19 de 31 scans y video solo en 10 de 27, con 8 que devuelven una descripción
          // del ESTILO gráfico ("minimalista, clínico y limpio, típico de productos
          // dermatológicos"). Y eso es la causa raíz de los ingredientes inventados en el
          // guión: FASE 3 tiene la orden de copiar el ingrediente de la etiqueta, y si la
          // etiqueta nunca se transcribió, no hay de dónde copiar y el modelo completa de
          // memoria. Caso real: la etiqueta capturada de un serum no nombraba un solo
          // ingrediente y el guión salió con "hepéres", después "HEPES".
          'brandingDescription = ONLY the words actually printed on the packaging, copied',
          '  letter by letter: brand, product name, claims, ingredient list, dosage, volume.',
          '  It is a TRANSCRIPTION, not a review — never describe the typography, the layout',
          '  or how premium it looks. Keep the original capitalisation and units.',
          '  Read every readable line, including the small print of the ingredient list: it',
          '  is the ONLY source the script has for what this product actually contains.',
          '  If the packaging carries no readable text at all, return null.',
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
