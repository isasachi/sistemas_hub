/**
 * IMPRIME EL PROMPT REAL DE UN LOTE, sin gastar nada.
 *
 * Es la herramienta de control de la vuelta al PROMPT MAESTRO: arma los lotes con los
 * MISMOS insumos que `generate-lotes` y escupe el prompt que le llegaría a grok, para poder
 * leerlo al lado del ejemplo del spec. Cero llamadas a modelos, cero renders, no escribe en
 * la base — solo lee la sesión.
 *
 * ⚠️ Reemplaza a `probe-motion-lock.ts`, que A/Beaba el CANDADO DE MOVIMIENTO: esa máquina
 * se fue con la vuelta a la fuente, así que su probe medía una diferencia que ya no existe.
 *
 * Con `PROBE_RENDER=1` además RENDERIZA el lote elegido: una llamada pagada con la key del
 * usuario, el mp4 a `~/Downloads/probe-lote/` y una tira de cinco fotogramas para poder
 * compararlo con el original sin abrir el video.
 *
 *   npx tsx --env-file=.env.local scripts/probe-prompt-lote.ts <sessionId> [nLote]
 */
import { createClient } from '@supabase/supabase-js'
import { groupIntoLotes, buildLotePrompt, camaraDeLote } from '../lib/video-ads/lotes'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { enProsa, type ForensicReport } from '../lib/video-ads/forensic'
import { tieneMotion } from '../lib/video-ads/motion'
import { personajesDe, hablantesPorTiempo, vozEnOffPorTiempo } from '../lib/video-ads/personajes'
import { KIE_PROMPT_MAX, clampDuration, createVideoTask, getTaskDetail } from '../lib/video-ads/kie'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

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
  const f = r.forensic_analysis
  const cortes = f?.cortes ?? []
  const motionPorTiempo = new Map(cortes.filter(tieneMotion).map((c) => [c.tiempo, c.motion!] as const))
  const lotes = groupIntoLotes(adapted.tomas, motionPorTiempo)
  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const gente = personajesDe(r as never)

  console.log(`sesión ${completo.slice(0, 8)} · ${adapted.tomas.length} tomas → ${lotes.length} lotes`)
  console.log(`duraciones: [${lotes.map((l) => l.duracionSeg).join(', ')}]\n`)

  for (const lote of lotes) {
    if (nLote && lote.n !== nLote) continue
    const chars = lote.tomas.reduce((n, t) => n + t.locucion.length, 0)
    const prompt = buildLotePrompt({
      lote,
      consistencyBlock: (r.consistency_block as string) ?? '',
      productDesc: scan.productDescription ?? '',
      camara: camaraDeLote(lote, cortes),
      escenario: enProsa(f?.fondo),
      voz: r.voice_profile as never,
      movimiento: r.motion_profile as never,
      images: [
        { url: (r.avatar_url as string) ?? '', role: 'la persona' },
        { url: (r.product_url as string) ?? '', role: 'el producto' },
      ],
      cortes, niche: r.niche, personajes: gente,
      quien: hablantesPorTiempo(cortes, gente),
      vozEnOff: vozEnOffPorTiempo(cortes),
    })
    const dur = clampDuration(lote.duracionSeg, chars, lote.tomas.length)
    console.log('═'.repeat(78))
    console.log(`LOTE ${lote.n} · tomas ${lote.tomas.map((t) => t.n).join('+')} · ${lote.duracionSeg}s → duration ${dur}` +
      ` · ${prompt.length}/${KIE_PROMPT_MAX} caracteres${prompt.includes('…') ? ' ⚠️ RECORTADO' : ''}`)
    console.log('═'.repeat(78))
    console.log(prompt)
    console.log()

    if (!process.env.PROBE_RENDER) continue
    const { data: st } = await db.from('user_settings').select('kie_api_key').eq('user_id', r.user_id as string).single()
    const key = (st as { kie_api_key?: string } | null)?.kie_api_key
    if (!key) throw new Error('El usuario no tiene key de KIE guardada')
    const imagenes = [
      { url: r.avatar_url as string, role: 'la persona' },
      { url: r.product_url as string, role: 'el producto' },
    ]
    const taskId = await createVideoTask(
      { images: imagenes, prompt, durationSec: lote.duracionSeg, locucionChars: chars, tomas: lote.tomas.length }, key)
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
    const salida = `${process.env.HOME}/Downloads/probe-lote`
    await mkdir(salida, { recursive: true })
    const mp4 = `${salida}/lote-${lote.n}.mp4`
    await writeFile(mp4, Buffer.from(await (await fetch(url)).arrayBuffer()))
    await tira(mp4, `${salida}/lote-${lote.n}-tira.jpg`, dur)
    console.log(`clip: ${mp4}`)
    console.log(`tira: ${salida}/lote-${lote.n}-tira.jpg`)
  }
}

/** Cinco fotogramas repartidos, en una sola imagen: es lo único de este probe que no
 *  depende de que un modelo mire bien. */
async function tira(mp4: string, salida: string, dur: number): Promise<void> {
  const ts = [0.05, 0.28, 0.5, 0.72, 0.95].map((f) => (dur * f).toFixed(2))
  const args = ts.flatMap((t) => ['-ss', t, '-i', mp4, '-frames:v', '1'])
  await new Promise<void>((ok) => {
    const p = spawn('ffmpeg', ['-y', '-v', 'error', ...args,
      '-filter_complex', `hstack=inputs=${ts.length},scale=1500:-1`, salida], { stdio: 'ignore' })
    p.on('exit', () => ok())
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
