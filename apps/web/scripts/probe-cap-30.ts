/**
 * ¿AGUANTA GROK UN CLIP DE 30 s?
 * ---------------------------------------------------------------------------
 * El cap bajó de 30 a 15 s (2026-08-25) por una hipótesis que NUNCA se midió: *"grok pierde
 * la consistencia del personaje y del entorno en clips largos"*. Ese cambio DUPLICÓ las
 * llamadas pagadas, así que la premisa vale la pena comprobarla.
 *
 * Y desde el 2026-08-27 hay además un defecto MEDIDO que empuja en la misma dirección: al
 * pegar los clips en un solo mp4 se ve que **el fondo cambia entre clips**. Cada clip se
 * renderiza sin memoria del anterior, así que menos clips es menos costuras — acá el costo y
 * la calidad son el MISMO eje, no dos.
 *
 * ⚠️ **DOS DRAWS, NO UNO.** Este repo tiene medido que con n=1 no se distingue estructura de
 * suerte: la hipótesis del "beat por clip" nació de un único render y se cayó en las dos
 * réplicas siguientes. El control de 15 s ya está renderizado y no se vuelve a pagar.
 *
 * ⚠️ Gasta DOS renders de KIE. No toca la cuota del hub, no genera imágenes y no escribe en
 * la base.
 *
 *   npx tsx --env-file=.env.local scripts/probe-cap-30.ts <sessionId>
 */
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'
import { groupIntoLotes, camaraDeLote } from '../lib/video-ads/lotes'
import { createVideoTask, getTaskDetail, clampDuration } from '../lib/video-ads/kie'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { corteMuestraPersona, type ForensicReport } from '../lib/video-ads/forensic'

const SALIDA = process.env.PROBE_OUT ?? '/home/isasachi/.claude/jobs/e42ca7ab/tmp/cap30'
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** El mismo prompt corto que el A/B midió equivalente al completo. */
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
    'The room, the lighting and the wardrobe stay IDENTICAL from the first frame to the last.',
    '',
    a.accion,
    a.locucion ? `Says: “${a.locucion}”` : 'No dialogue in this shot.',
  ].join('\n')
}

async function esperar(taskId: string, key: string, et: string): Promise<string | null> {
  const limite = Date.now() + 10 * 60_000
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
  const { data: st } = await db.from('user_settings').select('user_id,kie_api_key').not('kie_api_key', 'is', null)
  const filas = (st ?? []) as { user_id?: string; kie_api_key: string }[]
  const key = filas.find((f) => f.user_id === r.user_id)?.kie_api_key ?? filas[0]?.kie_api_key
  if (!key) throw new Error('No hay ninguna key de KIE guardada')

  const adapted = AdaptedScriptSchema.parse(r.adapted)
  const f = r.forensic_analysis
  const plano = new Map(f.cortes.map((c) => [c.tiempo, String(c.camara).trim()]))
  const clase = new Map(f.cortes.map((c) => [c.tiempo, corteMuestraPersona(c)]))

  // ⚠️ EL LOTE DE 30 s SE ARMA A MANO, no con `groupIntoLotes`: esa función usa la constante
  // `LOTE_MAX_SEC` (hoy 15) y además `splitLongToma` ya parte cualquier toma que la supere,
  // así que por ese camino un lote de 30 s no existe. Se acumulan tomas consecutivas hasta
  // el techo del MODELO (`MAX_DURATION`), que es lo que este probe quiere ejercitar.
  //
  // ⚠️ Se busca la MEJOR ventana contigua, no se acumula desde la primera toma: empezando
  // siempre en la 1 esta misma sesión daba 17,7 s (la tercera toma no entraba) cuando tiene
  // una ventana de 29,5 s dos tomas más allá — o sea el probe habría medido 18 creyendo
  // medir 30.
  let tomas: typeof adapted.tomas = []
  let acumulado = 0
  for (let i = 0; i < adapted.tomas.length; i++) {
    const v: typeof adapted.tomas = []
    let s = 0
    for (let j = i; j < adapted.tomas.length; j++) {
      if (s + adapted.tomas[j].duracionSeg > 30) break
      v.push(adapted.tomas[j]); s += adapted.tomas[j].duracionSeg
    }
    if (s > acumulado) { tomas = v; acumulado = s }
  }
  if (tomas.length < 2) throw new Error('Esta sesión no tiene tomas consecutivas que sumen un clip largo')
  const accion = tomas.map((t) => t.accionVisual).join(' Luego, ')
  const locucion = tomas.map((t) => t.locucion).filter(Boolean).join(' ')
  const seg = clampDuration(acumulado, locucion.length, tomas.length)
  // Solo para reusar `camaraDeLote`, que empareja por `tiempoOriginal`.
  const lote = { n: 1, tomas, duracionSeg: acumulado } as Parameters<typeof camaraDeLote>[0]
  const lotes = groupIntoLotes(adapted.tomas, plano, 1, clase)

  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const prompt = promptCorto({
    persona: (r.consistency_block as string) ?? '', producto: scan.productDescription ?? '',
    camara: camaraDeLote(lote, f.cortes, 'primer plano'), accion, locucion, segundos: seg,
  })
  const imagenes = [
    { url: r.avatar_url as string, role: 'the person' },
    { url: r.product_url as string, role: 'the product' },
  ]

  console.log(`sesión ${id.slice(0, 8)} · con el cap de HOY son ${lotes.length} lotes`)
  console.log(`clip largo: ${acumulado.toFixed(1)}s de contenido en ${tomas.length} tomas → se piden ${seg}s`)
  console.log(`${locucion.length} caracteres de locución · prompt ${prompt.length}\n`)

  const tareas: (readonly [string, string])[] = []
  for (const draw of ['A', 'B']) {
    tareas.push([draw, await createVideoTask(
      { images: imagenes, prompt, durationSec: seg, locucionChars: locucion.length, tomas: tomas.length },
      key,
    )] as const)
  }
  for (const [et, taskId] of tareas) {
    const url = await esperar(taskId, key, et)
    if (!url) continue
    await writeFile(`${SALIDA}-${et}.mp4`, Buffer.from(await (await fetch(url)).arrayBuffer()))
    console.log(`  draw ${et}: ${SALIDA}-${et}.mp4`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
