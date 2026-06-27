import { NextRequest } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { generateImage } from '@/lib/gemini'
import { DirectionSchema, type LabelData } from '@/lib/branding/types'
import { buildLabelInstruction } from '@/lib/branding/instructions'
import { parseDesignDna } from '@/lib/branding/style-extract'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 4 — diseña la etiqueta (logo elegido + paleta + brief del producto). SSE.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { blocked, regensLeft } = await checkGenQuota(id, 'branding-label')
  if (blocked) return blocked
  const userId = await readUserId()

  let body: { labelData?: LabelData; prompt?: string } = {}
  try { body = await req.json() } catch { /* sin body: reusa el guardado */ }
  const precision = (body.prompt ?? '').trim()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)

      try {
        const session = await getBrandingSession(id)
        if (!session || !session.direction || !session.brand_name || !session.logo_url) {
          send({ status: 'error', message: 'Falta el logo o la dirección de marca' })
          return controller.close()
        }
        const labelData = (body.labelData ?? session.label_data) as LabelData | null
        if (!labelData?.packagingFormat?.trim()) {
          send({ status: 'error', message: 'Falta el formato del empaque' })
          return controller.close()
        }

        const direction = DirectionSchema.parse(session.direction)
        const productName = (session.product_name || session.brand_name).trim()

        send({ status: 'loading_images' })
        // Image 1 = logo. Image 2 (opcional) = etiqueta de referencia, como style
        // reference: emula su estética/color/mood (ver buildLabelInstruction).
        const parts: Part[] = []
        const logo = await fetchAsBase64(session.logo_url)
        parts.push({ inlineData: { mimeType: logo.mimeType, data: logo.data } })
        const ref = session.label_reference_url
          ? await fetchAsBase64(session.label_reference_url)
          : null
        if (ref) parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } })
        const refDna = parseDesignDna(session.label_reference_analysis)
        parts.push({ text: buildLabelInstruction(direction, session.brand_name, productName, labelData, !!ref, refDna) })
        if (precision) parts.push({ text: `\nAjuste solicitado por el usuario (priorízalo): ${precision}` })

        send({ status: 'generating' })
        const b64 = await generateImage(parts)
        if (!b64) {
          send({ status: 'error', message: 'La generación devolvió un resultado vacío', retryable: true })
          return controller.close()
        }

        send({ status: 'uploading' })
        const labelUrl = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', 'label')

        await updateBrandingSession(id, {
          step: Math.max(session.step, 4),
          label_data: labelData,
          label_url: labelUrl,
        })
        await recordGenQuota(id, 'branding-label', userId)
        send({ status: 'done', imageUrl: labelUrl, regensLeft })
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
