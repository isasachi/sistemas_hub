import { NextRequest } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import { resolveEffectivePreset, sessionBrief, styleRefParts } from '@/lib/branding/effective-preset'
import { buildComposedMockupPrompt } from '@/lib/branding/generation-prompts'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const N_MOCKUPS = 3

// Pipeline compose-first: genera N variantes del MOCKUP COMPUESTO (etiqueta +
// logo integrados coherentemente). El usuario elige una en la UI y de esa
// elección se derivan la etiqueta plana y el logo aislado (ver /derive) — así
// los tres artefactos quedan consistentes entre sí. SSE (varias llamadas de
// imagen exceden el timeout normal). Las refs se cargan UNA vez fuera del loop.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let precision = ''
  try { const b = await req.json(); precision = (b?.prompt ?? '').trim() } catch { /* sin body */ }

  const { blocked, regensLeft } = await checkGenQuota(id, 'branding-mockup')
  if (blocked) return blocked
  const userId = await readUserId()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (d: Record<string, unknown>) => controller.enqueue(`data: ${JSON.stringify(d)}\n\n`)
      try {
        const session = await getBrandingSession(id)
        if (!session || !session.style_id || !session.brand_name) {
          send({ status: 'error', message: 'Falta el estilo o el nombre de marca' })
          return controller.close()
        }
        const preset = resolveEffectivePreset(session)
        const brief = sessionBrief(session)
        const prompt = buildComposedMockupPrompt(brief, preset)
        const refParts = await styleRefParts(session)

        send({ status: 'generating' })
        const mockups: string[] = []
        for (let i = 0; i < N_MOCKUPS; i++) {
          try {
            const parts: Part[] = [
              ...refParts,
              { text: prompt },
              { text: `Variante ${i + 1} de ${N_MOCKUPS}: mantené el estilo pero variá la composición/ángulo/encuadre del producto.` },
            ]
            if (precision) parts.push({ text: `Ajuste solicitado (priorízalo): ${precision}` })
            const b64 = await generateImage(parts)
            if (!b64) { console.error(`[compose ${i}] empty`); continue }
            const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', `mockup-${i}`)
            mockups.push(url)
            send({ status: 'progress', done: mockups.length, total: N_MOCKUPS })
          } catch (e) { console.error(`[compose ${i}]`, e) }
        }
        if (mockups.length === 0) { send({ status: 'error', message: 'No se pudo generar ningún mockup', retryable: true }); return controller.close() }
        await updateBrandingSession(id, { mockup_options: mockups })
        await recordGenQuota(id, 'branding-mockup', userId)
        send({ status: 'done', images: mockups, regensLeft })
      } catch (err) {
        send({ status: 'error', message: String(err), retryable: true })
      } finally { controller.close() }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
}
