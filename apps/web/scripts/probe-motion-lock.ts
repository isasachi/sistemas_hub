/**
 * ¿EL CANDADO DE MOVIMIENTO HACE QUE GROK EJECUTE MÁS COREOGRAFÍA QUE LA PROSA?
 *
 * Es LA pregunta del upgrade V2. El defecto reportado —y el motivo de todo el rediseño—
 * es que con la coreografía en prosa grok **colapsa varios estados en un gesto genérico**
 * y se queda quieto el resto del clip. La hipótesis del candado es que una lista de
 * tramos CON SU VENTANA DE TIEMPO no le deja ese margen.
 *
 * Manipulación mínima, y esto es lo que la hace válida: los dos brazos llevan EL MISMO
 * CONTENIDO y solo cambia la REPRESENTACIÓN.
 *   A (control) — la coreografía en prosa, `compileAccion(timeline)`: los mismos beats
 *                 proyectados a texto corrido con ' Luego, '.
 *   B           — `START STATE` / `TIMED MOTION` con la ventana de cada tramo / `END STATE`.
 *
 * ⚠️ A ES EL CONTROL CIENTÍFICO, NO LITERALMENTE LO QUE PRODUCCIÓN EMITE HOY: hoy
 * `accionVisual` viene del guión adaptado, que es prosa del forense y no de un timeline.
 * Se usa la proyección para que la única diferencia entre los brazos sea la forma.
 *
 * **DOS DRAWS POR BRAZO** (4 renders), la regla que este repo se impuso tras el probe del
 * cap de 30: grok es estocástico y un solo draw mide el seed, no el prompt.
 *
 * ⚠️ NO PUNTÚA, y eso es una corrección: la primera versión contaba cuántos tramos se
 * ejecutaban mostrándole al juez la lista pedida, y le dio 6 de 6 a un clip donde la
 * persona sostiene el frasco y habla. Hoy describe A CIEGAS y escribe una tira de cinco
 * fotogramas por clip; el veredicto lo pone quien mira. Ver `describir` abajo.
 *
 * ⚠️ Y LA COMPARACIÓN QUE VALE ES CONTRA EL VIDEO ORIGINAL, no contra la lista. El probe
 * imprime la ventana absoluta del fragmento (`ORIGINAL equivalente: 16.0s → 27.1s`) para
 * poder recortar ese mismo tramo con ffmpeg y ponerlo al lado.
 *
 * Cuesta: 2 llamadas de video a Gemini (forense + refinamiento, cacheadas en disco, las
 * paga el hub), 4 renders de KIE (key del usuario) y 4 descripciones. No escribe en la
 * base.
 *
 *   PROBE_DRY=1 npx tsx --env-file=.env.local scripts/probe-motion-lock.ts <sessionId> [nLote]
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import { z } from 'zod'
import { callVideoAds } from '../lib/video-ads/llm'
import { groupIntoLotes, buildLotePrompt, camaraDeLote } from '../lib/video-ads/lotes'
import { createVideoTask, getTaskDetail, clampDuration } from '../lib/video-ads/kie'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import {
  ForensicReportSchema, buildForensicInstruction,
  buildMotionRefinementInstruction, MotionRefinementSchema,
  corteMuestraPersona, type ForensicReport,
} from '../lib/video-ads/forensic'
import { normalizeMotionTimeline, compileAccion, tieneMotion, type MotionBeat, type MotionTimeline } from '../lib/video-ads/motion'
import { personajesDe } from '../lib/video-ads/personajes'

const SALIDA = process.env.PROBE_OUT ?? `${process.env.HOME}/Downloads/probe-motion-lock`
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const segundosDe = (tiempo: string) => {
  const m = String(tiempo).match(/(\d+):(\d+)/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

/**
 * ⚠️ EL JUEZ NO PUEDE VER LA LISTA ESPERADA, y esto se aprendió gastando renders.
 *
 * La primera versión le pasaba a Gemini el clip MÁS los tramos que se le habían pedido al
 * render y preguntaba cuáles se ejecutaban. Resultado medido: **6 de 6 a un clip donde la
 * persona sostiene el frasco a la altura del pecho y habla** — nunca se aplica nada. Con la
 * lista delante, "mano cerca de la cara" se convierte en "aplica producto en la mejilla".
 * El oráculo estaba confirmando su propio enunciado, y encima dos veces eligió distinto que
 * el ojo del dueño del repo.
 *
 * Ahora describe A CIEGAS —sin saber qué se pidió— y la comparación la hace quien lee. Es
 * el mismo criterio que este repo ya aplicó al probe del español y al de tipografía: **el
 * probe IMPRIME**, y cuando la métrica automática es frágil, imprimir es lo que vale.
 */
const DescripcionSchema = z.object({
  porSegundo: z.array(z.object({
    desdeSeg: z.number().catch(0),
    hasta: z.number().catch(0),
    queHace: z.string().catch(''),
  })),
  manosSobreElCuerpo: z.string().catch(''),
  resumen: z.string().catch(''),
})

async function describir(url: string) {
  return callVideoAds('descripcion_ciega', DescripcionSchema, [
    { fileData: { fileUri: url, mimeType: 'video/mp4' } },
    { text: [
      'Describe lo que hace el CUERPO en este clip, tramo por tramo. No sabes qué se le',
      'pidió al modelo y no hace falta: describe solo lo que ves.',
      '',
      '- `porSegundo`: un tramo por cada cambio visible, con el segundo en que empieza y',
      '  termina y qué hace el cuerpo (manos, cabeza, torso, el producto).',
      '- `manosSobreElCuerpo`: ¿alguna mano TOCA la cara, el cuello o la piel en algún',
      '  momento? Di cuándo y qué hace ahí (aplicar, masajear, tocar, señalar). Si ninguna',
      '  mano llega a la piel, dilo con esas palabras.',
      '- `resumen`: una frase con lo que pasa en el clip entero.',
    ].join('\n') },
  ])
}

/**
 * Agrupa los beats en EVENTOS y los escribe como ORACIONES.
 *
 * ⚠️ NACE DE UN CONTRAEJEMPLO: el dueño del repo generó desde el wizard de KIE un clip que
 * SÍ ejecuta la coreografía —suelta la gota en la mejilla, la masajea, y lleva el frasco al
 * pecho— con un prompt que pide **dos o tres eventos distintos escritos como oraciones**,
 * sin marcas de tiempo por acción. El nuestro pedía SEIS ventanas de 1,5 s en telegrama, y
 * cinco de las seis eran la misma acción rebanada (*"Massaging skin" · "Rubbing cheek" ·
 * "Massaging cheek area" · "Patting serum into skin"*). Un modelo que no puede distinguir
 * un tramo del siguiente hace un gesto genérico y se queda quieto.
 *
 * El corte en eventos usa `importance`, que ya existe para esto: **un evento nuevo empieza
 * en cada beat `major` o `supporting`, y los `micro` se absorben en el anterior** — el mismo
 * criterio con el que la escalera de degradación ya trata a los `micro` como textura.
 *
 * Las casillas del beat vienen en gerundio ("Rubbing cheek"), así que la oración se arma
 * con "is …ing" y sale bien sin conjugar nada.
 */
function compileEventos(beats: MotionBeat[]): string {
  const bajo = (x: unknown) => {
    const t = String(x ?? '').trim().replace(/\.+$/, '')
    return t ? t[0].toLowerCase() + t.slice(1) : ''
  }
  const grupos: MotionBeat[][] = []
  for (const b of beats) {
    if (!grupos.length || b.importance !== 'micro') grupos.push([b])
    else grupos[grupos.length - 1].push(b)
  }
  return grupos.map((g) => {
    const p = g[0]
    const u = g[g.length - 1]
    const manos = [p.leftHand && `her left hand is ${bajo(p.leftHand)}`,
                   p.rightHand && `her right hand is ${bajo(p.rightHand)}`]
      .filter(Boolean).join(' while ')
    // El evento tiene principio Y FIN, como en el prompt que sí funcionó ("touches the
    // drop, beginning to massage"). Sin el cierre, agrupar sería simplemente perder los
    // últimos beats del grupo.
    const cierra = u !== p && u.leftHand && u.leftHand !== p.leftHand
      ? `, and finishes with her left hand ${bajo(u.leftHand)}`
      : ''
    return `${manos}${cierra}.`
  }).join(' Then, ')
}

async function esperar(taskId: string, key: string, etiqueta: string): Promise<string | null> {
  const limite = Date.now() + 10 * 60_000
  while (Date.now() < limite) {
    const d = await getTaskDetail(taskId, key)
    if (d.state === 'success' && d.videoUrl) return d.videoUrl
    if (d.state === 'fail') { console.error(`  ${etiqueta}: FALLÓ — ${d.failMsg ?? '(sin motivo)'}`); return null }
    await new Promise((r) => setTimeout(r, 6000))
  }
  console.error(`  ${etiqueta}: se agotó el plazo`)
  return null
}

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Falta el sessionId')
  const nLote = process.argv[3] ? Number(process.argv[3]) : null

  // Acepta el prefijo de 8 caracteres, que es como se citan las sesiones en AGENTS.md.
  const { data: ids } = await db.from('video_sessions').select('id')
  const completo = (ids as { id: string }[] | null)?.find((f) => f.id.startsWith(id))?.id
  const { data } = completo
    ? await db.from('video_sessions').select('*').eq('id', completo).single()
    : { data: null }
  if (!data) throw new Error(`No existe la sesión ${id}`)
  const r = data as Record<string, unknown> & { forensic_analysis: ForensicReport }
  const { data: st } = await db.from('user_settings').select('kie_api_key').eq('user_id', r.user_id as string).single()
  const key = (st as { kie_api_key?: string } | null)?.kie_api_key
  if (!key) throw new Error('El usuario no tiene key de KIE guardada')

  const adapted = AdaptedScriptSchema.parse(r.adapted)
  const video = r.reference_video_url as string

  // ── El timeline no existe en ninguna sesión guardada: se produce acá, con las MISMAS
  // dos llamadas que la ruta (forense general + refinamiento dedicado).
  // El forense se CACHEA en disco: son dos llamadas de video y este probe se re-corre
  // varias veces afinando el brazo. `PROBE_FRESH=1` lo vuelve a pedir.
  await mkdir(SALIDA, { recursive: true })
  const cache = `${SALIDA}/forense-${id.slice(0, 8)}.json`
  const guardado = process.env.PROBE_FRESH ? null : await readFile(cache, 'utf8').catch(() => null)
  const fresco: ForensicReport = guardado ? JSON.parse(guardado) : await (async () => {
  console.log('forense…')
  const base = await callVideoAds('forensic_report', ForensicReportSchema, [
    { fileData: { fileUri: video, mimeType: 'video/mp4' } },
    { text: buildForensicInstruction() },
  ])
  console.log('refinamiento…')
  const ref = await callVideoAds('motion_refinement', MotionRefinementSchema, [
    { fileData: { fileUri: video, mimeType: 'video/mp4' } },
    { text: buildMotionRefinementInstruction(base.cortes) },
  ])
  for (const m of ref.cortes ?? []) {
    const c = base.cortes[(m.n ?? 0) - 1]
    if (c && (m.motion?.beats?.length ?? 0) > (c.motion?.beats?.length ?? 0)) c.motion = m.motion
  }
  for (const c of base.cortes) {
    if (tieneMotion(c)) c.motion = normalizeMotionTimeline(c.motion!, c.duracionSeg)
  }
  await writeFile(cache, JSON.stringify(base))
  return base
  })()

  // Se normaliza SIEMPRE, también viniendo del caché: `normalizeMotionTimeline` es
  // idempotente y es donde vive el colapso de la quietud repetida — sin esto el caché
  // congela el timeline con las reglas del día en que se guardó.
  for (const c of fresco.cortes) {
    if (tieneMotion(c)) c.motion = normalizeMotionTimeline(c.motion!, c.duracionSeg)
  }

  console.log('\n── LO QUE EL REFINAMIENTO DEVOLVIÓ, corte por corte')
  for (const c of fresco.cortes) {
    console.log(`  ${c.tiempo} · ${c.duracionSeg}s · ${c.motion?.beats?.length ?? 0} beats`)
    for (const b of c.motion?.beats ?? []) {
      console.log(`      [${b.startSec.toFixed(1)}–${b.endSec.toFixed(1)}] ${b.importance.padEnd(10)} ${b.body} | L:${b.leftHand} | R:${b.rightHand}`)
    }
  }

  // ⚠️ EL LOTE SE CONSTRUYE DESDE EL FORENSE FRESCO, NO DESDE `adapted`.
  // Primero se intentó emparejar los cortes nuevos con `adapted.tomas[].tiempoOriginal` y
  // el resultado fue el no-op silencioso de siempre en su forma suave: el forense fresco
  // corta el video distinto (5 cortes donde el guardado tenía 4), así que la toma de 14,3 s
  // recibía por cercanía el timeline de un corte de 3,4 s — dos beats triviales para un
  // clip cuatro veces más largo. Se habrían gastado cuatro renders midiendo eso.
  //
  // El timeline manda: se elige el corte con MÁS beats y el clip se arma a su medida. La
  // locución sale de la toma adaptada que arranca más cerca, para que el prompt siga
  // teniendo habla — un clip mudo le deja a grok margen que el caso real no tiene.
  // ⚠️ EL BED POR DEFECTO ES UN SOLO SHOT CON VARIOS TRAMOS. La primera corrida se gastó
  // cuatro renders sobre un lote de dos shots con UN beat cada uno: ahí las tres
  // prohibiciones no tienen referente —nada que comprimir, nada que adelantar, ningún orden
  // que imponer— y los estados tampoco se emiten (un fragmento no los trae), o sea el brazo
  // B se reducía a formato. De ahí `duracionSeg <= LOTE_MAX_SEC` (así `splitLongToma` no
  // dispara) y >= 2 beats, desempatando por duración: el colapso solo se ve cuando sobra
  // tiempo después. `nLote` elige otro de la lista ordenada.
  const corte = fresco.cortes
    // `PROBE_SIN_LIMITE=1` deja entrar los cortes que se PARTEN. Se pierden los estados
    // (un fragmento no los trae) pero se gana el corte con coreografía de verdad, que en
    // un anuncio de aplicación es el largo. Cuál de las dos cosas importa más depende de
    // qué se esté midiendo, así que es un interruptor y no un default nuevo.
    .filter((c) => tieneMotion(c) && c.motion!.beats.length >= 2 && (process.env.PROBE_SIN_LIMITE ? true : c.duracionSeg <= 15))
    .sort((a, b) => (b.motion!.beats.length - a.motion!.beats.length) || (b.duracionSeg - a.duracionSeg))[nLote ? nLote - 1 : 0]
  if (!corte) throw new Error('El forense no devolvió ningún corte con timeline')
  const cerca = adapted.tomas
    .slice()
    .sort((a, b) => Math.abs(segundosDe(a.tiempoOriginal) - segundosDe(corte.tiempo))
                  - Math.abs(segundosDe(b.tiempoOriginal) - segundosDe(corte.tiempo)))[0]
  const toma = {
    n: 1,
    // ⚠️ LA DURACIÓN REAL DEL CORTE, sin recortar. Recortarla a mano a `LOTE_MAX_SEC`
    // dejaba beats con ventana [13.2–19.5s] dentro de un clip de 15 s: dos relojes en el
    // mismo prompt, que es justo el defecto que el candado existe para no cometer. Con la
    // duración real, `splitLongToma` parte la toma y `repartirBeats` rebasa los tiempos —
    // el camino de producción.
    duracionSeg: corte.duracionSeg,
    locucion: cerca?.locucion ?? '',
    tiempoOriginal: corte.tiempo,
    accionVisual: compileAccion(corte.motion!),
    personaje: cerca?.personaje ?? '',
    producto: cerca?.producto ?? '',
  }
  const plano = new Map([[corte.tiempo, String(corte.camara).trim()]])
  const clase = new Map([[corte.tiempo, corteMuestraPersona(corte)]])
  const conCandado = groupIntoLotes([toma], plano, 1, clase, new Map([[corte.tiempo, corte.motion!]]))
  // Si la toma se partió, se mide el fragmento con MÁS tramos: uno con un solo beat no
  // tiene nada que colapsar, que es justo lo que este probe viene a ver.
  const lote = conCandado.slice().sort((a, b) =>
    b.tomas.reduce((n, t) => n + (t.beats?.length ?? 0), 0) - a.tomas.reduce((n, t) => n + (t.beats?.length ?? 0), 0))[0]
  if (!lote) throw new Error('No hay lote')
  if (conCandado.length > 1) {
    // La ventana ABSOLUTA del fragmento dentro del video original, para poder recortar el
    // mismo tramo y ponerlo al lado. Sin esto la comparación con el original es a ojo.
    const antes = conCandado.filter((l) => l.n < lote.n).reduce((n, l) => n + l.duracionSeg, 0)
    const desde = segundosDe(corte.tiempo) + antes
    console.log(`  (la toma se partió en ${conCandado.length} clips; se mide el ${lote.n}º)`)
    console.log(`  ORIGINAL equivalente: ${desde.toFixed(1)}s → ${(desde + lote.duracionSeg).toFixed(1)}s`)
  }
  console.log(`  corte elegido ${corte.tiempo} · ${corte.duracionSeg}s · ${corte.motion!.beats.length} beats` +
    ` · locución de la toma ${cerca?.tiempoOriginal ?? '(ninguna)'}`)

  // El control: los MISMOS beats, proyectados a prosa. Sin `motion` no hay candado.
  const control = {
    ...lote,
    tomas: lote.tomas.map((t) => ({
      ...t, beats: undefined, startState: undefined, endState: undefined,
      accionVisual: t.beats?.length ? compileAccion({ beats: t.beats } as MotionTimeline) : t.accionVisual,
    })),
  }

  const chars = lote.tomas.reduce((n, t) => n + t.locucion.length, 0)
  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const comun = {
    consistencyBlock: (r.consistency_block as string) ?? '',
    productDesc: scan.productDescription ?? '',
    camara: camaraDeLote(lote, fresco.cortes, 'primer plano'),
    voz: r.voice_profile as never, movimiento: r.motion_profile as never,
    images: [
      { url: r.avatar_url as string, role: 'the person' },
      { url: r.product_url as string, role: 'the product' },
    ],
    cortes: fresco.cortes, niche: r.niche, personajes: personajesDe(r as never),
  }
  const promptA = buildLotePrompt({ lote: control, ...comun })
  const promptB = buildLotePrompt({ lote, ...comun })
  // ── BRAZO C: los MISMOS beats agrupados en eventos y en prosa, sin ventanas. Va por el
  // camino de `accionVisual` (sin beats no hay candado), o sea el mismo slot del prompt que
  // usa producción hoy — lo único que cambia es qué se escribe ahí.
  const eventos = {
    ...lote,
    tomas: lote.tomas.map((t) => ({
      ...t, beats: undefined, startState: undefined, endState: undefined,
      accionVisual: t.beats?.length ? compileEventos(t.beats) : t.accionVisual,
    })),
  }
  const promptC = buildLotePrompt({ lote: eventos, ...comun })

  // Con el MISMO corrimiento que usa el prompt: el juez tiene que leer el mismo reloj que
  // el modelo, o estaría midiendo la sincronía contra ventanas que nadie pidió.
  const beats = lote.tomas.flatMap((t, i) => {
    const desde = lote.tomas.slice(0, i).reduce((n, x) => n + x.duracionSeg, 0)
    return (t.beats ?? []).map((b) => ({ ...b, startSec: b.startSec + desde, endSec: b.endSec + desde }))
  })
  console.log(`\nsesión ${id.slice(0, 8)} · lote ${lote.n} de ${conCandado.length} · ` +
    `${lote.duracionSeg}s · ${lote.tomas.length} toma(s) · ${beats.length} beats`)
  console.log(`  A (prosa telegrama, ya medido y perdido): ${promptA.length} caracteres`)
  console.log(`  B (candado):  ${promptB.length} caracteres`)
  console.log(`  C (eventos):  ${promptC.length} caracteres`)
  console.log(`\n  C dice: ${eventos.tomas.map((t) => t.accionVisual).join(' / ')}`)

  // Los tres guards que impiden gastar 4 renders midiendo nada.
  if (!promptB.includes('TIMED MOTION')) throw new Error('El brazo B no lleva candado: los beats no llegaron al prompt')
  if (promptA === promptB) throw new Error('Los dos brazos son idénticos')
  for (const [et, p] of [['A', promptA], ['B', promptB]] as const) {
    if (p.includes('…')) throw new Error(`El brazo ${et} sale TRUNCADO: se estaría midiendo presupuesto y no representación`)
  }
  // (d) EL SHOT MEDIDO TIENE QUE LLEVAR VARIOS TRAMOS. Es el guard que habría frenado la
  // primera corrida: con un beat por shot, las tres prohibiciones no tienen referente y el
  // brazo B se reduce a formato.
  for (const t of lote.tomas) {
    if ((t.beats?.length ?? 0) >= 2) break
    if (t === lote.tomas.at(-1)) throw new Error('Ningún shot del lote lleva 2 o más tramos: no habría nada que colapsar')
  }

  // Ninguna ventana puede salirse del clip: un tramo que empieza después de que el video
  // terminó es una instrucción imposible, y el modelo resuelve eso ignorando el bloque.
  for (const b of beats) {
    if (b.endSec > lote.duracionSeg + 0.05) {
      throw new Error(`Un beat termina en ${b.endSec}s dentro de un clip de ${lote.duracionSeg}s`)
    }
  }

  await mkdir(SALIDA, { recursive: true })
  await writeFile(`${SALIDA}/prompt-A.txt`, promptA)
  await writeFile(`${SALIDA}/prompt-B.txt`, promptB)
  console.log('\n── COREOGRAFÍA PEDIDA')
  beats.forEach((b, i) => console.log(`  ${i + 1}. [${b.startSec.toFixed(1)}–${b.endSec.toFixed(1)}s] ${b.body} | L:${b.leftHand} | R:${b.rightHand}`))

  if (process.env.PROBE_DRY) { console.log(`\nPROBE_DRY: prompts en ${SALIDA}, no se creó ninguna tarea.`); return }

  const dur = clampDuration(lote.duracionSeg, chars, lote.tomas.length)
  // B contra C: la prosa telegrama (A) ya se midió dos veces y no gana, así que gasta
  // renders sin responder nada nuevo. Se conserva armado para poder volver a pedirla.
  const brazos = [['B1', promptB], ['B2', promptB], ['C1', promptC], ['C2', promptC]] as const
  const tareas = await Promise.all(brazos.map(async ([et, prompt]) => {
    const taskId = await createVideoTask(
      { images: comun.images, prompt, durationSec: dur, locucionChars: chars, tomas: lote.tomas.length }, key)
    console.log(`  ${et}: tarea ${taskId}`)
    return [et, taskId] as const
  }))

  console.log('\n── DESCRIPCIÓN A CIEGAS (el juez no ve la lista pedida)')
  for (const [et, taskId] of tareas) {
    const url = await esperar(taskId, key, et)
    if (!url) continue
    const mp4 = `${SALIDA}/${et}.mp4`
    await writeFile(mp4, Buffer.from(await (await fetch(url)).arrayBuffer()))
    // La tira de fotogramas es determinista y gratis: es lo único de este probe que no
    // depende de que un modelo mire bien.
    await tira(mp4, `${SALIDA}/${et}-tira.jpg`, lote.duracionSeg)
    const d = await describir(url)
    console.log(`\n${et}`)
    for (const t of d.porSegundo) console.log(`  [${t.desdeSeg}–${t.hasta}s] ${t.queHace}`)
    console.log(`  manos sobre la piel: ${d.manosSobreElCuerpo}`)
    console.log(`  resumen: ${d.resumen}`)
    console.log(`  tira: ${SALIDA}/${et}-tira.jpg`)
  }
}

/** Cinco fotogramas repartidos, en una sola imagen. Sin esto la revisión humana es abrir
 *  cuatro videos y acordarse. */
async function tira(mp4: string, salida: string, dur: number): Promise<void> {
  const ts = [0.05, 0.28, 0.5, 0.72, 0.95].map((f) => (dur * f).toFixed(2))
  const args = ts.flatMap((t) => ['-ss', t, '-i', mp4, '-frames:v', '1'])
  await new Promise<void>((ok) => {
    const p = spawn(ffmpeg as unknown as string,
      ['-y', '-v', 'error', ...args, '-filter_complex', `hstack=inputs=${ts.length},scale=1500:-1`, salida],
      { stdio: 'ignore' })
    p.on('exit', () => ok())
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
