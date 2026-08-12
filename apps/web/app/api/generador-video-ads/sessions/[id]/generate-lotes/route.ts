import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { createVideoTask, clampDuration, KIE_PROMPT_MAX, type VideoImage } from '@/lib/video-ads/kie'
import { groupIntoLotes, buildLotePrompt, type Lote } from '@/lib/video-ads/lotes'
import { totalDuration, resumeSeed, mergeRescue, renderQuotaError } from '@/lib/video-ads/render-lotes'
import { AdaptedScriptSchema, type AdaptedScript } from '@/lib/video-ads/adapt'
import { checkGenQuota, recordGenQuota, countGenUsage, VIDEO_RENDER_LIMIT } from '@/lib/gen-quota'
import { readUserId } from '@/lib/product-hunter/session'
import { STEP } from '@/lib/video-ads/steps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Guarda el resultado (completo o parcial) sin dejar que un fallo de escritura se
 * lleve puesto el `taskId` de tareas ya pagadas (fix round 1): si `updateVideoSession`
 * lanza dentro del catch de arriba, ese throw escapaba del handler y los identificadores
 * ya pagados se perdían sin dejar rastro. Acá quedan al menos logueados.
 */
async function saveRescue(id: string, lotes: Lote[]) {
  try {
    await updateVideoSession(id, { step: STEP.LOTES, lotes, duration: totalDuration(lotes) })
  } catch (err) {
    console.error(
      '[video-ads/generate-lotes] no se pudo guardar el rescate; taskId ya pagados:',
      lotes.filter((l) => l.taskId).map((l) => l.taskId),
      err,
    )
  }
}

// Un render por lote. La cuota se cobra por lote porque ese es el costo real: un
// guión de 28 s son dos llamadas a KIE, no una. La UI avisa cuántos renders va a
// consumir ANTES de arrancar (Section6Lotes).
export async function POST(
  req: NextRequest,
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

  // El guión guardado pasa por schema en cada escritura previa y debería llegar
  // siempre válido, pero es dato de DB, no de este request: un `.parse` sin try acá
  // sería un ZodError sin manejar (500 opaco de Next) en vez de un JSON de error
  // controlado, igual que se evita más abajo para `buildLotePrompt`.
  let adapted: AdaptedScript
  try {
    adapted = AdaptedScriptSchema.parse(session.adapted)
  } catch (err) {
    console.error('[video-ads/generate-lotes] guión adaptado corrupto', err)
    return NextResponse.json(
      { error: 'El guión guardado no es válido. Vuelve a adaptarlo desde el paso anterior.' },
      { status: 500 },
    )
  }
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

  // Reanudar es explícito (`{ resume: true }` en el body), no automático — si no, un
  // doble submit (doble clic, StrictMode) o un reintento tras un fallo parcial pasan
  // AMBOS por acá, recalculan `base` desde cero y crean tareas NUEVAS para lotes que
  // ya tienen `taskId`: el taskId viejo, ya pagado, queda huérfano sin forma de verlo.
  // Body vacío o no-JSON (la UI todavía no llama con `resume`, ver duda del round
  // anterior) se trata como "no es un reintento explícito", no como error.
  let resume = false
  try {
    const body: unknown = await req.json()
    resume = !!body && typeof body === 'object' && (body as { resume?: unknown }).resume === true
  } catch {
    /* sin body o no-JSON */
  }

  const existentes = session.lotes ?? []
  if (existentes.some((l) => l.taskId) && !resume) {
    return NextResponse.json(
      {
        error: 'Esta sesión ya tiene un render en curso o parcialmente completado. Reanúdalo en vez de reiniciar.',
        lotes: existentes,
      },
      { status: 409 },
    )
  }

  // Al reanudar, cada índice de `base` (determinista mientras `adapted.tomas` no
  // cambie) se empareja con lo que ya estaba guardado en la misma posición: si ese
  // lote ya tiene `taskId`, se conserva tal cual — esa tarea ya está pagada y no se
  // recrea. Ver `resumeSeed` (render-lotes.ts).
  const seed: Lote[] = resume ? resumeSeed(base, existentes) : base
  const pendientes = seed.filter((l) => !l.taskId)
  // Nada por crear: o reanuda una sesión ya completa, o es un doble submit sobre una
  // que terminó justo antes — de cualquier modo, no hay nada pagado de más que hacer.
  if (!pendientes.length) return NextResponse.json({ lotes: seed })

  // La cuota se verifica para TODOS los lotes que van a crear tarea (no el total del
  // guión: al reanudar, los ya pagados no cuentan otra vez) de una sola vez: medio
  // video renderizado es dinero gastado en algo inservible.
  //
  // ⚠️ NO sirve llamar `checkGenQuota` N veces en un loop: solo LEE, no inserta, así
  // que N llamadas devuelven la misma respuesta N veces — verifica N veces que
  // alcanza para UNO, no que alcance para N.
  const { blocked } = await checkGenQuota(id, 'video-render')
  if (blocked) return blocked
  const usados = await countGenUsage(id, 'video-render')
  const quotaError = renderQuotaError(pendientes.length, usados, VIDEO_RENDER_LIMIT)
  if (quotaError) return NextResponse.json({ error: quotaError }, { status: 429 })

  const lotes: Lote[] = []
  // Distinto de un fallo de red/KIE (500): un prompt que no entra ni al piso es un
  // problema del guión, no del servicio — se reporta 400 con el mensaje de
  // `buildLotePrompt` (ya en español, ya dice qué acortar) en vez del 500 genérico.
  let promptError: string | null = null

  try {
    for (const lote of seed) {
      if (lote.taskId) { lotes.push(lote); continue } // reanudado: ya pagado, no se recrea

      // Una sola fuente para la duración: el texto del prompt ("Duración total del
      // clip") y el `durationSec` que se manda a KIE tienen que ser EXACTAMENTE el
      // mismo valor clampeado. Calcularlo dos veces (o clampear solo uno de los dos)
      // desincroniza lo que el prompt promete de lo que el modelo renderiza, y el
      // audio sale cortado a mitad de frase — justo lo que advierte la cabecera de
      // lotes.ts sobre "alguien río abajo lo clampea".
      const durationSec = clampDuration(lote.duracionSeg)
      const loteParaPrompt = durationSec === lote.duracionSeg ? lote : { ...lote, duracionSeg: durationSec }

      let prompt: string
      try {
        prompt = buildLotePrompt({
          lote: loteParaPrompt,
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

      const taskId = await createVideoTask({ images, prompt, durationSec })
      lotes.push({ ...lote, duracionSeg: durationSec, prompt, taskId, status: 'waiting', videoUrl: null, failMsg: null })
      await recordGenQuota(id, 'video-render', userId)
    }

    if (promptError) {
      // Los lotes que no llegaron a procesarse quedan como placeholder `idle` (no
      // como si nunca hubieran existido): sin esto, un render de 3 lotes que corta en
      // el 2 se guardaba con un array de largo 1, `lote-status` lo veía "completo"
      // (`done = lotes.every(...)` sobre un array corto) y la sesión quedaba marcada
      // terminada con dos tercios del video sin renderizar, sin salida para terminarla.
      const rescatados = mergeRescue(seed, lotes)
      await saveRescue(id, rescatados)
      return NextResponse.json({ error: promptError, lotes: rescatados }, { status: 400 })
    }

    await updateVideoSession(id, { step: STEP.LOTES, lotes, duration: totalDuration(lotes) })
    return NextResponse.json({ lotes })
  } catch (err) {
    console.error('[video-ads/generate-lotes]', err)
    // Mismo rescate que en la rama de arriba: lo que sí arrancó (con taskId real) más
    // lo que queda como placeholder idle, para que la sesión sea reanudable.
    const rescatados = mergeRescue(seed, lotes)
    await saveRescue(id, rescatados)
    return NextResponse.json({ error: 'No se pudo iniciar el render de todos los lotes.' }, { status: 500 })
  }
}
