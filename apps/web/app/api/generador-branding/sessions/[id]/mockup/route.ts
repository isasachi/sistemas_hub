import { NextRequest } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { generateImage } from '@/lib/gemini'
import { DirectionSchema } from '@/lib/branding/types'
import { buildMockupInstruction } from '@/lib/branding/instructions'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 5 — aplica la etiqueta al envase (descrito o subido) → mockup final. SSE.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)

      try {
        const session = await getBrandingSession(id)
        if (!session || !session.direction || !session.brand_name || !session.label_url) {
          send({ status: 'error', message: 'Falta la etiqueta o la dirección de marca' })
          return controller.close()
        }
        if (!session.container_mode) {
          send({ status: 'error', message: 'Falta describir o subir el envase' })
          return controller.close()
        }
        const direction = DirectionSchema.parse(session.direction)

        send({ status: 'loading_images' })
        const [label, container] = await Promise.all([
          fetchAsBase64(session.label_url),
          session.container_url ? fetchAsBase64(session.container_url) : Promise.resolve(null),
        ])

        const parts: Part[] = [
          { inlineData: { mimeType: label.mimeType, data: label.data } },
          ...(container ? [{ inlineData: { mimeType: container.mimeType, data: container.data } } as Part] : []),
          {
            text: buildMockupInstruction(direction, session.brand_name, {
              mode: session.container_mode,
              containerDesc: session.container_desc,
            }),
          },
        ]

        send({ status: 'generating' })
        const b64 = await generateImage(parts)
        if (!b64) {
          send({ status: 'error', message: 'La generación devolvió un resultado vacío', retryable: true })
          return controller.close()
        }

        send({ status: 'uploading' })
        const mockupUrl = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', 'mockup')

        await updateBrandingSession(id, { step: Math.max(session.step, 5), mockup_url: mockupUrl })

        send({ status: 'done', imageUrl: mockupUrl })
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
