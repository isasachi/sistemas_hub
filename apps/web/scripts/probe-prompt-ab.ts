/**
 * ¿El prompt LARGO rinde mejor que uno corto, o el techo de 5000 nos está haciendo pelear
 * por espacio que no compra calidad?
 *
 * Renderiza EL MISMO lote dos veces con la key del usuario:
 *   A = el prompt que produce hoy `buildLotePrompt` (identidad, producto, escenario,
 *       cámara, voz, movimiento, detalle atómico, manos, coreografía, línea hablada,
 *       guion global y el bloque de overlay completo).
 *   B = lo mínimo: identidad, producto, cámara, coreografía y línea hablada.
 *
 * ⚠️ NO toca la cuota del hub (no pasa por `generate-lotes`), no escribe en la base y no
 * genera ninguna imagen: reusa el avatar y la foto del producto que la sesión ya tiene.
 * Lo único que gasta son DOS renders de KIE.
 *
 *   npx tsx --env-file=.env.local scripts/probe-prompt-ab.ts <sessionId>
 */
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'
import { groupIntoLotes, buildLotePrompt, camaraDeLote } from '../lib/video-ads/lotes'
import { createVideoTask, getTaskDetail, clampDuration } from '../lib/video-ads/kie'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { corteMuestraPersona, type ForensicReport } from '../lib/video-ads/forensic'
import { personajesDe } from '../lib/video-ads/personajes'

const SALIDA = process.env.PROBE_OUT ?? '/home/isasachi/.claude/jobs/e42ca7ab/tmp/ab'
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** El prompt MÍNIMO: solo lo que el modelo necesita para saber quién, qué y qué hace. */
function promptCorto(args: {
  consistencyBlock: string; productDesc: string; camara: string
  tomas: { duracionSeg: number; accionVisual: string; locucion: string }[]
  segundos: number
}): string {
  return [
    `Vertical 9:16 UGC video, ${args.segundos} seconds, shot on a phone.`,
    'Instructions in English. Quoted lines are Latin American Spanish: speak them EXACTLY, never translate.',
    '',
    '@image(1) = the person · @image(2) = the product.',
    'The images define APPEARANCE only. The product stays in her hands or on a surface,',
    'never as a floating cut-out or a full-frame image.',
    '',
    `PERSON: ${args.consistencyBlock}`,
    `PRODUCT: ${args.productDesc}`,
    `CAMERA: ${args.camara.replace(/\.\s*$/, '')}. Handheld phone, natural micro-shake.`,
    'CONTINUOUS TAKE, no internal cuts. No captions, subtitles or on-screen text.',
    '',
    ...args.tomas.flatMap((t) => [
      `${t.accionVisual}`,
      t.locucion ? `Says: “${t.locucion}”` : 'No dialogue in this shot.',
    ]),
  ].join('\n')
}

async function esperar(taskId: string, key: string, etiqueta: string): Promise<string | null> {
  const limite = Date.now() + 8 * 60_000
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

  const { data } = await db.from('video_sessions').select('*').eq('id', id).single()
  const r = data as Record<string, unknown> & { forensic_analysis: ForensicReport }
  const { data: st } = await db.from('user_settings').select('kie_api_key').eq('user_id', r.user_id as string).single()
  const key = (st as { kie_api_key?: string } | null)?.kie_api_key
  if (!key) throw new Error('El usuario no tiene key de KIE guardada')

  const adapted = AdaptedScriptSchema.parse(r.adapted)
  const f = r.forensic_analysis
  const plano = new Map(f.cortes.map((c) => [c.tiempo, String(c.camara).trim()]))
  const clase = new Map(f.cortes.map((c) => [c.tiempo, corteMuestraPersona(c)]))
  const lotes = groupIntoLotes(adapted.tomas, plano, 1, clase)

  // El lote con MÁS coreografía: si el recorte gana ahí, la respuesta es contundente.
  const lote = [...lotes].sort((a, b) =>
    b.tomas.reduce((n, t) => n + t.accionVisual.length, 0) - a.tomas.reduce((n, t) => n + t.accionVisual.length, 0))[0]
  const coreo = lote.tomas.reduce((n, t) => n + t.accionVisual.length, 0)
  const chars = lote.tomas.reduce((n, t) => n + t.locucion.length, 0)
  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const camara = camaraDeLote(lote, f.cortes, 'primer plano')

  const largo = buildLotePrompt({
    lote, consistencyBlock: (r.consistency_block as string) ?? '',
    productDesc: scan.productDescription ?? '', escenario: f.fondo ?? '',
    camara, voz: r.voice_profile as never, movimiento: r.motion_profile as never,
    images: [{ url: r.avatar_url as string, role: 'the person' }, { url: r.product_url as string, role: 'the product' }],
    cortes: f.cortes, niche: r.niche, personajes: personajesDe(r as never),
  })
  const corto = promptCorto({
    consistencyBlock: (r.consistency_block as string) ?? '',
    productDesc: scan.productDescription ?? '', camara,
    tomas: lote.tomas, segundos: Math.round(lote.duracionSeg),
  })

  console.log(`sesión ${id.slice(0, 8)} · lote ${lote.n} de ${lotes.length} · ${lote.duracionSeg}s · ${lote.tomas.length} toma(s)`)
  console.log(`coreografía pedida: ${coreo} caracteres`)
  console.log(`  A (completo): ${largo.length} caracteres${largo.includes('…') ? ' ⚠️ TRUNCADO' : ''}`)
  console.log(`  B (mínimo):   ${corto.length} caracteres  (${Math.round(100 * corto.length / largo.length)} % del otro)\n`)

  const imagenes = [
    { url: r.avatar_url as string, role: 'the person' },
    { url: r.product_url as string, role: 'the product' },
  ]
  const dur = clampDuration(lote.duracionSeg, chars, lote.tomas.length)

  const tareas = await Promise.all(([['A', largo], ['B', corto]] as const).map(async ([et, prompt]) => {
    const taskId = await createVideoTask({ images: imagenes, prompt, durationSec: dur, locucionChars: chars, tomas: lote.tomas.length }, key)
    console.log(`  ${et}: tarea ${taskId}`)
    return [et, taskId] as const
  }))

  for (const [et, taskId] of tareas) {
    const url = await esperar(taskId, key, et)
    if (!url) continue
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer())
    const ruta = `${SALIDA}-${et}.mp4`
    await writeFile(ruta, bytes)
    console.log(`  ${et}: ${ruta}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
