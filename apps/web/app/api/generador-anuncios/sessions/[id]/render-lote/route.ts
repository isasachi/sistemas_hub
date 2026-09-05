import { NextRequest } from 'next/server'
import { getSession, updateSession } from '@/lib/db'
import { fetchAsBase64, uploadToStorage } from '@/lib/storage'
import { editImage, callReasoning, STEP5_PROMPT } from '@/lib/gemini'
import { aspectRatioOf } from '@/lib/aspect'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { currentCreditStatus } from '@/lib/credits'
import { ReferenceAnalysisSchema, ProductScanSchema, AdBatchSchema, type AdVariant } from '@/lib/types'
import { getTemplate } from '@/lib/anuncios/templates'
import { STEP } from '@/lib/anuncios/steps'
import { contextoStep5 } from '@/lib/anuncios/step5-context'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// gpt-image-2 tarda 40-90 s medidos POR IMAGEN. En paralelo el tiempo de pared es el de la más
// lenta, no la suma — el precedente medido es branding: 4 secuenciales daban 5,8 min (moría) y
// en `Promise.all` 2,9 min.
export const maxDuration = 300

/**
 * RENDERIZAR EL LOTE — §29 del spec: los conceptos ya aprobados se renderizan en paralelo y una
 * generación caída no bloquea a las demás.
 *
 * ⚠️ CADA VARIANTE SE PERSISTE EN CUANTO TERMINA, no al final del lote. Es la propiedad que hace
 * que esto sea seguro: si el stream muere a los cuatro minutos —o Vercel corta en `maxDuration`—
 * lo que ya se pagó queda guardado y volver a llamar solo re-renderiza las pendientes. Con una
 * sola escritura al final, un corte tira N imágenes ya cobradas.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await readUserId()

  const session = await getSession(id, userId)
  if (!session) return Response.json({ error: 'No se encontró la sesión' }, { status: 404 })

  const template = getTemplate(session.template_id)
  if (!template) return Response.json({ error: 'Esta sesión no tiene plantilla' }, { status: 409 })
  if (!session.reference_url || !session.product_url)
    return Response.json({ error: 'Completa los pasos anteriores primero' }, { status: 409 })

  const parsed = AdBatchSchema.safeParse(session.variants)
  if (!parsed.success || parsed.data.length === 0)
    return Response.json({ error: 'Todavía no hay un lote planificado' }, { status: 409 })
  const variants = parsed.data

  // ⚠️ DOS LLAMADAS A LA VEZ SE PISARÍAN LAS ESCRITURAS. Dentro de UNA request las escrituras se
  // serializan (ver `persistir`), pero dos requests concurrentes son dos procesos escribiendo el
  // mismo jsonb: la segunda pisaría lo que la primera acaba de guardar. Mismo criterio que el 409
  // del render por lotes de video.
  if (variants.some((v) => v.estado === 'generando'))
    return Response.json({ error: 'Este lote ya se está generando. Espera a que termine.' }, { status: 409 })

  const pendientes = variants.filter((v) => v.estado !== 'lista')
  if (pendientes.length === 0)
    return Response.json({ error: 'El lote ya está completo.' }, { status: 409 })

  // ⚠️ SE VERIFICAN LOS CRÉDITOS DE TODAS LAS PENDIENTES ANTES DE CREAR LA PRIMERA. Medio lote
  // renderizado es dinero gastado en algo inservible — la misma regla que `generate-lotes` en
  // video. `checkGenQuota` mira de a una, así que sin esto un usuario con 2 créditos arrancaría
  // un lote de 5 y descubriría el 429 con dos imágenes ya cobradas.
  const credits = await currentCreditStatus()
  if (credits && credits.restantes < pendientes.length)
    return Response.json(
      {
        error: `Te quedan ${credits.restantes} créditos y este lote necesita ${pendientes.length}.`,
        credits,
      },
      { status: 429 }
    )

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)

      // El array vivo del lote. Cada variante que termina escribe SU entrada acá y dispara una
      // persistencia; `persistir` las serializa en una cola para que dos que terminen juntas no
      // se pisen la una a la otra.
      const estado: AdVariant[] = variants.map((v) => ({ ...v }))
      let cola: Promise<unknown> = Promise.resolve()
      const persistir = () => {
        const foto = estado.map((v) => ({ ...v }))
        cola = cola
          .then(() => updateSession(id, {
            variants: foto,
            // ⚠️ LA MINIATURA DEL DASHBOARD. `listSessions` selecciona `image_url`, así que sin
            // esto un lote entero queda sin previsualización en el historial. Se estampa la
            // PRIMERA que termine, igual que `lote-status` hace con `video_url` en video.
            ...(foto.find((v) => v.imageUrl) ? { image_url: foto.find((v) => v.imageUrl)!.imageUrl } : {}),
          }))
          .catch((e) => console.error(`[render-lote] ${id}: no se pudo persistir`, e))
        return cola
      }

      try {
        const refAnalysis = ReferenceAnalysisSchema.parse(session.reference_analysis)
        const productScan = ProductScanSchema.parse(session.product_scan)
        const hasLogo = !!session.logo_url

        send({ status: 'loading_images', total: pendientes.length })
        // Las tres imágenes se cargan UNA vez y se comparten: son las mismas para las N
        // variantes, y bajarlas N veces son N descargas por nada.
        const [ref, product, logo] = await Promise.all([
          fetchAsBase64(session.reference_url!),
          fetchAsBase64(session.product_url!),
          session.logo_url ? fetchAsBase64(session.logo_url) : Promise.resolve(null),
        ])
        const aspectRatio = await aspectRatioOf(Buffer.from(ref.data, 'base64'))

        const rol = new Map(template.slots.map((s) => [s.id, s.rol]))

        await Promise.all(
          pendientes.map(async (pendiente) => {
            const i = estado.findIndex((v) => v.id === pendiente.id)
            const kind = `anuncios-image:${pendiente.id}`

            // Por variante: cada una tiene su propio cupo de regeneraciones (el sufijo hace que
            // `checkGenQuota` cuente por `(sesión, kind)` exacto) y su propio crédito.
            const { blocked } = await checkGenQuota(id, kind)
            if (blocked) {
              estado[i] = { ...estado[i], estado: 'fallida', error: 'Sin cuota para esta variante' }
              send({ status: 'variant', variant: estado[i] })
              await persistir()
              return
            }

            estado[i] = { ...estado[i], estado: 'generando', error: null }
            send({ status: 'variant', variant: estado[i] })

            try {
              const copy = estado[i].slots.map((s) => ({
                element: rol.get(s.slot) ?? s.slot,
                text: s.texto,
              }))
              // Los slots que llena el producto (el nombre de la marca) los pone el código: no se
              // le piden a un modelo que los puede reescribir.
              for (const s of template.slots)
                if (s.fuente === 'producto' && session.product_name)
                  copy.push({ element: s.rol, text: session.product_name })

              const instruccion = await callReasoning(
                STEP5_PROMPT,
                contextoStep5({
                  aspectRatio,
                  ref: refAnalysis,
                  scan: productScan,
                  productName: session.product_name,
                  whatItIs: session.what_it_is,
                  whatItDoes: session.what_it_does,
                  targetAudience: session.target_audience,
                  hasLogo,
                  version: estado[i].id,
                  copy,
                }),
                { preferGemini: true }
              )

              const b64 = await editImage(
                ref.data, ref.mimeType,
                product.data, product.mimeType,
                logo?.data ?? null, logo?.mimeType ?? null,
                instruccion,
                aspectRatio
              )
              if (!b64) throw new Error('La generación volvió vacía')

              const url = await uploadToStorage(id, Buffer.from(b64, 'base64'), 'image/png', `lote-${estado[i].id}`)
              estado[i] = { ...estado[i], estado: 'lista', imageUrl: url, error: null }
              await recordGenQuota(id, kind, userId)
            } catch (err) {
              console.error(`[render-lote] ${id}/${pendiente.id}`, err)
              // Una variante caída NO tumba el lote (§29). Queda `fallida` con su motivo, y
              // volver a llamar la reintenta sin re-renderizar las que ya salieron.
              estado[i] = {
                ...estado[i],
                estado: 'fallida',
                error: err instanceof Error ? err.message : String(err),
              }
            }

            send({ status: 'variant', variant: estado[i] })
            await persistir()
          })
        )

        const listas = estado.filter((v) => v.estado === 'lista').length
        await updateSession(id, { step: STEP.ANUNCIOS })
        await cola
        send({ status: 'done', listas, fallidas: estado.length - listas, variants: estado })
      } catch (err) {
        console.error('[render-lote]', err)
        // Se persiste lo que haya salido antes de morir: es dinero ya gastado.
        await persistir().catch(() => {})
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
