import { NextRequest, NextResponse } from 'next/server'
import { getVideoSession, updateVideoSession, claimFreshLotes } from '@/lib/video-ads/db'
import { createVideoTask, KIE_PROMPT_MAX, SIN_KEY } from '@/lib/video-ads/kie'
import { currentKieKey } from '@/lib/user-settings'
import type { Lote } from '@/lib/video-ads/lotes'
import { totalDuration, resumeSeed, mergeRescue, isPaidResume, renderDone, insumosDeRender, promptDeLote } from '@/lib/video-ads/render-lotes'
import { AdaptedScriptSchema, type AdaptedScript } from '@/lib/video-ads/adapt'
import { extractPending } from '@/lib/video-ads/pending'
import { checkGenQuota, checkGlobalBackstop, recordGenQuota } from '@/lib/gen-quota'
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
    // `render_done` (fix round 5) se recalcula con la MISMA fórmula que `lote-status`
    // usa para su propio `done` — acá casi siempre da `false` (los lotes recién
    // creados quedan `waiting`, no `success`/`fail`), pero escribirlo explícito evita
    // que una sesión que se está re-renderizando (`generate-lotes` volvió a tocar
    // `lotes` tras un `render_done: true` de una vuelta anterior) se quede mostrando
    // "listo" en el dashboard mientras el nuevo intento sigue en curso.
    // `Math.round`: la columna `duration` es `int` en Postgres y las duraciones dejaron
    // de ser enteras cuando `repairCutTiming` empezó a repartir décimas entre los cortes
    // (un guión real sumó 46.8). Sin redondear, Postgres rechaza la fila entera con
    // "invalid input syntax for type integer" y el render no arranca. Redondear y no
    // migrar la columna a numeric es deliberado: nadie lee este campo, es un resumen
    // para el dashboard, y la décima de segundo no significa nada ahí.
    await updateVideoSession(id, { step: STEP.LOTES, lotes, duration: Math.round(totalDuration(lotes)), render_done: renderDone(lotes) })
  } catch (err) {
    console.error(
      // Con el id de sesión: un mp4 recuperado a mano desde KIE hay que devolvérselo a
      // ALGUIEN, y sin el id eso depende de encontrar el request que lo generó.
      `[video-ads/generate-lotes] sesión ${id}: no se pudo guardar el rescate; taskId ya pagados:`,
      lotes.filter((l) => l.taskId).map((l) => l.taskId),
      err,
    )
  }
}

// Un render por lote sigue siendo una llamada pagada, pero la CUOTA (fix round 2) se
// mide por VIDEO, no por lote: 1 generación + 2 regens sin importar cuántos lotes
// tenga el guión. Un guión de 2 lotes no se queda sin regeneraciones y uno de 4 no
// se topa antes de arrancar — el tope real es "¿cuántas veces intentaste generar ESTE
// video?", no "¿cuántas llamadas a KIE hiciste?". Se sigue registrando una fila por
// lote (kind 'video-render', ver gen-quota.ts) para conservar la visibilidad del
// costo real y el backstop global diario, pero esa fila ya no topa nada por sí sola.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await readUserId()

  const session = await getVideoSession(id, userId)
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
  // Se mira el TEXTO, no solo la lista del modelo: en una corrida real devolvió la
  // lista vacía habiendo dejado marcadores. Un marcador que llega al render se lee en
  // voz alta dentro de un lote ya pagado.
  const marcadores = extractPending(adapted.guionFinal)
  if (marcadores.length || adapted.variablesPendientes.length)
    return NextResponse.json(
      { error: `El guión tiene variables sin completar: ${[...new Set([...marcadores, ...adapted.variablesPendientes])].join(', ')}` },
      { status: 409 },
    )

  // Imágenes, producto físico, cortes, reparto, cámara por lote y huella, resueltos UNA
  // vez y compartidos con `rerender-lote` (`insumosDeRender`): son parte del prompt de
  // CADA lote y de la huella, y calcularlos en dos sitios es la forma más fácil de que
  // la huella deje de describir lo que se renderizó.
  const insumos = insumosDeRender(session, adapted, session.voice_profile)
  const { agrupados, camaras, huella } = insumos
  if (!agrupados.length) return NextResponse.json({ error: 'El guión no tiene tomas' }, { status: 409 })

  const base: Lote[] = agrupados.map((l) => ({ ...l, scriptHash: huella }))

  // Reanudar es explícito (`{ resume: true }` en el body), no automático — si no, un
  // doble submit (doble clic, StrictMode) o un reintento tras un fallo parcial pasan
  // AMBOS por acá, recalculan `base` desde cero y crean tareas NUEVAS para lotes que
  // ya tienen `taskId`: el taskId viejo, ya pagado, queda huérfano sin forma de verlo.
  // La UI (Section6Lotes) manda `resume: true` tanto para "reintentar" un render que
  // quedó a medias como para "generar otra versión" después de volver al paso
  // anterior y re-adaptar el guión — en los dos casos la sesión YA tiene `lotes`
  // guardados. Solo el primer render de una sesión nueva (`lotes` en null) va sin el
  // flag. Esta rama no decide sola si eso cuenta como reanudación real o como
  // generación nueva que cobra: `resume` es la INTENCIÓN del cliente, `isPaidResume`
  // más abajo compara la huella del contenido para decidir el HECHO. Body vacío o
  // no-JSON se trata como "no es un reintento explícito", no como error.
  let resume = false
  try {
    const body: unknown = await req.json()
    resume = !!body && typeof body === 'object' && (body as { resume?: unknown }).resume === true
  } catch {
    /* sin body o no-JSON */
  }

  // Sin `resume`, con tareas ya creadas, es 409: un POST repetido no puede duplicar
  // lotes pagados. Con `resume` sobre el mismo contenido entra por `isPaidResume` sin
  // cobrar; con contenido nuevo (guión, personaje o voz rehechos) se registra otra
  // `video-generation` — que desde 2026-09-07 NO tiene tope (ver gen-quota.ts): el
  // render lo paga el usuario con su key, y el único freno es el backstop global.
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

  // `resume` es la INTENCIÓN del cliente; `reanuda` es el HECHO — solo es una
  // reanudación real si de verdad hay algo pagado Y lo guardado lleva la huella del
  // contenido que se va a renderizar ahora (fix rounds 2, 3 y 4; el porqué completo,
  // incluido qué entra en la huella, está en `isPaidResume`/`scriptFingerprint`,
  // render-lotes.ts).
  const reanuda = isPaidResume(resume, existentes, base, huella)

  // `wasVirgin`: la fila nunca fue tocada por esta ruta (`lotes` sigue en `null` en
  // la DB, no `[]` ni un array de placeholders de un intento fallido). Es la única
  // situación en la que el claim atómico de abajo puede aplicar sin rechazar de
  // rebote un reintento legítimo (ver `claimFreshLotes` en db.ts).
  const wasVirgin = session.lotes == null

  const seed: Lote[] = reanuda ? resumeSeed(base, existentes) : base
  const pendientes = seed.filter((l) => !l.taskId)
  // Nada por crear: o reanuda una sesión ya completa, o es un doble submit sobre una
  // que terminó justo antes — de cualquier modo, no hay nada pagado de más que hacer.
  if (!pendientes.length) return NextResponse.json({ lotes: seed })

  // BYOK: la key se resuelve ANTES de tocar la cuota. Al revés, `checkGenQuota` ya
  // habría escrito su fila y la primera llamada a KIE moriría con un 401: el usuario
  // perdería una generación de su tope por no haber cargado la key.
  const kieKey = await currentKieKey()
  if (!kieKey) return NextResponse.json({ error: SIN_KEY }, { status: 400 })

  // El backstop global diario aplica SIEMPRE que se vaya a llamar a KIE — reanudar
  // también gasta (crea tarea para los lotes que quedaron pendientes). `checkGenQuota`
  // con `video-generation` ya no tiene gate per-step (fuera de IMAGE_KINDS): es el
  // mismo backstop más los créditos, que el video no gasta.
  if (reanuda) {
    const { blocked } = await checkGlobalBackstop()
    if (blocked) return blocked
  } else {
    // Fix round 5: antes se descartaba el `Response` real de `checkGenQuota` y se
    // devolvía SIEMPRE el mismo mensaje ("empieza otra sesión"), sin importar cuál de
    // las dos capas bloqueó. `checkGenQuota` bloquea por dos motivos distintos —el
    // tope per-sesión (`regensLeft: 0`) o el backstop GLOBAL de todo el hub
    // (`regensLeft: null`, 500/día, ver gen-quota.ts)— y son dos avisos que no se
    // pueden intercambiar: a alguien que chocó con el backstop global, decirle "abre
    // otra sesión" es un consejo que no puede funcionar (la sesión nueva gasta MÁS
    // contra el mismo backstop compartido). El propio `blocked` ya trae el mensaje
    // correcto para cada caso — se devuelve tal cual, igual que la rama de
    // reanudación tres líneas arriba (`checkGlobalBackstop`), en vez de reinventarlo.
    const { blocked } = await checkGenQuota(id, 'video-generation')
    if (blocked) return blocked
  }

  // Había taskId pagados pero esta llamada NO es una reanudación (huella distinta, o
  // distinta cantidad de lotes): `reanuda` da `false` a propósito —el render viejo ya
  // no corresponde a este contenido— y esos taskId no viajan a `seed`, se abandonan.
  // Abandonarlos es correcto; abandonarlos EN SILENCIO es la misma clase de fallo que
  // el rescate del round 1 existe para evitar, así que quedan logueados con el id de
  // sesión (el mp4 se puede rescatar a mano desde KIE y hay que saber de quién es).
  //
  // El log va DEBAJO del gate de cuota, no arriba (fix round 4): arriba se disparaba
  // igual cuando el gate cortaba con 429 y no se escribía nada — un falso positivo que
  // manda a perseguir una pérdida que nunca ocurrió. Acá abajo ya está decidido que
  // esta llamada sigue y va a pisar lo guardado. No hace falta bajarlo aún más (debajo
  // del claim): `existentes.some(taskId)` implica `session.lotes != null`, o sea
  // `wasVirgin === false`, así que este caso nunca llega a intentar el claim.
  if (!reanuda && existentes.some((l) => l.taskId)) {
    // El motivo exacto importa para diagnosticar: "otra cantidad de lotes" y "misma
    // cantidad, otro contenido" se ven idénticos en la fila y se investigan distinto.
    const motivo = existentes.length !== base.length
      ? `otra cantidad de lotes (${existentes.length} → ${base.length})`
      : 'misma cantidad de lotes pero otro contenido (huella distinta)'
    console.error(
      `[video-ads/generate-lotes] sesión ${id}: el guión cambió — ${motivo}; se abandonan taskId ya pagados:`,
      existentes.filter((l) => l.taskId).map((l) => l.taskId),
    )
  }

  // Claim atómico (fix round 2): SOLO para el primer intento real sobre una sesión
  // nunca tocada. Cierra el race de un doble POST concurrente reclamando la fila
  // ANTES de gastar en KIE — si dos requests llegan casi juntos, solo uno gana la
  // escritura condicional y el otro corta acá, sin haber creado ninguna tarea
  // pagada. Ver el comentario largo en `claimFreshLotes` (db.ts) para el porqué del
  // alcance angosto (no cubre reintentos sobre una sesión ya tocada, aunque haya
  // fallado por completo la primera vez).
  if (!reanuda && wasVirgin) {
    // Mismo `Math.round` que en `saveRescue`, por el mismo motivo (columna `int`). Acá
    // se notó primero: el claim corre ANTES de crear ninguna tarea, así que el fallo
    // salía como 500 sin haber gastado nada.
    const claimed = await claimFreshLotes(id, { step: STEP.LOTES, lotes: seed, duration: Math.round(totalDuration(seed)), render_done: renderDone(seed) })
    if (!claimed) {
      return NextResponse.json(
        { error: 'Esta sesión ya tiene un render en curso o parcialmente completado. Reanúdalo en vez de reiniciar.' },
        { status: 409 },
      )
    }
  }

  const lotes: Lote[] = []
  // Distinto de un fallo de red/KIE (500): un prompt que no entra ni al piso es un
  // problema del guión, no del servicio — se reporta 400 con el mensaje de
  // `buildLotePrompt` (ya en español, ya dice qué acortar) en vez del 500 genérico.
  let promptError: string | null = null
  let apiError: unknown = null
  // Cuántas tareas se crearon REALMENTE en esta llamada (no las reanudadas, que ya
  // estaban pagadas de antes) — es lo único que decide si esta llamada cobra una
  // `video-generation` nueva.
  let creados = 0

  try {
    for (const [i, lote] of seed.entries()) {
      if (lote.taskId) { lotes.push(lote); continue } // reanudado: ya pagado, no se recrea

      // Prompt y duración por una sola fuente (`promptDeLote`), la misma que usa
      // `rerender-lote`: un lote re-renderizado suelto sale byte a byte igual.
      let prompt: string
      let durationSec: number
      try {
        ({ prompt, durationSec } = promptDeLote(lote, camaras[i], insumos))
      } catch (err) {
        // `buildLotePrompt` lanza cuando el prompt no entra en KIE_PROMPT_MAX. Ese
        // mensaje ya es claro y está en español — se propaga tal cual en vez de
        // perderlo detrás del 500 genérico del catch de afuera.
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

      const taskId = await createVideoTask({ images: insumos.images, prompt, durationSec }, kieKey)
      creados++
      lotes.push({ ...lote, duracionSeg: durationSec, prompt, taskId, status: 'waiting', videoUrl: null, failMsg: null })
      // Fila por lote: visibilidad del costo real y backstop global diario. Ya NO topa
      // per-step (kind fuera de IMAGE_KINDS) — el tope vive en 'video-generation'.
      await recordGenQuota(id, 'video-render', userId)
    }
  } catch (err) {
    apiError = err
  }

  // Una sola fila de `video-generation` por llamada que efectivamente gastó dinero,
  // sin importar cuántos lotes creó ni si terminó en error — reanudar (`reanuda`)
  // nunca cobra de nuevo, y un intento que no llegó a crear ninguna tarea (falló
  // armando el prompt del primer lote) tampoco cobra: no se gastó nada.
  if (!reanuda && creados > 0) {
    await recordGenQuota(id, 'video-generation', userId)
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

  if (apiError) {
    console.error('[video-ads/generate-lotes]', apiError)
    // Mismo rescate que en la rama de arriba: lo que sí arrancó (con taskId real) más
    // lo que queda como placeholder idle, para que la sesión sea reanudable.
    const rescatados = mergeRescue(seed, lotes)
    await saveRescue(id, rescatados)
    return NextResponse.json({ error: 'No se pudo iniciar el render de todos los lotes.' }, { status: 500 })
  }

  // `saveRescue`, no `updateVideoSession` directo (fix round 3): el camino feliz
  // también puede fallar al escribir, y sin el try/catch de `saveRescue` ese throw
  // escapaba el handler (500 opaco de Next, sin log) dejando la fila con los
  // placeholders `idle` del claim — las tareas recién creadas en KIE quedaban
  // pagadas y huérfanas, sin que `lote-status` supiera que existen. El patch es
  // idéntico al que escribía acá (`step`, `lotes`, `duration`, `render_done`), así
  // que el camino feliz no cambia; sólo se suma el log si la escritura falla.
  await saveRescue(id, lotes)
  return NextResponse.json({ lotes })
}
