/**
 * ¿El límite es cuánto le CONTAMOS a grok, o cuánta coreografía EJECUTA por clip?
 *
 * `probe-prompt-ab.ts` ya descartó lo primero: el mismo lote con 4896 y con 1854
 * caracteres dio prácticamente el mismo clip, y los dos se quedaron quietos tras el primer
 * beat. Esta prueba ataca lo segundo: parte ese mismo lote de 10 s en DOS clips, un beat y
 * una frase cada uno, y compara si entre los dos se cubre la coreografía que uno solo no
 * cubría.
 *
 * Usa el prompt CORTO en todos, para que la única variable sea el reparto.
 *
 * ⚠️ La primera versión mezclaba DOS variables: el número de beats y la duración del clip
 * (10 s/2 beats contra 6 s/1 beat). Ahora renderiza el CONTROL (todos los beats en un
 * clip, tal como está hoy) más K clips con el reparto, así se puede ver si lo que arregla
 * la ejecución es un beat por clip o simplemente un clip más corto.
 *
 * ⚠️ No toca la cuota del hub, no escribe en la base y no genera imágenes. Gasta DOS
 * renders de KIE.
 *
 *   npx tsx --env-file=.env.local scripts/probe-beat-por-clip.ts <sessionId> [lote] [K]
 */
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'
import { groupIntoLotes, camaraDeLote, repartirAccion } from '../lib/video-ads/lotes'
import { createVideoTask, getTaskDetail, clampDuration, MIN_DURATION } from '../lib/video-ads/kie'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { corteMuestraPersona, type ForensicReport } from '../lib/video-ads/forensic'

const SALIDA = process.env.PROBE_OUT ?? '/home/isasachi/.claude/jobs/e42ca7ab/tmp/beat'
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function promptCorto(a: { persona: string; producto: string; camara: string; accion: string; locucion: string; segundos: number }): string {
  return [
    `Vertical 9:16 UGC video, ${a.segundos} seconds, shot on a phone.`,
    'Instructions in English. Quoted lines are Latin American Spanish: speak them EXACTLY, never translate.',
    '',
    '@image(1) = the person · @image(2) = the product.',
    'The images define APPEARANCE only. The product stays in her hands or on a surface,',
    'never as a floating cut-out or a full-frame image.',
    '',
    `PERSON: ${a.persona}`,
    `PRODUCT: ${a.producto}`,
    `CAMERA: ${a.camara.replace(/\.\s*$/, '')}. Handheld phone, natural micro-shake.`,
    'CONTINUOUS TAKE, no internal cuts. No captions, subtitles or on-screen text.',
    '',
    a.accion,
    a.locucion ? `Says: “${a.locucion}”` : 'No dialogue in this shot.',
  ].join('\n')
}

async function esperar(taskId: string, key: string, et: string): Promise<string | null> {
  const limite = Date.now() + 8 * 60_000
  while (Date.now() < limite) {
    const d = await getTaskDetail(taskId, key)
    if (d.state === 'success' && d.videoUrl) return d.videoUrl
    if (d.state === 'fail') { console.error(`  ${et}: FALLÓ — ${d.failMsg ?? '(sin motivo)'}`); return null }
    await new Promise((r) => setTimeout(r, 6000))
  }
  console.error(`  ${et}: se agotó el plazo`); return null
}

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Falta el sessionId')
  const { data } = await db.from('video_sessions').select('*').eq('id', id).single()
  const r = data as Record<string, unknown> & { forensic_analysis: ForensicReport }
  // Las sesiones viejas están claveadas por la cookie anónima, así que su user_id no tiene
  // fila en user_settings: se cae a cualquier key guardada (todas son la del dueño del repo).
  const { data: st } = await db.from('user_settings').select('user_id,kie_api_key').not('kie_api_key', 'is', null)
  const filas = (st ?? []) as { user_id?: string; kie_api_key: string }[]
  const key = filas.find((f) => f.user_id === r.user_id)?.kie_api_key ?? filas[0]?.kie_api_key
  if (!key) throw new Error('No hay ninguna key de KIE guardada')

  const adapted = AdaptedScriptSchema.parse(r.adapted)
  const f = r.forensic_analysis
  const plano = new Map(f.cortes.map((c) => [c.tiempo, String(c.camara).trim()]))
  const clase = new Map(f.cortes.map((c) => [c.tiempo, corteMuestraPersona(c)]))
  const iLote = Number(process.argv[3] ?? 0)
  const K = Number(process.argv[4] ?? 2)
  const lote = groupIntoLotes(adapted.tomas, plano, 1, clase)[iLote]
  const t = lote.tomas[0]

  // El reparto: la acción se parte por su separador y la locución por frases.
  const partes = repartirAccion(t.accionVisual, Array.from({ length: K }, () => 1))
  const frases = t.locucion.split(/(?<=[.!?])\s+/).filter(Boolean)
  const porClip = Math.ceil(frases.length / K) || 1
  const locuciones = Array.from({ length: K }, (_, i) => frases.slice(i * porClip, (i + 1) * porClip).join(' '))

  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const camara = camaraDeLote(lote, f.cortes, 'primer plano')
  const imagenes = [
    { url: r.avatar_url as string, role: 'the person' },
    { url: r.product_url as string, role: 'the product' },
  ]

  const beats = t.accionVisual.split(' Luego, ').length
  console.log(`sesión ${id.slice(0, 8)} · lote ${lote.n} · ${t.duracionSeg}s · ${beats} beats → control + ${K} clips\n`)
  const tareas: (readonly [string, string])[] = []

  // CONTROL: todo junto, tal como se renderiza hoy.
  {
    const seg = clampDuration(t.duracionSeg, t.locucion.length, 1)
    const prompt = promptCorto({
      persona: (r.consistency_block as string) ?? '', producto: scan.productDescription ?? '',
      camara, accion: t.accionVisual, locucion: t.locucion, segundos: seg,
    })
    console.log(`CONTROL — ${seg}s · ${beats} beats · ${prompt.length} caracteres`)
    tareas.push(['C', await createVideoTask({ images: imagenes, prompt, durationSec: seg, locucionChars: t.locucion.length, tomas: 1 }, key)] as const)
  }

  for (let i = 0; i < K; i++) {
    if (!partes[i]?.trim()) continue
    const seg = Math.max(MIN_DURATION, clampDuration(t.duracionSeg / K, locuciones[i].length, 1))
    const prompt = promptCorto({
      persona: (r.consistency_block as string) ?? '', producto: scan.productDescription ?? '',
      camara, accion: partes[i], locucion: locuciones[i], segundos: seg,
    })
    console.log(`clip ${i + 1} — ${seg}s · ${partes[i].split(' Luego, ').length} beat(s) · ${prompt.length} caracteres`)
    console.log(`  acción:   ${partes[i].slice(0, 130)}`)
    console.log(`  locución: ${locuciones[i]}\n`)
    const taskId = await createVideoTask({ images: imagenes, prompt, durationSec: seg, locucionChars: locuciones[i].length, tomas: 1 }, key)
    tareas.push([`${i + 1}`, taskId] as const)
  }

  for (const [et, taskId] of tareas) {
    const url = await esperar(taskId, key, et)
    if (!url) continue
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer())
    await writeFile(`${SALIDA}-${et}.mp4`, bytes)
    console.log(`  clip ${et}: ${SALIDA}-${et}.mp4`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
