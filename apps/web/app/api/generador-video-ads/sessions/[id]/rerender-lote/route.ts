import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { createVideoTask, SIN_KEY } from '@/lib/video-ads/kie'
import { currentKieKey } from '@/lib/user-settings'
import type { Lote } from '@/lib/video-ads/lotes'
import { renderDone, insumosDeRender, promptDeLote } from '@/lib/video-ads/render-lotes'
import { AdaptedScriptSchema } from '@/lib/video-ads/adapt'
import { checkGlobalBackstop, recordGenQuota } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { isInFlight } from '@/lib/video-ads/lote-ui'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Re-renderiza UN lote de un render ya hecho. Body: `{ n }`.
 *
 * Existe porque "generar de nuevo" re-renderiza los N lotes: la huella de contenido
 * es de la sesión entera, así que corregir un solo clip malo costaba el video completo.
 * Acá el lote se reconstruye con los MISMOS insumos que `generate-lotes`
 * (`insumosDeRender` / `promptDeLote`): mismo prompt, misma huella, y solo cambia el
 * sorteo del modelo — que es lo que un clip que salió mal necesita.
 *
 * Es una llamada pagada con la key del USUARIO (BYOK), sin gate per-video: no es una
 * generación nueva, es un clip suelto. Lo que sí aplica es el backstop diario global
 * (`checkGlobalBackstop`), y se registra `video-render` para que el costo se vea.
 *
 * El reparto tiene que coincidir con lo guardado: si el guión cambió y ahora salen
 * otros lotes, un clip suelto no tiene a qué hermanos pegarse — ahí es "generar de
 * nuevo", no esto.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await readUserId()
  const session = await getVideoSession(id, userId)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { n?: unknown }
  const n = Number(body.n)
  const guardados = session.lotes ?? []
  const i = guardados.findIndex((l) => l.n === n)
  if (!Number.isInteger(n) || i < 0) return NextResponse.json({ error: `No existe el lote ${body.n}` }, { status: 400 })
  if (isInFlight(guardados[i])) return NextResponse.json({ error: `El lote ${n} todavía se está renderizando` }, { status: 409 })
  if (!session.adapted || !session.voice_profile)
    return NextResponse.json({ error: 'Completa los pasos anteriores' }, { status: 409 })

  let insumos: ReturnType<typeof insumosDeRender>
  let prompt: string
  let durationSec: number
  try {
    insumos = insumosDeRender(session, AdaptedScriptSchema.parse(session.adapted), session.voice_profile)
    if (insumos.agrupados.length !== guardados.length)
      return NextResponse.json(
        { error: `El guión cambió y ahora produce ${insumos.agrupados.length} lotes en vez de ${guardados.length}: genera el video de nuevo.` },
        { status: 409 },
      )
    ;({ prompt, durationSec } = promptDeLote(insumos.agrupados[i], insumos.camaras[i], insumos))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo armar el lote' }, { status: 400 })
  }

  // BYOK: la key ANTES del backstop, para no escribir cuota por una llamada que moriría en 401.
  const kieKey = await currentKieKey()
  if (!kieKey) return NextResponse.json({ error: SIN_KEY }, { status: 400 })
  const { blocked } = await checkGlobalBackstop()
  if (blocked) return blocked

  let taskId: string
  try {
    taskId = await createVideoTask({ images: insumos.images, prompt, durationSec }, kieKey)
  } catch (err) {
    console.error('[video-ads/rerender-lote]', err)
    return NextResponse.json({ error: 'KIE no aceptó la tarea. Intenta de nuevo.' }, { status: 502 })
  }

  // Solo se toca ESTE lote; los hermanos conservan su clip y su huella. El sondeo de
  // `lote-status` recoge el estado nuevo, copia el mp4 al bucket y reconcilia `render_done`.
  const nuevo: Lote = {
    ...insumos.agrupados[i], duracionSeg: durationSec, prompt, taskId,
    status: 'waiting', videoUrl: null, failMsg: null, scriptHash: insumos.huella,
  }
  const lotes = guardados.map((l, k) => (k === i ? nuevo : l))
  await updateVideoSession(id, { lotes, render_done: renderDone(lotes) })
  await recordGenQuota(id, 'video-render', userId)
  return NextResponse.json({ lotes })
}
