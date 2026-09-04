/**
 * EL ANUNCIO COMPLETO, CON TODO LO MEDIDO HASTA EL 2026-09-04.
 *
 * `probe-video-motores.ts` renderiza UN tramo con los cuatro motores para compararlos; ese
 * experimento está cerrado (la primitive es `bytedance/seedance-2` @480p). Esto es lo que
 * sigue: renderizar el anuncio ENTERO con esa primitive, varias veces por corte, y medir lo
 * que se puede medir.
 *
 *   PROBE_RUN=1 npx tsx --env-file=.env.local scripts/probe-anuncio.ts <sessionId>
 *
 *   PROBE_DRAWS=3        cuántos renders por corte (default 2)
 *   PROBE_PROMPT=v2      el prompt con @Image1/@Video1 (default: el v1 medido)
 *   PROBE_OUT=/ruta      dónde escribir (default ~/Downloads/anuncio-<sessionId>)
 *   PROBE_SOLO=2,5       renderizar solo esos cortes (para reintentar uno suelto)
 *   PROBE_POLL_MIN=45    espera por render
 *
 * ⚠️ ESTO CUESTA DINERO DEL USUARIO: seedance cobra `precio × (input + output)` cuando hay
 * video de referencia, o sea cada clip se factura como el DOBLE de su duración. Medido exacto
 * en 6 tareas: 11,5 créditos por segundo facturado. El script imprime el presupuesto ANTES de
 * disparar nada y exige `PROBE_RUN=1`.
 *
 * ══ POR QUÉ VARIOS DRAWS POR CORTE, que es el cambio de fondo ══
 * Medido con 5 renders del MISMO corte y el MISMO contenido (A/B del 2026-09-04): sale
 * perfecto en los tres ejes —motion fiel a la fuente, locución exacta, identidad del avatar—
 * 1 de cada 5. Y el prompt NO separa: el mismo prompt produjo el mejor draw y el peor (uno con
 * la cara y el fondo de la creadora del video de referencia). O sea la calidad no se compra
 * escribiendo mejor el prompt, se compra tirando draws y eligiendo. Eso es lo que esto hace.
 *
 * ══ QUÉ SE MIDE SOLO Y QUÉ NO ══
 * La LOCUCIÓN es mecánica y se puntúa: se transcribe cada draw y se compara con lo pedido
 * (cobertura de lo esperado + precisión sobre lo dicho — la segunda existe porque la primera
 * daba 100% a un clip que tartamudeaba). El MOTION y la IDENTIDAD los juzga una persona sobre
 * la tira de contacto: un juez de visión al que se le muestra la respuesta esperada confirma
 * en vez de medir, y este repo ya pagó esa lección con el probe de motion-lock.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import { uploadToStorage } from '../lib/storage'
import {
  accionesDelTramo, createClip, createStrip, download, kieKey, promptSeedance, runSeedance,
  type VideoSessionRow,
} from './probe-video-motores'
import { cobertura, transcribir } from './probe-audio-espanol'

/** Tope duro de `bytedance/seedance-2`: `duration` acepta 4–15 s o -1, y el video de
 *  referencia tampoco puede pasar de 15 s. `MAX_CLIP_SEC_D = 30` del otro probe describe a
 *  `seedance-2-5`. Un tramo más largo devuelve `422 Invalid duration` — gratis, porque la
 *  validación corre antes de despachar, pero rompe la corrida. */
const MAX_SEC = 15
const MIN_SEC = 4
/**
 * ⚠️ LA PRIMITIVE SE FIJA ACÁ, Y NO SE HEREDA DE `runSeedance` — omitirlo costó dinero real.
 *
 * `runSeedance` (probe-video-motores.ts) tiene por default `seedance-2-5` @720p, que es lo que
 * necesitaba el EXPERIMENTO de motores. La primitive elegida el 2026-09-04 es otra:
 * `bytedance/seedance-2` @480p. La primera corrida de este script no los pasó y salió con los
 * defaults: el corte 1 cobró 266 créditos en vez de 80,5 —3,3×, el ratio exacto que separa a
 * las dos configuraciones— y el saldo se agotó a la cuarta tarea.
 */
process.env.PROBE_SEEDANCE_MODEL ??= 'bytedance/seedance-2'
process.env.PROBE_RESOLUTION ??= '480p'

/**
 * Créditos por segundo FACTURADO (salida + referencia; con video de referencia el clip se
 * cobra como el doble de su duración).
 *   · `seedance-2` @480p ...... 11,5 — verificado exacto en 6 tareas
 *   · `seedance-2-5` @720p .... 38,0 — medido en una tarea (266 / 7 s)
 * Cualquier otra combinación no está medida y el presupuesto sale marcado como estimado.
 */
const TARIFA: Record<string, number> = { 'bytedance/seedance-2|480p': 11.5, 'bytedance/seedance-2-5|720p': 38 }
const MODELO = process.env.PROBE_SEEDANCE_MODEL
const RESOLUCION = process.env.PROBE_RESOLUTION
const CREDITOS_POR_SEG = TARIFA[`${MODELO}|${RESOLUCION}`] ?? 11.5
const TARIFA_MEDIDA = `${MODELO}|${RESOLUCION}` in TARIFA
const USD_POR_CREDITO = 0.005

interface Tramo { n: string; start: number; end: number; locucion: string }
interface Draw {
  tramo: string; draw: number; taskId?: string; file?: string; frames?: string
  dicho?: string; cobertura?: number; precision?: number; error?: string
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((ok, no) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => { err += String(d) })
    p.on('close', (c) => (c === 0 ? ok() : no(new Error(`${bin} salió ${c}: ${err.slice(-400)}`))))
  })
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const seg = (t: string): [number, number] | null => {
  const m = /(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)/.exec(t)
  return m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : null
}

/**
 * Parte un tramo que no entra en el cap, por FRASE y nunca a mitad de una — mismo criterio
 * que `splitLongToma` en producción. No se importa aquélla porque es privada de `lotes.ts` y
 * exportarla sería tocar producción para un probe.
 */
function partir(n: number, start: number, end: number, locucion: string): Tramo[] {
  const dur = end - start
  if (dur <= MAX_SEC) return [{ n: String(n), start, end, locucion }]
  const partes = Math.ceil(dur / MAX_SEC)
  const frases = locucion.match(/[^.!?]+[.!?]*/g)?.map((f) => f.trim()).filter(Boolean) ?? [locucion]
  // Reparto por longitud de texto: cada fragmento se lleva las frases que le tocan por peso.
  const objetivo = locucion.length / partes
  const grupos: string[][] = Array.from({ length: partes }, () => [])
  let i = 0, acc = 0
  for (const f of frases) {
    if (acc >= objetivo && i < partes - 1) { i++; acc = 0 }
    grupos[i].push(f); acc += f.length
  }
  const paso = dur / partes
  return grupos.map((g, k) => ({
    n: `${n}${String.fromCharCode(97 + k)}`,
    start: start + k * paso,
    end: start + (k + 1) * paso,
    locucion: g.join(' '),
  }))
}

/**
 * LAS ACCIONES DEL TRAMO, CON ESCAPE MANUAL — `PROBE_ACCIONES_<n>="a | b"`.
 *
 * Normalmente salen del forense. El escape existe por un caso medido y que el forense no da:
 * en el corte 1 de `7e4ccbcf` el gotero está APOYADO en la mejilla durante ~1,2 s y el
 * refinamiento lo describe como *"holds the open dropper near her cheek"* — la posición de la
 * mano, no el evento. Dos tiradas seguidas devuelven lo mismo, así que no es varianza. El
 * render ejecuta lo que lee: ese clip salió señalando la mejilla con el índice, sin gotero.
 *
 * Es el defecto que AGENTS.md ya documenta ("describía la trayectoria y se saltaba el evento").
 * Arreglarlo de verdad es tocar FASE 1; esto solo permite medir el resto sin quedar preso de
 * un plan que ya se sabe incompleto. `PROBE_ACCIONES` (sin sufijo) sigue aplicando a todos.
 */
function accionesDe(session: VideoSessionRow, t: Tramo): string[] {
  const manual = String(process.env[`PROBE_ACCIONES_${t.n}`] ?? '').trim()
  if (manual) return manual.split('|').map((x) => x.trim()).filter(Boolean)
  return accionesDelTramo(session, t.start, t.end)
}

async function main(): Promise<void> {
  const sessionId = process.argv[2]
  if (!sessionId) throw new Error('Uso: PROBE_RUN=1 npx tsx --env-file=.env.local scripts/probe-anuncio.ts <sessionId>')
  const draws = Math.max(1, Number(process.env.PROBE_DRAWS ?? 2))
  const solo = new Set(String(process.env.PROBE_SOLO ?? '').split(',').map((x) => x.trim()).filter(Boolean))

  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db.from('video_sessions').select('*').eq('id', sessionId).single()
  if (error) throw new Error(`No se pudo cargar la sesión: ${error.message}`)
  const session = data as unknown as VideoSessionRow & { adapted?: { tomas?: { tiempoOriginal?: string; locucion?: string }[] } }
  if (!session.reference_video_url) throw new Error('La sesión no tiene reference_video_url')
  if (!session.avatar_url) throw new Error('La sesión no tiene avatar_url')
  if (!session.product_url) throw new Error('La sesión no tiene product_url')

  // Los tramos salen del GUION ADAPTADO, no del forense: es lo que el usuario leyó y corrigió,
  // y es de donde sale la locución que se va a pronunciar.
  const tomas = session.adapted?.tomas ?? []
  if (!tomas.length) throw new Error('La sesión no tiene guion adaptado (adapted.tomas)')
  let tramos: Tramo[] = []
  tomas.forEach((t, k) => {
    const v = seg(String(t.tiempoOriginal ?? ''))
    if (!v) throw new Error(`La toma ${k + 1} no tiene tiempoOriginal legible: ${t.tiempoOriginal}`)
    tramos.push(...partir(k + 1, v[0], v[1], String(t.locucion ?? '')))
  })
  if (solo.size) tramos = tramos.filter((t) => solo.has(t.n))
  if (!tramos.length) throw new Error('PROBE_SOLO no seleccionó ningún tramo')

  // ── GUARDS: un probe de render tiene que negarse a rendir antes de gastar, no después.
  for (const t of tramos) {
    const d = t.end - t.start
    if (d > MAX_SEC) throw new Error(`El tramo ${t.n} dura ${d.toFixed(1)} s y el cap del modelo es ${MAX_SEC}`)
    if (!t.locucion.trim()) throw new Error(`El tramo ${t.n} no tiene locución`)
    if (/\[PENDIENTE/i.test(t.locucion)) throw new Error(`El tramo ${t.n} tiene un marcador PENDIENTE: se renderizaría leyendo un corchete en voz alta`)
  }

  const segsFacturados = tramos.reduce((a, t) => a + 2 * Math.max(MIN_SEC, Math.round(t.end - t.start)), 0) * draws
  const creditos = segsFacturados * CREDITOS_POR_SEG
  console.log(`\n${tramos.length} tramos × ${draws} draws = ${tramos.length * draws} renders`)
  for (const t of tramos) {
    console.log(`  ${t.n.padEnd(3)} ${t.start.toFixed(1)}–${t.end.toFixed(1)}s (${(t.end - t.start).toFixed(1)}s) · ${t.locucion.length} car · ${(t.locucion.length / (t.end - t.start)).toFixed(1)} car/s`)
  }
  console.log(`\nMOTOR: ${MODELO} @${RESOLUCION}`)
  console.log(`PRESUPUESTO: ${segsFacturados} s facturados × ${CREDITOS_POR_SEG} = ${creditos.toLocaleString('es')} créditos ≈ $${(creditos * USD_POR_CREDITO).toFixed(2)}${TARIFA_MEDIDA ? '' : '  ⚠️ TARIFA NO MEDIDA para esta combinación, el costo real puede ser otro'}`)
  console.log('(seedance cobra salida + referencia, o sea el doble de la duración del clip)\n')
  // ⚠️ `PROBE_DRY=1` IMPRIME EL PROMPT REAL DE CADA TRAMO Y NO GASTA NADA. Es el precedente de
  // `probe-prompt-lote.ts`: lo que hay que leer antes de disparar, porque un prompt equivocado
  // no se descubre hasta ver el clip y para entonces ya se pagó. Sale por el MISMO camino que
  // el render (`promptSeedance` + `accionesDelTramo`), así que no puede divergir de lo enviado.
  if (process.env.PROBE_DRY === '1') {
    for (const t of tramos) {
      const acciones = accionesDe(session, t)
      const prompt = promptSeedance(session, t.locucion, acciones)
      console.log(`\n${'═'.repeat(100)}\nTRAMO ${t.n} · ${t.start.toFixed(1)}–${t.end.toFixed(1)}s · duration=${Math.min(MAX_SEC, Math.max(MIN_SEC, Math.round(t.end - t.start)))}s · ${prompt.length} car · ${acciones.length} acciones del forense`)
      console.log(`referencias: @Image1=avatar @Image2=producto @Video1=tramo${t.n}-ref-480-mudo.mp4`)
      console.log(`${'─'.repeat(100)}\n${prompt}`)
    }
    console.log(`\n${'═'.repeat(100)}\n${tramos.length} tramos. Nada enviado a KIE: PROBE_DRY=1.`)
    return
  }
  if (process.env.PROBE_RUN !== '1') throw new Error('Guardia: define PROBE_RUN=1 para gastar.')

  // La transcripción sale por el mismo KIE que el render, así que usa la key del USUARIO y no
  // una global — `KIE_API_KEY` del entorno ya no se lee en producción (BYOK estricto).
  process.env.KIE_API_KEY = await kieKey(session.user_id)

  const out = resolve(process.env.PROBE_OUT ?? join(process.env.HOME ?? '.', 'Downloads', `anuncio-${sessionId.slice(0, 8)}`))
  await mkdir(out, { recursive: true })
  const fuente = join(out, 'source-original.mp4')
  await download(session.reference_video_url, fuente)
  if (!ffmpegPath) throw new Error('ffmpeg-static no resolvió un binario')

  // ── PREPARACIÓN, EN SERIE: los re-encodes son CPU y en paralelo se pisan (una corrida de 5
  // simultáneos murió por eso). Los renders de después son espera, no CPU.
  const refs = new Map<string, string>()
  for (const t of tramos) {
    const dur = t.end - t.start
    const clip = join(out, `tramo${t.n}-source.mp4`)
    await createClip(fuente, clip, t.start, dur)
    await createStrip(clip, join(out, `tramo${t.n}-source-frames.jpg`), dur)
    // ⚠️ 480x854 = 410.112 px y MUDA. Seedance exige entre 409.600 y 927.408 px, y el audio de
    // la referencia contamina la locución (medido: 86% → 98% de cobertura al mandarla con -an).
    const ref = join(out, `tramo${t.n}-ref-480-mudo.mp4`)
    await run(ffmpegPath, ['-y', '-loglevel', 'error', '-i', clip, '-vf', 'scale=480:854',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-an',
      '-movflags', '+faststart', ref])
    refs.set(t.n, await uploadToStorage(sessionId, await readFile(ref), 'video/mp4',
      `probe-anuncio-${t.n}-ref`.replace(/\./g, '_')))
    console.log(`  ${t.n}: referencia lista`)
  }

  // ── RENDERS, escalonados 45 s para no abrir todas las conexiones de golpe.
  const trabajos: Promise<Draw>[] = []
  let i = 0
  for (const t of tramos) {
    for (let d = 1; d <= draws; d++) {
      const espera = i++ * 45_000
      trabajos.push((async (): Promise<Draw> => {
        await sleep(espera)
        const etiqueta = `${t.n}#${d}`
        try {
          const dur = Math.min(MAX_SEC, Math.max(MIN_SEC, Math.round(t.end - t.start)))
          const gen = await runSeedance(session, refs.get(t.n)!, t.locucion, dur, accionesDe(session, t))
          const file = join(out, `tramo${t.n}-draw${d}.mp4`)
          const frames = join(out, `tramo${t.n}-draw${d}-frames.jpg`)
          await download(gen.url, file)
          await createStrip(file, frames, dur)
          console.log(`  ✓ ${etiqueta} renderizado`)
          return { tramo: t.n, draw: d, taskId: gen.taskId, file, frames }
        } catch (e) {
          console.log(`  ✗ ${etiqueta}: ${e instanceof Error ? e.message : String(e)}`)
          return { tramo: t.n, draw: d, error: e instanceof Error ? e.message : String(e) }
        }
      })())
    }
  }
  const hechos = await Promise.all(trabajos)

  // ── MEDICIÓN DE LA LOCUCIÓN. Va por URL: medido el 2026-09-04, la base64 de un mp4 de 2,4 MB
  // devuelve `400 Inline data URL is too large` — contra lo que dice AGENTS.md, que vale para
  // videos chicos y ya no para éstos.
  for (const h of hechos) {
    if (!h.file) continue
    const t = tramos.find((x) => x.n === h.tramo)!
    try {
      const url = await uploadToStorage(sessionId, await readFile(h.file), 'video/mp4',
        `probe-anuncio-${h.tramo}-d${h.draw}`.replace(/\./g, '_'))
      const { dicho } = await transcribir(url)
      h.dicho = dicho
      h.cobertura = cobertura(t.locucion, dicho)   // ¿dijo todo lo pedido?
      h.precision = cobertura(dicho, t.locucion)   // ¿dijo algo de más? (tartamudeos, relleno)
    } catch (e) {
      h.dicho = `(no se pudo transcribir: ${e instanceof Error ? e.message : String(e)})`
    }
  }

  // ── ELECCIÓN. Solo por locución, que es lo único mecánico. El motion y la identidad se ven
  // en la tira de contacto: automatizarlos pide un juez de visión, y uno al que se le muestra
  // la respuesta esperada confirma en vez de medir.
  const elegidos: Draw[] = []
  for (const t of tramos) {
    const cand = hechos.filter((h) => h.tramo === t.n && h.file)
    if (!cand.length) { console.log(`⚠️ el tramo ${t.n} no tiene ningún draw`); continue }
    elegidos.push(cand.slice().sort((a, b) =>
      ((b.cobertura ?? 0) + (b.precision ?? 0)) - ((a.cobertura ?? 0) + (a.precision ?? 0)))[0])
  }

  // ── TIRA DE CONTACTO por tramo: la fuente arriba y los draws debajo, para elegir a ojo.
  for (const t of tramos) {
    const filas = [join(out, `tramo${t.n}-source-frames.jpg`),
      ...hechos.filter((h) => h.tramo === t.n && h.frames).map((h) => h.frames!)]
    if (filas.length < 2) continue
    await run(ffmpegPath, ['-y', '-loglevel', 'error', ...filas.flatMap((f) => ['-i', f]),
      '-filter_complex', `${filas.map((_, k) => `[${k}]scale=1000:-1[s${k}]`).join(';')};${filas.map((_, k) => `[s${k}]`).join('')}vstack=inputs=${filas.length}`,
      join(out, `contacto-tramo${t.n}.jpg`)])
  }

  // ── EL ANUNCIO. Con el FILTRO concat y no con `-c copy`: medido el 2026-09-04, seedance
  // devuelve clips con sample rate distinto entre tareas del MISMO modelo (32 kHz y 44,1 kHz
  // en la misma tanda), y el demuxer con -c copy los pega dejando un tramo MUDO y todo lo que
  // sigue desfasado. El filtro decodifica y resincroniza; re-encodar 50 s es barato.
  if (elegidos.length === tramos.length) {
    const ins = elegidos.flatMap((e) => ['-i', e.file!])
    const map = elegidos.map((_, k) => `[${k}:v][${k}:a]`).join('')
    await run(ffmpegPath, ['-y', '-loglevel', 'error', ...ins,
      '-filter_complex', `${map}concat=n=${elegidos.length}:v=1:a=1[v][a]`,
      '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k',
      '-movflags', '+faststart', join(out, 'anuncio-completo.mp4')])
  }

  // ── REPORTE
  const pct = (x?: number) => (x === undefined ? '   —' : `${(x * 100).toFixed(0).padStart(3)}%`)
  const filas = hechos.map((h) => {
    const marca = elegidos.includes(h) ? '★' : ' '
    return `| ${marca} ${h.tramo.padEnd(3)} #${h.draw} | ${pct(h.cobertura)} | ${pct(h.precision)} | ${h.error ? `FALLÓ: ${h.error.slice(0, 60)}` : (h.dicho ?? '').slice(0, 70)} |`
  })
  const md = [
    `# ${sessionId} — ${tramos.length} tramos × ${draws} draws`,
    '',
    `Motor: **${MODELO} @${RESOLUCION}**`,
    '',
    `Presupuesto disparado: ${creditos.toLocaleString('es')} créditos ≈ $${(creditos * USD_POR_CREDITO).toFixed(2)}`,
    '',
    '★ = elegido para el anuncio (por locución: cobertura + precisión).',
    'El MOTION y la IDENTIDAD no se puntúan: míralos en `contacto-tramo<N>.jpg`, donde la',
    'primera fila es la fuente y las de abajo los draws. Si preferís otro draw, es cambiar el',
    'archivo en la lista y volver a concatenar.',
    '',
    '| draw | dijo todo | sin agregar | transcripción |',
    '|---|---|---|---|',
    ...filas,
    '',
    '## Qué mirar en la tira de contacto',
    '- ¿la secuencia de acciones es la de la fuente? (1 de 5 draws lo logró en el A/B)',
    '- ¿la cara y el fondo son los del avatar, o se filtró la creadora del video de referencia?',
    '- ¿la etiqueta del producto se lee?',
    '- las uñas: la referencia le pasa el esmalte de la creadora — apareció en 1 de 6 cortes.',
  ].join('\n')
  await writeFile(join(out, 'RESULTADO.md'), md + '\n')
  console.log(`\n${md}\n\nTodo en: ${out}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1 })
