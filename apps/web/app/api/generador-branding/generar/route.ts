import { NextRequest } from 'next/server'
import { createBrandingSession, getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { isFlagged } from '@/lib/branding/moderation'
import { getPreset, isPresetId } from '@/lib/branding/presets'
import { isComplete, type Brief, type PartialBrief } from '@/lib/branding/brief'
import { buildPrompt, aspectFor, generationOrder, stageSequence, type Stage } from '@/lib/branding/generation'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// 3 imágenes secuenciales con gpt-image-2 (~60-90s c/u). Fluid Compute da 300s.
export const maxDuration = 300

const COLUMN: Record<Stage, 'logo_url' | 'mockup_url' | 'label_url'> = {
  logo: 'logo_url', mockup: 'mockup_url', label: 'label_url',
}

/** Cuántas referencias del moodboard se adjuntan por llamada (5 sería caro y ruidoso). */
const REFS_PER_CALL = 2

/** Las refs viven en /public: se leen por HTTP desde el mismo origen (en Vercel las sirve el CDN). */
async function refParts(paths: string[], origin: string): Promise<Part[]> {
  const parts: Part[] = []
  for (const p of paths) {
    const res = await fetch(new URL(p, origin))
    if (!res.ok) continue
    const buf = Buffer.from(await res.arrayBuffer())
    parts.push({ inlineData: { mimeType: res.headers.get('content-type') ?? 'image/jpeg', data: buf.toString('base64') } })
  }
  return parts
}

function briefFromRow(row: Record<string, unknown>): Brief | null {
  const b: PartialBrief = {
    category: (row.product_category as Brief['category']) ?? undefined,
    productDescription: (row.product_type as string) ?? undefined,
    brandName: (row.brand_name as string) ?? undefined,
    audience: row.target_audience ? String(row.target_audience).split(', ').filter(Boolean) : [],
    presetId: isPresetId(String(row.style_id ?? '')) ? (row.style_id as Brief['presetId']) : undefined,
  }
  return isComplete(b) ? b : null
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    brief?: PartialBrief
    sessionId?: string
    only?: Stage
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
      const userId = await readUserId()

      try {
        // ── Resolver brief + sesión: corrida nueva o regeneración de una etapa ──
        let brief: Brief | null = null
        let sessionId: string

        if (body.sessionId) {
          const row = await getBrandingSession(body.sessionId)
          if (!row) { send({ status: 'error', message: 'Esa sesión no existe' }); return controller.close() }
          brief = briefFromRow(row as unknown as Record<string, unknown>)
          sessionId = body.sessionId
        } else {
          const b = body.brief ?? {}
          if (!isComplete(b)) { send({ status: 'error', message: 'El brief está incompleto' }); return controller.close() }
          brief = b

          // Moderación ANTES de la primera generación: es gratis y evita pagar
          // imágenes que el motor va a rechazar igual.
          if (await isFlagged(`${b.brandName}\n${b.productDescription}`)) {
            send({ status: 'error', message: 'El texto no pasó la moderación. Prueba con otro nombre o descripción.' })
            return controller.close()
          }

          sessionId = await createBrandingSession(userId ?? undefined)
          await updateBrandingSession(sessionId, {
            brand_name: b.brandName,
            product_category: b.category,
            product_type: b.productDescription,
            target_audience: b.audience.join(', '),
            style_id: b.presetId,
            source_mode: 'preset',
            step: 1,
            generation_status: 'running',
            generation_error: null,
          } as never)
        }

        if (!brief) { send({ status: 'error', message: 'La sesión no tiene un brief válido' }); return controller.close() }
        send({ status: 'session', sessionId })

        const preset = getPreset(brief.presetId)
        const order = generationOrder()
        const stages = body.only ? [body.only] : stageSequence(order)
        const origin = req.nextUrl.origin
        const refs = await refParts(preset.moodboard.slice(0, REFS_PER_CALL), origin)

        // En una regeneración suelta el logo ya existe: se reusa como referencia.
        const existing = await getBrandingSession(sessionId)
        let logoUrl: string | null = (existing?.logo_url as string) ?? null
        const urls: Partial<Record<Stage, string>> = {}
        const failed: Stage[] = []

        for (const stage of stages) {
          const kind = `branding-${stage === 'label' ? 'label' : stage}`
          const { blocked } = await checkGenQuota(sessionId, kind)
          if (blocked) {
            send({ status: 'stage_failed', stage, message: 'Llegaste al límite de regeneraciones de este paso' })
            failed.push(stage)
            continue
          }

          send({ status: 'stage', stage })
          try {
            const useLogo = stage !== 'logo' && !!logoUrl
            const parts: Part[] = []
            if (useLogo) parts.push(...(await refParts([logoUrl!], origin)))
            parts.push(...refs, { text: buildPrompt(stage, brief, preset, useLogo) })

            // generateImage ya reintenta internamente (3 intentos, OpenAI→Gemini).
            const b64 = await generateImage(parts, 3, { aspectRatio: aspectFor(stage) })
            if (!b64) throw new Error('el motor devolvió una imagen vacía')

            const url = await uploadToStorage(sessionId, Buffer.from(b64, 'base64'), 'image/png', stage)
            await updateBrandingSession(sessionId, { [COLUMN[stage]]: url } as never)
            await recordGenQuota(sessionId, kind, userId)
            if (stage === 'logo') logoUrl = url
            urls[stage] = url
            send({ status: 'stage_done', stage, url })
          } catch (err) {
            // Una etapa caída no tumba las demás: se entrega lo que sí salió y la
            // UI ofrece reintentar solo esa (spec, criterios de errores).
            failed.push(stage)
            send({ status: 'stage_failed', stage, message: String(err) })
          }
        }

        await updateBrandingSession(sessionId, {
          generation_status: failed.length ? 'partial' : 'done',
          generation_error: failed.length ? `fallaron: ${failed.join(', ')}` : null,
          step: 2,
        } as never)
        send({ status: 'done', sessionId, urls, failed })
      } catch (err) {
        send({ status: 'error', message: String(err), retryable: true })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
