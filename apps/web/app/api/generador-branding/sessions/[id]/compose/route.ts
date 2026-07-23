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

const N_MOCKUPS = 1

// Pipeline compose-first (identidad fija, migración 12→7): genera UN mockup
// compuesto (etiqueta + logo integrados coherentemente, siguiendo el wireframe
// de layout del estilo) y de él se derivan la etiqueta plana y el logo aislado
// (ver /derive) — los tres artefactos quedan consistentes entre sí. Sin
// selección de variante: N=1 con botón "regenerar" en la UI. SSE porque una
// generación de imagen puede exceder el timeout normal; las refs (style-refs +
// wireframe) se cargan UNA vez. Persiste generation_status para observabilidad/resume.
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

        await updateBrandingSession(id, { generation_status: 'mockup', generation_error: null })
        send({ status: 'generating' })
        const mockups: string[] = []
        for (let i = 0; i < N_MOCKUPS; i++) {
          try {
            const parts: Part[] = [...refParts, { text: prompt }]
            if (precision) parts.push({ text: `Ajuste solicitado (priorízalo): ${precision}` })
            const b64 = await generateImage(parts)
            if (!b64) { console.error(`[compose ${i}] empty`); continue }
            const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', `mockup-${i}`)
            mockups.push(url)
            send({ status: 'progress', done: mockups.length, total: N_MOCKUPS })
          } catch (e) { console.error(`[compose ${i}]`, e) }
        }
        if (mockups.length === 0) {
          await updateBrandingSession(id, { generation_status: 'failed', generation_error: 'No se pudo generar el mockup' })
          send({ status: 'error', message: 'No se pudo generar el mockup', retryable: true }); return controller.close()
        }
        // N=1: el mockup elegido ES el generado. Se persiste directo (sin paso de selección).
        await updateBrandingSession(id, { mockup_url: mockups[0], mockup_options: mockups })
        await recordGenQuota(id, 'branding-mockup', userId)
        send({ status: 'done', images: mockups, regensLeft })
      } catch (err) {
        send({ status: 'error', message: String(err), retryable: true })
      } finally { controller.close() }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
}
