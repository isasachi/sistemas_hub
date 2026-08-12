import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { createVideoTask, KIE_PROMPT_MAX, type VideoImage } from '@/lib/video-ads/kie'
import { groupIntoLotes, buildLotePrompt, type Lote } from '@/lib/video-ads/lotes'
import { AdaptedScriptSchema } from '@/lib/video-ads/adapt'
import { checkGenQuota, recordGenQuota, countGenUsage, VIDEO_RENDER_LIMIT } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { STEP } from '@/lib/video-ads/steps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// Un render por lote. La cuota se cobra por lote porque ese es el costo real: un
// guión de 28 s son dos llamadas a KIE, no una. La UI avisa cuántos renders va a
// consumir ANTES de arrancar (Section6Lotes).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await readUserId()

  const session = await getVideoSession(id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!session.adapted || !session.consistency_block || !session.voice_profile)
    return NextResponse.json({ error: 'Completa los pasos anteriores' }, { status: 409 })
  if (!session.character_url || !session.product_url)
    return NextResponse.json({ error: 'Faltan las imágenes de personaje y producto' }, { status: 409 })

  const adapted = AdaptedScriptSchema.parse(session.adapted)
  if (adapted.variablesPendientes.length)
    return NextResponse.json(
      { error: `El guión tiene variables sin completar: ${adapted.variablesPendientes.join(', ')}` },
      { status: 409 },
    )

  // Orden = numeración @image(n) del prompt. Siempre dos imágenes → modo multi-imagen,
  // que es donde `aspect_ratio: 9:16` sí se respeta.
  const images: VideoImage[] = [
    { url: session.character_url, role: 'la persona' },
    { url: session.product_url, role: 'el producto' },
  ]

  const base = groupIntoLotes(adapted.tomas)
  if (!base.length) return NextResponse.json({ error: 'El guión no tiene tomas' }, { status: 409 })

  // La cuota se verifica para TODOS los lotes de una: medio video renderizado es
  // dinero gastado en algo inservible.
  //
  // ⚠️ NO sirve llamar `checkGenQuota` N veces en un loop: solo LEE, no inserta, así
  // que N llamadas devuelven la misma respuesta N veces — verifica N veces que
  // alcanza para UNO, no que alcance para N. Con el tope en 3 y dos lotes, alguien
  // con 2 renders gastados pasaría el loop y arrancaría los dos, pasándose del tope.
  const { blocked } = await checkGenQuota(id, 'video-render')
  if (blocked) return blocked
  const usados = await countGenUsage(id, 'video-render')
  if (usados + base.length > VIDEO_RENDER_LIMIT) {
    return NextResponse.json(
      {
        error: `Este guión necesita ${base.length} ${base.length === 1 ? 'render' : 'renders'} y te ${VIDEO_RENDER_LIMIT - usados === 1 ? 'queda 1' : `quedan ${VIDEO_RENDER_LIMIT - usados}`}. Acorta el guión o empieza otra sesión.`,
      },
      { status: 429 },
    )
  }

  const lotes: Lote[] = []
  // Distinto de un fallo de red/KIE (500): un prompt que no entra ni al piso es un
  // problema del guión, no del servicio — se reporta 400 con el mensaje de
  // `buildLotePrompt` (ya en español, ya dice qué acortar) en vez del 500 genérico.
  let promptError: string | null = null

  try {
    for (const lote of base) {
      let prompt: string
      try {
        prompt = buildLotePrompt({
          lote,
          consistencyBlock: session.consistency_block,
          productDesc: session.product_scan?.productDescription ?? adapted.tomas[0]?.producto ?? 'el producto',
          escenario: session.forensic_analysis?.fondo ?? 'interior con luz natural',
          camara: session.forensic_analysis?.cortes[0]?.camara ?? 'primer plano, cámara en mano',
          voz: session.voice_profile,
          images,
        })
      } catch (err) {
        // `buildLotePrompt` administra su propio presupuesto de caracteres (arma el
        // prompt por niveles de detalle decrecientes) y solo lanza cuando ni el nivel
        // mínimo entra en KIE_PROMPT_MAX. Ese mensaje ya es claro y está en español —
        // se propaga tal cual en vez de perderlo detrás del 500 genérico del catch de
        // afuera.
        promptError = err instanceof Error ? err.message : 'No se pudo armar el prompt del lote.'
        break
      }

      // Última red: `buildLotePrompt` garantiza `prompt.length <= KIE_PROMPT_MAX` o
      // lanza, así que esto no debería dispararse nunca. Se deja como guard defensivo
      // por si ese contrato cambia en el futuro sin que se note acá.
      if (prompt.length > KIE_PROMPT_MAX) {
        promptError = `El lote ${lote.n} quedó muy largo (${prompt.length} de ${KIE_PROMPT_MAX} caracteres). Acorta las líneas del guión.`
        break
      }

      const taskId = await createVideoTask({ images, prompt, durationSec: lote.duracionSeg })
      lotes.push({ ...lote, prompt, taskId, status: 'waiting', videoUrl: null })
      await recordGenQuota(id, 'video-render', userId)
    }

    if (promptError) {
      // Se guarda lo que sí arrancó antes de toparse con el lote problemático: esas
      // tareas ya están pagadas y hay que poder verlas.
      if (lotes.length) await updateVideoSession(id, { step: STEP.LOTES, lotes })
      return NextResponse.json({ error: promptError }, { status: 400 })
    }

    await updateVideoSession(id, { step: STEP.LOTES, lotes, duration: lotes.reduce((n, l) => n + l.duracionSeg, 0) })
    return NextResponse.json({ lotes })
  } catch (err) {
    console.error('[video-ads/generate-lotes]', err)
    // Se guarda lo que sí arrancó: esas tareas ya están pagadas y hay que poder verlas.
    if (lotes.length) await updateVideoSession(id, { step: STEP.LOTES, lotes })
    return NextResponse.json({ error: 'No se pudo iniciar el render de todos los lotes.' }, { status: 500 })
  }
}
