import { NextRequest } from 'next/server'
import { createBrandingSession, getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { isFlagged } from '@/lib/branding/moderation'
import { isComplete, type Brief, type PartialBrief } from '@/lib/branding/brief'
import { briefFromRow } from '@/lib/branding/session-brief'
import { buildPrompt, aspectFor, STAGE_SEQUENCE, type Stage } from '@/lib/branding/generation'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Board + 2 piezas derivadas, secuenciales con gpt-image-2 (~60-90s c/u). Fluid Compute da 300s.
export const maxDuration = 300

/**
 * Dónde vive cada pieza. Se reusan las columnas que ya existen para no pedir una
 * migración: `mockup_url` guarda el BOARD (es la imagen hero de la marca, y es la
 * que el historial ya usa como miniatura) y `label_url` el empaque suelto.
 */
const COLUMN: Record<Stage, 'logo_url' | 'mockup_url' | 'label_url'> = {
  brandbook: 'mockup_url', logo: 'logo_url', empaque: 'label_url',
}

/** Trae una imagen por HTTP como parte inline. La usa el board como referencia. */
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
          if (await isFlagged([b.brandName, b.tagline, b.productDescription, b.feel.join(' ')].filter(Boolean).join('\n'))) {
            send({ status: 'error', message: 'El texto no pasó la moderación. Prueba con otro nombre o descripción.' })
            return controller.close()
          }

          sessionId = await createBrandingSession(userId ?? undefined)
          await updateBrandingSession(sessionId, {
            brand_name: b.brandName,
            product_category: b.category,
            product_type: b.productDescription,
            target_audience: b.audience.join(', '),
            // Las casillas del prompt maestro, en columnas que ya existían sin uso.
            tagline: b.tagline ?? null,
            descriptor: b.feel.join(', '),
            selected_palette: b.style.palette,
            // `direction` (jsonb, legado sin uso) guarda las 3 casillas de texto
            // del prompt: inspiración, estilo gráfico y piezas del board.
            direction: { inspiration: b.style.inspiration, graphicStyle: b.style.graphicStyle, products: b.style.products },
            step: 1,
            generation_status: 'running',
            generation_error: null,
          } as never)
        }

        if (!brief) { send({ status: 'error', message: 'La sesión no tiene un brief válido' }); return controller.close() }
        send({ status: 'session', sessionId })

        const stages = body.only ? [body.only] : STAGE_SEQUENCE
        const origin = req.nextUrl.origin

        // En una regeneración suelta el board ya existe: se reusa como referencia.
        const existing = await getBrandingSession(sessionId)
        let boardUrl: string | null = (existing?.mockup_url as string) ?? null
        const urls: Partial<Record<Stage, string>> = {}
        const failed: Stage[] = []

        for (const stage of stages) {
          const kind = `branding-${stage}`
          const { blocked } = await checkGenQuota(sessionId, kind)
          if (blocked) {
            send({ status: 'stage_failed', stage, message: 'Llegaste al límite de regeneraciones de este paso' })
            failed.push(stage)
            continue
          }

          send({ status: 'stage', stage })
          try {
            // El board es la fuente: las piezas sueltas lo reciben adjunto para
            // que el logo del zip sea EL MISMO logo del board y no otra lectura.
            const parts: Part[] = []
            if (stage !== 'brandbook') {
              if (!boardUrl) throw new Error('no hay brandbook del que derivar esta pieza')
              parts.push(...(await refParts([boardUrl], origin)))
            }
            parts.push({ text: buildPrompt(stage, brief) })

            // generateImage ya reintenta internamente (3 intentos, OpenAI→Gemini).
            const b64 = await generateImage(parts, 3, { aspectRatio: aspectFor(stage) })
            if (!b64) throw new Error('el motor devolvió una imagen vacía')

            const url = await uploadToStorage(sessionId, Buffer.from(b64, 'base64'), 'image/png', stage)
            await updateBrandingSession(sessionId, { [COLUMN[stage]]: url } as never)
            await recordGenQuota(sessionId, kind, userId)
            if (stage === 'brandbook') boardUrl = url
            urls[stage] = url
            send({ status: 'stage_done', stage, url })
          } catch (err) {
            // Una pieza caída no tumba las demás: se entrega lo que sí salió y la
            // UI ofrece reintentar solo esa.
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
