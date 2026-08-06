import { NextRequest } from 'next/server'
import { createBrandingSession, getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { isFlagged } from '@/lib/branding/moderation'
import { frontPanel } from '@/lib/branding/variants'
import { isComplete, type Brief, type PartialBrief } from '@/lib/branding/brief'
import { briefFromRow } from '@/lib/branding/session-brief'
import { buildBrandboard } from '@/lib/branding/brandboard'
import { buildPrompt, aspectFor, STAGE_SEQUENCE, type Ref, type Stage } from '@/lib/branding/generation'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// 3 imágenes secuenciales con gpt-image-2 (~60-90s c/u). Fluid Compute da 300s.
export const maxDuration = 300

const COLUMN: Record<Stage, 'logo_url' | 'mockup_url' | 'label_url'> = {
  logo: 'logo_url', mockup: 'mockup_url', label: 'label_url',
}

/** Trae una imagen por HTTP como parte inline. La usa la ref del logo de la cascada. */
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

/** El mockup recibe SOLO el frente del 360: recorte en memoria, sin subir nada. */
async function frontPanelPart(labelUrl: string): Promise<Part[]> {
  const res = await fetch(labelUrl)
  if (!res.ok) return []
  const front = await frontPanel(Buffer.from(await res.arrayBuffer()))
  return [{ inlineData: { mimeType: 'image/png', data: front.toString('base64') } }]
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
          if (await isFlagged(`${b.brandName}\n${b.productDescription}\n${b.feel.join(' ')}`)) {
            send({ status: 'error', message: 'El texto no pasó la moderación. Prueba con otro nombre o descripción.' })
            return controller.close()
          }

          sessionId = await createBrandingSession(userId ?? undefined)
          await updateBrandingSession(sessionId, {
            brand_name: b.brandName,
            product_category: b.category,
            product_type: b.productDescription,
            target_audience: b.audience.join(', '),
            // El estilo compuesto en el editor. `descriptor` guarda la actitud y las
            // dos jsonb la paleta y las tipografías: columnas que ya existían sin uso.
            descriptor: b.feel.join(', '),
            selected_palette: b.style.palette,
            selected_typography: b.style.typography,
            container_type: b.containerType ?? null,
            step: 1,
            generation_status: 'running',
            generation_error: null,
          } as never)
        }

        if (!brief) { send({ status: 'error', message: 'La sesión no tiene un brief válido' }); return controller.close() }
        send({ status: 'session', sessionId })

        const stages = body.only ? [body.only] : STAGE_SEQUENCE
        const origin = req.nextUrl.origin

        // En una regeneración suelta el logo ya existe: se reusa como referencia.
        const existing = await getBrandingSession(sessionId)
        let logoUrl: string | null = (existing?.logo_url as string) ?? null
        let labelUrl: string | null = (existing?.label_url as string) ?? null
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
            // Cascada: la etiqueta monta sobre el logo y el mockup sobre la etiqueta
            // (así el envase muestra la MISMA etiqueta que se entrega). Si la pieza
            // previa falló, se cae al logo y en última instancia a ninguna.
            const ref: Ref = stage === 'logo' ? 'none'
              : stage === 'mockup' && labelUrl ? 'label'
              : logoUrl ? 'logo' : 'none'
            const parts: Part[] = []
            if (ref === 'label') parts.push(...(await frontPanelPart(labelUrl!)))
            else if (ref === 'logo') parts.push(...(await refParts([logoUrl!], origin)))
            parts.push({ text: buildPrompt(stage, brief, ref) })

            // generateImage ya reintenta internamente (3 intentos, OpenAI→Gemini).
            const b64 = await generateImage(parts, 3, { aspectRatio: aspectFor(stage) })
            if (!b64) throw new Error('el motor devolvió una imagen vacía')

            const url = await uploadToStorage(sessionId, Buffer.from(b64, 'base64'), 'image/png', stage)
            await updateBrandingSession(sessionId, { [COLUMN[stage]]: url } as never)
            await recordGenQuota(sessionId, kind, userId)
            if (stage === 'logo') logoUrl = url
            if (stage === 'label') labelUrl = url
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
        // Etapa 5: el brandboard se arma SIEMPRE al terminar, se pida o no, y sin
        // tocar el modelo (pdf-lib sobre las piezas ya generadas).
        if (!body.only) {
          send({ status: 'stage', stage: 'brandboard' })
          try {
            const row = await getBrandingSession(sessionId)
            const grab = async (u: string | null) =>
              u ? Buffer.from(await (await fetch(u)).arrayBuffer()) : null
            const pdf = await buildBrandboard({
              brandName: brief.brandName,
              productDescription: brief.productDescription,
              audience: brief.audience,
              style: brief.style,
              feel: brief.feel,
              logo: await grab((row?.logo_url as string) ?? null),
              mockup: await grab((row?.mockup_url as string) ?? null),
              label: await grab((row?.label_url as string) ?? null),
            })
            await uploadToStorage(sessionId, pdf, 'application/pdf', 'brandboard')
            send({ status: 'stage_done', stage: 'brandboard' })
          } catch (err) {
            send({ status: 'stage_failed', stage: 'brandboard', message: String(err) })
          }
        }

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
