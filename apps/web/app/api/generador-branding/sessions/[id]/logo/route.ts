import { NextRequest } from 'next/server'
import { getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import { resolveEffectivePreset, sessionBrief, styleRefParts } from '@/lib/branding/effective-preset'
import { buildPromptFromPreset } from '@/lib/branding/generation-prompts'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const N_LOGOS = 4

// Genera N variantes de logo. SSE (varias llamadas de imagen exceden el timeout normal).
// Las refs se cargan UNA vez fuera del loop (modo upload: la imagen del usuario; modo
// preset: las 5 del estilo) — evita re-fetch por variante y pico de memoria.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let precision = ''
  try { const b = await req.json(); precision = (b?.prompt ?? '').trim() } catch { /* sin body */ }

  const { blocked, regensLeft } = await checkGenQuota(id, 'branding-logo')
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
        const { prompt } = buildPromptFromPreset('logo', preset, sessionBrief(session))
        const refParts = await styleRefParts(session)

        send({ status: 'generating' })
        const logos: string[] = []
        for (let i = 0; i < N_LOGOS; i++) {
          try {
            const parts: Part[] = [
              ...refParts,
              { text: prompt },
              { text: `Variante ${i + 1} de ${N_LOGOS}: mantené el estilo pero variá la composición del mark.` },
            ]
            if (precision) parts.push({ text: `Ajuste solicitado (priorízalo): ${precision}` })
            const b64 = await generateImage(parts)
            if (!b64) { console.error(`[logo ${i}] empty`); continue }
            const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', `logo-${i}`)
            logos.push(url)
            send({ status: 'progress', done: logos.length, total: N_LOGOS })
          } catch (e) { console.error(`[logo ${i}]`, e) }
        }
        if (logos.length === 0) { send({ status: 'error', message: 'No se pudo generar ningún logo', retryable: true }); return controller.close() }
        await updateBrandingSession(id, { logo_options: logos })
        await recordGenQuota(id, 'branding-logo', userId)
        send({ status: 'done', images: logos, regensLeft })
      } catch (err) {
        send({ status: 'error', message: String(err), retryable: true })
      } finally { controller.close() }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
}
