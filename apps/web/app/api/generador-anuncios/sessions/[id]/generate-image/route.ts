import { NextRequest } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { editImage, callReasoning, STEP5_PROMPT } from '@/lib/gemini'
import { aspectRatioOf } from '@/lib/aspect'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { ReferenceAnalysisSchema, ProductScanSchema, ConfirmedCopySchema } from '@/lib/types'
import { contextoStep5 } from '@/lib/anuncios/step5-context'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// gpt-image-2 tarda ~40-90s (medido). Sin esto Vercel corta antes de que vuelva la imagen.
export const maxDuration = 300

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let precision = ''
  try { const b = await req.json(); precision = (b?.prompt ?? '').trim() } catch { /* sin body */ }

  const { blocked, regensLeft } = await checkGenQuota(id, 'anuncios-image')
  if (blocked) return blocked
  const userId = await readUserId()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)

      try {
        const session = await getSession(id, userId)
        if (!session || !session.reference_url || !session.product_url || !session.confirmed_copy) {
          send({ status: 'error', message: 'Session incomplete' })
          return controller.close()
        }

        const refAnalysis = ReferenceAnalysisSchema.parse(session.reference_analysis)
        const productScan = ProductScanSchema.parse(session.product_scan)
        const confirmedCopy = ConfirmedCopySchema.parse(session.confirmed_copy)
        const hasLogo = !!session.logo_url

        // Step 1: cargar imágenes ANTES del prompt — el ratio real sale de los bytes de la
        // referencia, no de `format.ratio` (que el análisis puede leer al revés), y tiene que
        // entrar al instructivo además de a la config del modelo.
        send({ status: 'loading_images' })
        const [ref, product, logo] = await Promise.all([
          fetchAsBase64(session.reference_url),
          fetchAsBase64(session.product_url),
          session.logo_url ? fetchAsBase64(session.logo_url) : Promise.resolve(null),
        ])
        const aspectRatio = await aspectRatioOf(Buffer.from(ref.data, 'base64'))

        // Step 2: build prompt
        send({ status: 'building_prompt' })
        // El contexto se arma en `lib/anuncios/step5-context.ts`, compartido con `render-lote`
        // (el flujo de plantilla): con una copia en cada ruta, un arreglo llegaría a un flujo y
        // no al otro sin que nada lo dijera.
        const contextForReasoning = contextoStep5({
          aspectRatio,
          ref: refAnalysis,
          scan: productScan,
          productName: session.product_name,
          whatItIs: session.what_it_is,
          whatItDoes: session.what_it_does,
          targetAudience: session.target_audience,
          hasLogo,
          version: confirmedCopy.version,
          copy: confirmedCopy.breakdown,
        })

        let editInstruction = await callReasoning(STEP5_PROMPT, contextForReasoning, { preferGemini: true })
        if (precision) editInstruction += `\nAjuste solicitado por el usuario (priorízalo): ${precision}`

        // Step 3: generate
        send({ status: 'generating' })
        const b64 = await editImage(
          ref.data, ref.mimeType,
          product.data, product.mimeType,
          logo?.data ?? null, logo?.mimeType ?? null,
          editInstruction,
          aspectRatio
        )

        if (!b64) {
          send({ status: 'error', message: 'Image generation returned empty result' })
          return controller.close()
        }

        // Step 4: upload
        send({ status: 'uploading' })
        const imageBuffer = Buffer.from(b64, 'base64')
        const imageUrl = await uploadToStorage(id, imageBuffer, 'image/png', 'result')

        await updateSession(id, { step: 5, edit_instruction: editInstruction, image_url: imageUrl })
        await recordGenQuota(id, 'anuncios-image', userId)
        send({ status: 'done', imageUrl, regensLeft })
      } catch (err) {
        send({ status: 'error', message: String(err), retryable: true })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
