/**
 * LOS QUINCE SINÓNIMOS DEL BLOQUE DE VIDEO LIMPIO, ¿COMPRAN ALGO SOBRE UNA LÍNEA?
 *
 * `REGLA_VIDEO_LIMPIO` son 313 caracteres que dicen quince veces la misma orden (*"No
 * captions. No subtitles. No overlays. No titles. No stickers…"*). AGENTS.md ya tiene
 * medido que el bloque FUNCIONA —7 clips sin un solo carácter de texto, sobre originales
 * saturados de subtítulos y watermark de TikTok— pero **nunca hubo brazo de control**, así
 * que no se sabe si lo que protege son los quince sinónimos o la orden a secas.
 *
 * ⚠️ EL PREMIO ESTÁ MEDIDO ANTES DE GASTAR, y por eso este probe existe. Comprimiendo a
 * 183 caracteres, sobre los 146 lotes reales: **completos 99 → 105 y sin movimiento
 * 30 → 25**. O sea 6 lotes recuperan el prompt entero y 5 recuperan el bloque de
 * movimiento — el mismo orden de magnitud que los tres cambios de orden del prompt.
 *
 * ⚠️ NO SE MIDE "QUITARLO", y es deliberado: 36 de 36 análisis guardados detectan
 * subtítulos o watermark en su original, así que publicar un clip con una caption quemada
 * de otra marca es un riesgo real y el fail-safe es conservar la protección. Lo que se
 * mide es si la versión CORTA la conserva — las dos ramas son desplegables.
 *
 * Manipulación mínima: se construye el prompt REAL y en el brazo B se sustituye ESA línea.
 * **Dos draws por brazo** (4 renders). Lo que se lee de la tira: un solo carácter de texto,
 * watermark o UI en cualquier cuadro.
 *
 *   PROBE_DRY=1 npx tsx --env-file=.env.local scripts/probe-overlay.ts <sessionId> [nLote]
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { groupIntoLotes, buildLotePrompt, camaraDeLote } from '../lib/video-ads/lotes'
import { createVideoTask, getTaskDetail, clampDuration } from '../lib/video-ads/kie'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { type ForensicReport } from '../lib/video-ads/forensic'
import { personajesDe } from '../lib/video-ads/personajes'
import { createStrip } from './probe-video-motores'

const SALIDA = process.env.PROBE_OUT ?? `${process.env.HOME}/Downloads/probe-overlay`
const DRAWS = Number(process.env.PROBE_DRAWS ?? 2)
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * El bloque LARGO, el de los quince sinónimos.
 *
 * ⚠️ LA DIRECCIÓN SE INVIRTIÓ cuando la medición ganó y la versión corta pasó a producción:
 * el brazo A ya no es "lo que hace el código" sino "lo que hacía", y reconstruirlo acá es lo
 * que mantiene el probe re-corrible. Mismo criterio que `probe-setting.ts`.
 */
export const VIDEO_LIMPIO_LARGO =
  'Clean video rule: no on-screen text. No captions. No subtitles. No overlays. No titles. ' +
  'No stickers. No emojis. No arrows. No graphics. No UI. No watermarks. Only the character, ' +
  'the product and real physical elements of the room. Text physically printed on the product ' +
  'may stay as part of the product.'

/** Sustituye la línea entera. LANZA si no la encuentra: dos brazos iguales miden el seed. */
export function conBloqueLargo(prompt: string): string {
  const i = prompt.indexOf('Clean video rule:')
  if (i < 0) throw new Error('No se encontró el bloque de video limpio')
  const fin = prompt.indexOf('\n', i)
  const A = prompt.slice(0, i) + VIDEO_LIMPIO_LARGO + (fin < 0 ? '' : prompt.slice(fin))
  if (A === prompt) throw new Error('El brazo A quedó idéntico a B')
  return A
}

async function esperar(taskId: string, key: string, etiqueta: string): Promise<string | null> {
  const limite = Date.now() + 10 * 60_000
  while (Date.now() < limite) {
    const d = await getTaskDetail(taskId, key)
    if (d.state === 'success' && d.videoUrl) return d.videoUrl
    if (d.state === 'fail') { console.error(`  ${etiqueta}: FALLÓ — ${d.failMsg ?? '(sin motivo)'}`); return null }
    await new Promise((r) => setTimeout(r, 6000))
  }
  console.error(`  ${etiqueta}: se agotó el plazo (la tarea sigue viva y YA está pagada)`)
  return null
}

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Falta el sessionId')
  const nLote = process.argv[3] ? Number(process.argv[3]) : null

  const { data } = await db.from('video_sessions').select('*').eq('id', id).single()
  if (!data) throw new Error(`No existe la sesión ${id}`)
  const r = data as Record<string, unknown> & { forensic_analysis: ForensicReport }
  const { data: st } = await db.from('user_settings').select('kie_api_key').eq('user_id', r.user_id as string).single()
  const key = (st as { kie_api_key?: string } | null)?.kie_api_key
  if (!key) throw new Error('El usuario no tiene key de KIE guardada')

  const adapted = AdaptedScriptSchema.parse(r.adapted)
  const f = r.forensic_analysis
  const lotes = groupIntoLotes(adapted.tomas)
  const lote = nLote ? lotes.find((l) => l.n === nLote)! : lotes[0]
  const chars = lote.tomas.reduce((n, t) => n + t.locucion.length, 0)
  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const imagenes = [
    { url: r.avatar_url as string, role: 'the person' },
    { url: r.product_url as string, role: 'the product' },
  ]
  const B = buildLotePrompt({
    lote, consistencyBlock: (r.consistency_block as string) ?? '',
    productDesc: scan.productDescription ?? '',
    camara: camaraDeLote(lote, f.cortes, 'primer plano'),
    voz: r.voice_profile as never, movimiento: r.motion_profile as never,
    images: imagenes, cortes: f.cortes, niche: r.niche, personajes: personajesDe(r as never),
    escenario: String(f.fondo ?? ''),
  })
  const A = conBloqueLargo(B)

  console.log(`sesión ${id.slice(0, 8)} · lote ${lote.n} de ${lotes.length} · ${lote.duracionSeg}s`)
  console.log(`  A (bloque completo): ${A.length} · B (comprimido): ${B.length} — libera ${A.length - B.length}\n`)
  A.split('\n').forEach((la, i) => { const lb = B.split('\n')[i]; if (la !== lb) console.log(`  - ${la}\n  + ${lb}`) })

  await mkdir(SALIDA, { recursive: true })
  await writeFile(`${SALIDA}/prompt-A.txt`, A)
  await writeFile(`${SALIDA}/prompt-B.txt`, B)
  if (process.env.PROBE_DRY) { console.log('\nPROBE_DRY: prompts escritos, no se creó ninguna tarea.'); return }

  const dur = clampDuration(lote.duracionSeg, chars, lote.tomas.length)
  const brazos = Array.from({ length: DRAWS }, (_, k) => [
    [`A${k + 1}`, A] as const, [`B${k + 1}`, B] as const,
  ]).flat()
  const tareas = await Promise.all(brazos.map(async ([et, prompt]) => {
    const taskId = await createVideoTask(
      { images: imagenes, prompt, durationSec: dur, locucionChars: chars, tomas: lote.tomas.length }, key)
    console.log(`  ${et}: tarea ${taskId}`)
    return [et, taskId] as const
  }))
  for (const [et, taskId] of tareas) {
    const url = await esperar(taskId, key, et)
    if (!url) continue
    const mp4 = `${SALIDA}/${et}.mp4`
    await writeFile(mp4, Buffer.from(await (await fetch(url)).arrayBuffer()))
    await createStrip(mp4, `${SALIDA}/${et}.jpg`, dur)
    console.log(`  ${et}: ${mp4} + tira`)
  }
}

if (process.argv[1]?.endsWith('probe-overlay.ts')) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
