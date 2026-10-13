import { NextRequest } from 'next/server'
import { AnunciosError, gate, generateAd } from '@/lib/anuncios/core'
import { errorResponse, load, notFound } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// El modelo de imagen tarda (medido). Sin esto Vercel corta antes de que vuelva la imagen.
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const precision = await req.json().then((b) => String(b?.prompt ?? '').trim()).catch(() => '')
  const row = await load(id)
  if (!row) return notFound()

  // El gate va ANTES de abrir el stream: un 429 tiene que ser un 429, no un evento dentro de un 200.
  let regensLeft: number | null
  try { regensLeft = await gate(id, 'anuncios-image', row.ctx) } catch (e) { return errorResponse(e) }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
      try {
        const out = await generateAd(row.session, { precision, gated: { regensLeft }, onStage: (status) => send({ status }) }, row.ctx)
        send({ status: 'done', ...out })
      } catch (err) {
        send({ status: 'error', message: err instanceof AnunciosError ? err.message : String(err), retryable: true })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
