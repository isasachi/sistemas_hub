import { NextRequest } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { generateImage } from '@/lib/gemini'
import { DirectionSchema } from '@/lib/branding/types'
import { buildLogoInstruction, LOGO_VARIANTS, REF_LOGO_VARIANTS } from '@/lib/branding/instructions'
import { parseDesignDna } from '@/lib/branding/style-extract'
import { genQuotaResponse } from '@/lib/gen-quota'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Etapa 3 — genera una tanda de logos (uno por variante) en paralelo. SSE porque
// son varias llamadas de imagen y excederían el timeout de Vercel en un request normal.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const blocked = await genQuotaResponse('branding-logo')
  if (blocked) return blocked

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)

      try {
        const session = await getBrandingSession(id)
        if (!session || !session.direction || !session.brand_name) {
          send({ status: 'error', message: 'Falta la dirección de marca' })
          return controller.close()
        }
        const direction = DirectionSchema.parse(session.direction)
        const brandName = session.brand_name

        // La imagen de referencia (si existe) entra como Image 1: style reference.
        // Se carga UNA vez fuera del loop (la generación es secuencial por OOM).
        const ref = session.logo_reference_url
          ? await fetchAsBase64(session.logo_reference_url)
          : null
        const refDna = parseDesignDna(session.logo_reference_analysis)

        send({ status: 'generating' })

        // Secuencial a propósito: cada logo es un base64 grande (~750 KB); generar
        // las 4 a la vez multiplica el pico de memoria. De a uno —generar, subir,
        // soltar— mantiene el pico bajo y emitimos progreso a medida que salen.
        // Con ref: variaciones sutiles que conservan el diseño de la ref. Sin ref: 4 estructuras distintas.
        const variants = ref ? REF_LOGO_VARIANTS : LOGO_VARIANTS
        const logos: string[] = []
        for (let i = 0; i < variants.length; i++) {
          try {
            const text: Part = { text: buildLogoInstruction(direction, brandName, variants[i], !!ref, refDna) }
            const parts: Part[] = ref
              ? [{ inlineData: { mimeType: ref.mimeType, data: ref.data } }, text]
              : [text]
            const b64 = await generateImage(parts)
            if (!b64) { console.error(`[logo ${i}] empty result (no image part)`); continue }
            const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', `logo-${i}`)
            logos.push(url)
            send({ status: 'progress', done: logos.length, total: variants.length })
          } catch (e) {
            console.error(`[logo ${i}] threw:`, e)
          }
        }

        if (logos.length === 0) {
          send({ status: 'error', message: 'No se pudo generar ningún logo', retryable: true })
          return controller.close()
        }

        await updateBrandingSession(id, { logo_options: logos })
        send({ status: 'done', images: logos })
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
