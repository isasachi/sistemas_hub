/**
 * LA ANCLA DE POSE: ¿el fotograma real del original llega, y qué produce?
 *
 * `referenceFrameMs` existe en cada beat desde que hay timeline y hasta ahora no lo leía
 * NADIE. Este probe recorre la cadena entera sin renderizar: arma los lotes como
 * `generate-lotes`, saca las specs de ancla, extrae de la URL del video original el
 * fotograma de cada una y lo escribe a disco.
 *
 * ⚠️ IMPRIME Y GUARDA, NO PUNTÚA. Lo único que decide si una pose es la correcta es
 * mirarla al lado del original — y este repo ya tiene medido lo que pasa cuando un
 * oráculo automático juzga un fotograma (el juez de Gemini que dio 6/6 a un clip quieto).
 *
 * Sin flags no gasta nada: ffmpeg sobre una copia del original, cero llamadas a modelos,
 * no escribe en la base. Con `PROBE_GEN=1` genera además las anclas de verdad (imágenes
 * pagadas por el HUB, subidas al bucket) para poder ver el fotograma y el ancla que salió
 * de él, uno al lado del otro. Con `PROBE_RENDER=1` encima renderiza el lote CON esas
 * anclas — una llamada pagada con la key del usuario — y guarda el mp4 y una tira de cinco
 * fotogramas, que es la única forma de saber si el ancla movió la aguja.
 *
 *   npx tsx --env-file=.env.local scripts/probe-anclas-pose.ts <sessionId> [nLote]
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import { groupIntoLotes, buildLotePrompt, camaraDeLote } from '../lib/video-ads/lotes'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { enProsa, type ForensicReport } from '../lib/video-ads/forensic'
import { tieneMotion } from '../lib/video-ads/motion'
import { personajesDe, hablantesPorTiempo, vozEnOffPorTiempo } from '../lib/video-ads/personajes'
import { anchorSpecs, generateAnchorImages } from '../lib/video-ads/anchors'
import { extraerFotogramas } from '../lib/video-ads/pose-frames'
import { generateImage } from '../lib/gemini'
import { uploadToStorage } from '../lib/storage'
import { clampDuration, createVideoTask, getTaskDetail } from '../lib/video-ads/kie'

const SALIDA = process.env.PROBE_OUT ?? `${process.env.HOME}/Downloads/probe-anclas-pose`
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Falta el sessionId')
  const nLote = process.argv[3] ? Number(process.argv[3]) : null

  const { data: ids } = await db.from('video_sessions').select('id')
  const completo = (ids as { id: string }[] | null)?.find((f) => f.id.startsWith(id))?.id
  if (!completo) throw new Error(`No existe la sesión ${id}`)
  const { data } = await db.from('video_sessions').select('*').eq('id', completo).single()
  const r = data as Record<string, unknown> & { forensic_analysis: ForensicReport }

  const adapted = AdaptedScriptSchema.parse(r.adapted)
  const cortes = r.forensic_analysis?.cortes ?? []
  const lotes = groupIntoLotes(adapted.tomas, new Map(cortes.filter(tieneMotion).map((c) => [c.tiempo, c.motion!] as const)))
  const gente = personajesDe(r as never)
  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const video = r.reference_video_url as string

  await mkdir(SALIDA, { recursive: true })
  console.log(`sesión ${completo.slice(0, 8)} · ${lotes.length} lotes · video ${video ? 'ok' : 'FALTA'}\n`)

  for (const lote of lotes) {
    if (nLote && lote.n !== nLote) continue
    const specs = anchorSpecs({
      lote,
      quien: hablantesPorTiempo(cortes, gente),
      planoPorTiempo: new Map(cortes.map((c) => [c.tiempo, c.camara] as const)),
      microPorTiempo: new Map(cortes.flatMap((c) => (c.micro ? [[c.tiempo, c.micro] as const] : []))),
      vozEnOff: vozEnOffPorTiempo(cortes),
      productDesc: scan.productDescription ?? '',
      personajes: gente,
    })
    console.log(`LOTE ${lote.n} · ${specs.length} ancla(s)`)
    const cuadros = await extraerFotogramas(video, specs.map((s) => s.referenceFrameMs ?? 0))
    for (const [i, spec] of specs.entries()) {
      const ms = spec.referenceFrameMs
      if (!ms) { console.log(`  ${i + 1}. ${spec.tiempo} — SIN referenceFrameMs (el ancla saldrá solo del texto)`); continue }
      const bytes = cuadros[i]
      const archivo = `${SALIDA}/pose-${lote.n}-${i + 1}.jpg`
      if (!bytes) { console.log(`  ${i + 1}. ${spec.tiempo} — ${ms}ms: ffmpeg NO devolvió fotograma`); continue }
      await writeFile(archivo, bytes)
      console.log(`  ${i + 1}. ${spec.tiempo} — ${ms}ms → ${archivo} (${(bytes.length / 1024).toFixed(0)} KB)`)
      // El probe no sube a Storage: la ruta local solo sirve para que
      // `generateAnchorImages` emita el bloque de pose y se pueda leer el prompt.
      spec.poseUrl = archivo
    }

    if (!process.env.PROBE_GEN && !process.env.PROBE_ANCLAS) continue
    // ⚠️ DOS DRAWS POR BRAZO ES EL MÍNIMO EN ESTE REPO, y regenerar las anclas en cada uno
    // cambia dos cosas a la vez (el prompt del lote Y la imagen). `PROBE_ANCLAS` reusa las
    // que ya están en el bucket, así que el segundo draw cuesta solo el render y el único
    // que se mueve es el seed de grok.
    const urls = process.env.PROBE_ANCLAS ? process.env.PROBE_ANCLAS.split(',') : await generateAnchorImages({
      avatarUrl: (r.avatar_url as string) ?? (r.character_url as string),
      productUrl: r.product_url as string,
      specs, lote: lote.n,
      generate: async (input) => {
        console.log(`     generando (${input.imageUrls.length} refs)…`)
        const b64 = await generateImage(
          [
            // El fotograma vive en disco: va inline, que `kie-image.ts` sube por hash.
            ...input.imageUrls.map((u) => (u.startsWith(SALIDA)
              ? { inlineData: { data: require('node:fs').readFileSync(u).toString('base64'), mimeType: 'image/jpeg' } }
              : { fileData: { fileUri: u, mimeType: 'image/jpeg' } })),
            { text: input.prompt },
          ],
          3,
          { aspectRatio: '9:16', preferGemini: true },
        )
        return Buffer.from(b64, 'base64')
      },
      // Al bucket, como en producción: KIE tiene que poder bajarlas. La copia local es
      // solo para mirarlas al lado del fotograma del que salieron.
      upload: async (bytes, nombre) => {
        await writeFile(`${SALIDA}/${nombre}.png`, bytes)
        return uploadToStorage(completo, bytes, 'image/png', `probe-${nombre}`)
      },
    })
    for (const [i, u] of urls.entries()) console.log(`     ancla ${i + 1} → ${SALIDA}/ancla-${lote.n}-${i + 1}.png`)
    console.log()

    if (!process.env.PROBE_RENDER) continue
    const scanD = scan.productDescription ?? ''
    const images = [
      { url: (r.avatar_url as string) ?? (r.character_url as string), role: 'the person (identity reference)' },
      { url: r.product_url as string, role: 'the product (must be reproduced exactly)' },
      ...urls.map((url, j) => ({ url, role: specs[j].role })),
    ]
    const prompt = buildLotePrompt({
      lote,
      consistencyBlock: (r.consistency_block as string) ?? '',
      productDesc: scanD,
      camara: camaraDeLote(lote, cortes),
      escenario: enProsa(r.forensic_analysis?.fondo),
      voz: r.voice_profile as never,
      movimiento: r.motion_profile as never,
      images,
      // El índice 1-based de cada ancla: avatar y producto ocupan 1 y 2.
      anclas: new Map(specs.map((s, j) => [s.tiempo, j + 3])),
      cortes, niche: r.niche, personajes: gente,
      quien: hablantesPorTiempo(cortes, gente),
      vozEnOff: vozEnOffPorTiempo(cortes),
    })
    // El brazo de control: la línea de ancla ANTERIOR, que solo pedía encuadre y
    // habitación. Se sustituye acá y no con un parámetro de producción — es un brazo de
    // medición, no una opción del producto.
    const prompt2 = process.env.PROBE_ANCLA_VIEJA
      ? prompt.replace(/(Starts from @image\(\d+\)): [^\n]+/g, '$1: same framing and same room.')
      : prompt
    const chars = lote.tomas.reduce((n, t) => n + t.locucion.length, 0)
    const dur = clampDuration(lote.duracionSeg, chars, lote.tomas.length)
    console.log(prompt2)
    console.log(`\n${prompt2.length} caracteres · duration ${dur} · ${images.length} imágenes`)

    const { data: st } = await db.from('user_settings').select('kie_api_key').eq('user_id', r.user_id as string).single()
    const key = (st as { kie_api_key?: string } | null)?.kie_api_key
    if (!key) throw new Error('El usuario no tiene key de KIE guardada')
    const taskId = await createVideoTask(
      { images, prompt: prompt2, durationSec: lote.duracionSeg, locucionChars: chars, tomas: lote.tomas.length }, key)
    console.log(`tarea ${taskId} — esperando…`)
    const limite = Date.now() + 10 * 60_000
    let url: string | null = null
    while (Date.now() < limite && !url) {
      const d = await getTaskDetail(taskId, key)
      if (d.state === 'success' && d.videoUrl) url = d.videoUrl
      else if (d.state === 'fail') throw new Error(`FALLÓ — ${d.failMsg ?? '(sin motivo)'}`)
      else await new Promise((ok) => setTimeout(ok, 6000))
    }
    if (!url) throw new Error('se agotó el plazo')
    const sufijo = `${process.env.PROBE_ANCLA_VIEJA ? 'vieja' : 'pose'}${process.env.PROBE_DRAW ?? ''}`
    const mp4 = `${SALIDA}/lote-${lote.n}-${sufijo}.mp4`
    await writeFile(mp4, Buffer.from(await (await fetch(url)).arrayBuffer()))
    await tira(mp4, `${SALIDA}/lote-${lote.n}-${sufijo}-tira.jpg`, dur)
    // ⚠️ EL FOTOGRAMA 0 ES LO QUE DISCRIMINA. "¿ejecutó la coreografía?" es estocástico y
    // no sobrevive n=1; "¿el clip ARRANCA en la foto del ancla?" está condicionado por la
    // imagen y se lee de un solo cuadro. La tira empieza en 0,05·dur, o sea ya derivó.
    await tira(mp4, `${SALIDA}/lote-${lote.n}-${sufijo}-frame0.jpg`, 0)
    console.log(`clip: ${mp4}\ntira: ${SALIDA}/lote-${lote.n}-${sufijo}-tira.jpg`)
  }
}

/** Cinco fotogramas repartidos, en una sola imagen. Lo único de este probe que no depende
 *  de que un modelo mire bien. */
async function tira(mp4: string, salida: string, dur: number): Promise<void> {
  // `dur = 0` pide el fotograma 0 solo: el que se compara contra la imagen del ancla.
  const ts = (dur ? [0.05, 0.28, 0.5, 0.72, 0.95] : [0]).map((f) => (dur * f).toFixed(2))
  await new Promise<void>((ok) => {
    // ⚠️ `ffmpeg-static`, no el `ffmpeg` del sistema: en esta máquina no hay ninguno y el
    // probe se quedaba sin tira sin decir nada. Y `-frames:v` va DESPUÉS del filtro, si no
    // ffmpeg lo lee como opción de entrada y se niega.
    const p = spawn(ffmpeg as unknown as string, [
      '-y', '-v', 'error',
      ...ts.flatMap((t) => ['-ss', t, '-i', mp4]),
      '-filter_complex', `${ts.map((_, i) => `[${i}:v]`).join('')}hstack=inputs=${ts.length},scale=2400:-1[o]`,
      '-map', '[o]', '-frames:v', '1', salida,
    ], { stdio: 'ignore' })
    p.on('exit', () => ok())
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
