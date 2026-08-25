import { NextRequest } from 'next/server'
import { createBrandingSession, getBrandingSession, updateBrandingSession } from '@/lib/branding/db'
import { generateImage } from '@/lib/gemini'
import { uploadToStorage } from '@/lib/storage'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { currentCreditOwner } from '@/lib/credits'
import { ensureUserId } from '@/lib/product-hunter/session'
import { isFlagged } from '@/lib/branding/moderation'
import { isComplete, type Brief, type PartialBrief } from '@/lib/branding/brief'
import { briefFromRow } from '@/lib/branding/session-brief'
import { buildPrompt, aspectFor, STAGE_SEQUENCE, type Stage } from '@/lib/branding/generation'
import { extractBrandSystem } from '@/lib/branding/brand-system'
import type { Part } from '@google/genai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Identidad + 3 piezas derivadas, secuenciales con gpt-image-2 (~60-90s c/u). Fluid Compute da 300s.
export const maxDuration = 300

/**
 * Dónde vive cada pieza. Columnas legadas reusadas para no pedir migración:
 * `mockup_url` guarda la IDENTIDAD (es la imagen hero y la que el historial ya
 * usa como miniatura) y `container_url` la foto de producto.
 */
const COLUMN: Record<Stage, 'logo_url' | 'mockup_url' | 'label_url' | 'container_url'> = {
  identidad: 'mockup_url', logo: 'logo_url', etiqueta: 'label_url', mockup: 'container_url',
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

  // La identidad se resuelve ANTES del stream: el Set-Cookie viaja en los headers de
  // la respuesta, que ya salieron cuando corre `start()`. Acuñarla acá (y no solo
  // leerla) es lo que evita que la sesión nazca huérfana en un navegador sin ph_uid.
  const { uid: userId, setCookie } = await ensureUserId()

  // Por el mismo motivo: los créditos de imagen dependen del plan, y el plan se
  // resuelve leyendo la sesión (`getUser()` → cookies). Adentro de `start()` esas
  // cookies ya no son legibles de forma confiable, así que se resuelve acá afuera y
  // se le pasa a `checkGenQuota`. Es el OWNER, no el saldo: el saldo se recuenta en
  // cada etapa, así que las 4 imágenes de una corrida sí se descuentan entre sí.
  const creditOwner = await currentCreditOwner()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)

      try {
        // ── Resolver brief + sesión: corrida nueva o regeneración de una etapa ──
        let brief: Brief | null = null
        let sessionId: string

        if (body.sessionId) {
          const row = await getBrandingSession(body.sessionId, userId)
          if (!row) { send({ status: 'error', message: 'Esa sesión no existe' }); return }
          brief = briefFromRow(row as unknown as Record<string, unknown>)
          sessionId = body.sessionId
        } else {
          const b = body.brief ?? {}
          if (!isComplete(b)) { send({ status: 'error', message: 'El brief está incompleto' }); return }
          brief = b

          // Moderación ANTES de la primera generación: es gratis y evita pagar
          // imágenes que el motor va a rechazar igual.
          if (await isFlagged([b.brandName, b.tagline, b.productDescription, b.feel.join(' ')].filter(Boolean).join('\n'))) {
            send({ status: 'error', message: 'El texto no pasó la moderación. Prueba con otro nombre o descripción.' })
            return
          }

          sessionId = await createBrandingSession(userId)
          await updateBrandingSession(sessionId, {
            brand_name: b.brandName,
            product_category: b.category,
            product_type: b.productDescription,
            target_audience: b.audience.join(', '),
            // Las casillas del prompt maestro, en columnas que ya existían sin uso.
            tagline: b.tagline ?? null,
            descriptor: b.feel.join(', '),
            selected_palette: b.style.palette,
            direction: { inspiration: b.style.inspiration },
            step: 1,
            generation_status: 'running',
            generation_error: null,
          } as never)
        }

        if (!brief) { send({ status: 'error', message: 'La sesión no tiene un brief válido' }); return }
        send({ status: 'session', sessionId })

        const stages = body.only ? [body.only] : STAGE_SEQUENCE
        const origin = req.nextUrl.origin

        // En una regeneración suelta el board ya existe: se reusa como referencia.
        const existing = await getBrandingSession(sessionId, userId)
        let identityUrl: string | null = (existing?.mockup_url as string) ?? null
        const urls: Partial<Record<Stage, string>> = {}
        const failed: Stage[] = []

        // ⚠️ LA IDENTIDAD PRIMERO Y EL RESTO EN PARALELO — con la imagen en KIE ya no cabe en
        // secuencia. Cada pieza pasa a ser `createTask` + polling (~45-60 s medidos), y las 4
        // seguidas dieron **5,8 minutos** contra el `maxDuration = 300` de esta ruta: en Vercel el
        // stream muere antes de terminar y el usuario se queda con un kit a medias y la cuota de
        // cada etapa ya cobrada. Medido también el arreglo: 5,8 min → **2,9 min**, mismas 4 piezas.
        //
        // Las tres piezas que derivan de la identidad son independientes ENTRE SÍ: todas la reciben
        // a ella como referencia y ninguna mira a las otras. El cliente lleva el estado por etapa
        // (`setState({...s, [stage]: …})`), así que los eventos SSE fuera de orden se pintan bien.
        const correrEtapa = async (stage: Stage) => {
          const kind = `branding-${stage}`
          const { blocked } = await checkGenQuota(sessionId, kind, creditOwner)
          if (blocked) {
            send({ status: 'stage_failed', stage, message: 'Llegaste al límite de regeneraciones de este paso' })
            failed.push(stage)
            return
          }

          send({ status: 'stage', stage })
          try {
            // La identidad es la fuente: las piezas sueltas la reciben adjunta
            // para que sean LA MISMA marca y no tres lecturas distintas.
            const parts: Part[] = []
            if (stage !== 'identidad') {
              if (!identityUrl) throw new Error('no hay identidad de la que derivar esta pieza')
              parts.push(...(await refParts([identityUrl], origin)))
            }
            parts.push({ text: buildPrompt(stage, brief) })

            // generateImage ya reintenta internamente (3 intentos, OpenAI→Gemini).
            const b64 = await generateImage(parts, 3, { aspectRatio: aspectFor(stage) })
            if (!b64) throw new Error('el motor devolvió una imagen vacía')

            const url = await uploadToStorage(sessionId, Buffer.from(b64, 'base64'), 'image/png', stage)
            await updateBrandingSession(sessionId, { [COLUMN[stage]]: url } as never)
            await recordGenQuota(sessionId, kind, userId)
            if (stage === 'identidad') identityUrl = url
            urls[stage] = url
            send({ status: 'stage_done', stage, url })

            // ADN de marca (2026-08-07): el board de identidad es la fuente del sistema de diseño
            // de la landing. Se lee DESPUÉS del `stage_done` para no demorar la imagen en pantalla,
            // y siempre que la identidad se (re)genera — un board nuevo es una marca nueva.
            // Sin gen-quota propia: es 1 llamada de visión flash ($0) y ya va acotada por la cuota
            // de la etapa `identidad` que la produjo.
            if (stage === 'identidad') {
              try {
                await updateBrandingSession(sessionId, { brand_system: await extractBrandSystem(url) } as never)
              } catch (err) {
                // Nunca tumba la generación: sin sistema de marca, la landing cae a visión + nicho.
                // El mensaje separa los dos motivos porque fallan igual de callados: si la
                // migración 20260807000001 no está aplicada, el update tira "column does not
                // exist" y se lo confundiría con una visión caída.
                const msg = String(err)
                const causa = /column .* does not exist/i.test(msg)
                  ? 'falta aplicar la migración 20260807000001_branding_system.sql'
                  : 'falló la extracción'
                console.error(`[brand-system] ${causa}:`, err)
              }
            }
          } catch (err) {
            // Una pieza caída no tumba las demás: se entrega lo que sí salió y la
            // UI ofrece reintentar solo esa.
            failed.push(stage)
            send({ status: 'stage_failed', stage, message: String(err) })
          }
        }

        const [primera, ...derivadas] = stages
        if (primera) await correrEtapa(primera)
        // `correrEtapa` atrapa sus propios errores y no rechaza, así que una pieza que falla se
        // anota en `failed` y no puede tumbar a las otras dos.
        if (derivadas.length) await Promise.all(derivadas.map(correrEtapa))

        await updateBrandingSession(sessionId, {
          generation_status: failed.length ? 'partial' : 'done',
          generation_error: failed.length ? `fallaron: ${failed.join(', ')}` : null,
          step: 2,
        } as never)
        send({ status: 'done', sessionId, urls, failed })
      } catch (err) {
        send({ status: 'error', message: String(err), retryable: true })
      } finally {
        // ÚNICO cierre del stream. Los caminos de error de arriba hacen `return` a
        // secas: cerrar ahí además del finally es un doble cierre, y desde que la
        // identidad se resuelve fuera del stream `start()` ya no cede antes de esos
        // returns, así que el choque es SÍNCRONO y tumba la respuesta con un 500.
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...(setCookie ? { 'Set-Cookie': setCookie } : {}),
    },
  })
}
