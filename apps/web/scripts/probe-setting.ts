/**
 * ¿EL BLOQUE `SETTING AND LIGHTING` COMPRA ALGO, O ES TEXTO QUE CONTRADICE A LA IMAGEN?
 *
 * La hipótesis viene de dos hechos ya registrados en AGENTS.md, y ninguno de los dos
 * alcanza para tocar el prompt:
 *   1. El A/B de prompt (`probe-prompt-ab.ts`) midió que un prompt del 38 % del largo da
 *      prácticamente el mismo clip — pero es **n = 1**, y este repo tiene tres rondas
 *      perdidas por exactamente ese error.
 *   2. `escenario` sale de `forensic.fondo`, que describe el video ENTERO dentro del
 *      prompt de UN clip. De ahí salió el sillón que apareció en un clip de la prueba de
 *      ropa: no era deriva del modelo, el prompt lo ofrecía.
 *   3. Y la medición de la concatenación vio el fondo cambiando entre clips **con el
 *      bloque puesto**, o sea que hoy no está comprando lo que debería.
 *
 * Manipulación mínima: se construye el prompt REAL con `buildLotePrompt` y en el brazo B
 * se le quita ESA LÍNEA y nada más. Mismo lote, mismas imágenes, misma duración.
 *
 * **DOS DRAWS POR BRAZO** (4 renders), que es la regla que este documento se impuso tras
 * el probe del cap de 30: grok es estocástico y un solo draw mide el seed, no el prompt.
 *
 * ⚠️ NO toca la cuota del hub (no pasa por `generate-lotes`), no escribe en la base y no
 * genera ninguna imagen: reusa el avatar y la foto del producto que la sesión ya tiene.
 * Lo único que gasta son CUATRO renders de KIE, con la key del usuario.
 *
 *   npx tsx --env-file=.env.local scripts/probe-setting.ts <sessionId> [nLote]
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { groupIntoLotes, buildLotePrompt, camaraDeLote } from '../lib/video-ads/lotes'
import { createVideoTask, getTaskDetail, clampDuration } from '../lib/video-ads/kie'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { corteMuestraPersona, type ForensicReport } from '../lib/video-ads/forensic'
import { personajesDe } from '../lib/video-ads/personajes'

const SALIDA = process.env.PROBE_OUT ?? '/home/isasachi/.claude/jobs/29c3edaa/tmp/setting'
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * Vuelve a INSERTAR el bloque de escenario. La dirección se invirtió cuando la medición
 * ganó y el bloque salió de `buildLotePrompt`: el brazo A ya no es "lo que hace el código"
 * sino "lo que hacía", y reconstruirlo acá es lo que mantiene el probe re-corrible.
 *
 * Va justo antes de `CAMERA:`, que es donde vivía.
 */
function conEscenario(prompt: string, escenario: string): string {
  const i = prompt.indexOf('\nCAMERA:')
  if (i < 0) throw new Error('No se encontró la línea CAMERA: donde insertar el escenario')
  return `${prompt.slice(0, i)}\nSETTING AND LIGHTING: ${escenario}${prompt.slice(i)}`
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

  const { data } = await db.from('video_sessions').select('*').eq('id', id).single()
  if (!data) throw new Error(`No existe la sesión ${id}`)
  const r = data as Record<string, unknown> & { forensic_analysis: ForensicReport }
  const { data: st } = await db.from('user_settings').select('kie_api_key').eq('user_id', r.user_id as string).single()
  const key = (st as { kie_api_key?: string } | null)?.kie_api_key
  if (!key) throw new Error('El usuario no tiene key de KIE guardada')

  const adapted = AdaptedScriptSchema.parse(r.adapted)
  const f = r.forensic_analysis
  const plano = new Map(f.cortes.map((c) => [c.tiempo, String(c.camara).trim()]))
  const clase = new Map(f.cortes.map((c) => [c.tiempo, corteMuestraPersona(c)]))
  const lotes = groupIntoLotes(adapted.tomas, plano, 1, clase)

  // Por defecto el PRIMERO: es el que arranca del avatar, o sea el caso donde la imagen
  // lleva la escena de la forma más limpia. Si la escena no se sostiene ahí, no se
  // sostiene en ningún lado.
  const lote = nLote ? lotes.find((l) => l.n === nLote)! : lotes[0]
  const chars = lote.tomas.reduce((n, t) => n + t.locucion.length, 0)
  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const camara = camaraDeLote(lote, f.cortes, 'primer plano')
  const imagenes = [
    { url: r.avatar_url as string, role: 'the person' },
    { url: r.product_url as string, role: 'the product' },
  ]

  const sin = buildLotePrompt({
    lote, consistencyBlock: (r.consistency_block as string) ?? '',
    productDesc: scan.productDescription ?? '',
    camara, voz: r.voice_profile as never, movimiento: r.motion_profile as never,
    images: imagenes, cortes: f.cortes, niche: r.niche, personajes: personajesDe(r as never),
  })
  const con = conEscenario(sin, String(f.fondo ?? ''))

  console.log(`sesión ${id.slice(0, 8)} · lote ${lote.n} de ${lotes.length} · ${lote.duracionSeg}s · ${lote.tomas.length} toma(s)`)
  console.log(`escenario: "${String(f.fondo ?? '').replace(/\n/g, ' ')}"`)
  console.log(`  A (con escenario): ${con.length} caracteres${con.includes('…') ? ' ⚠️ TRUNCADO' : ''}`)
  console.log(`  B (sin escenario): ${sin.length} caracteres — libera ${con.length - sin.length}\n`)
  await mkdir(SALIDA, { recursive: true })
  await writeFile(`${SALIDA}/prompt-A.txt`, con)
  await writeFile(`${SALIDA}/prompt-B.txt`, sin)

  // Cuatro renders cuestan plata: `PROBE_DRY=1` deja ver los dos prompts antes de gastarlos.
  if (process.env.PROBE_DRY) { console.log('PROBE_DRY: prompts escritos, no se creó ninguna tarea.'); return }

  const dur = clampDuration(lote.duracionSeg, chars, lote.tomas.length)
  // ⚠️ DOS DRAWS POR BRAZO. Con uno solo se mide el seed y no el prompt — es la lección
  // del probe del cap de 30, donde el segundo draw fue el que hizo el caso.
  const brazos = [['A1', con], ['A2', con], ['B1', sin], ['B2', sin]] as const

  const tareas = await Promise.all(brazos.map(async ([et, prompt]) => {
    const taskId = await createVideoTask(
      { images: imagenes, prompt, durationSec: dur, locucionChars: chars, tomas: lote.tomas.length }, key)
    console.log(`  ${et}: tarea ${taskId}`)
    return [et, taskId] as const
  }))

  for (const [et, taskId] of tareas) {
    const url = await esperar(taskId, key, et)
    if (!url) continue
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer())
    await writeFile(`${SALIDA}/${et}.mp4`, bytes)
    console.log(`  ${et}: ${SALIDA}/${et}.mp4`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
