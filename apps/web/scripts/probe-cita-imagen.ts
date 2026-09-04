/**
 * ¿LA LEYENDA `@image(n)` ARRIBA ATA LA IMAGEN A SU ROL, O HAY QUE CITARLA DENTRO DE LA CLÁUSULA?
 *
 * El agente explorador trajo que `@image1` es sintaxis de UI/reseller y que la API de xAI cita
 * las referencias como `<IMAGE_n>` **dentro de la frase** ("The woman from <IMAGE_1>… the shirt
 * from <IMAGE_2>"). Este repo hace lo contrario: declara una leyenda en la primera línea
 * (`References: @image(1) = the person · @image(2) = the product`) y después **no la vuelve a
 * nombrar nunca** en el cuerpo.
 *
 * ⚠️ LA VARIABLE REAL NO ES EL TOKEN, ES DÓNDE SE CITA — y hay que leerlo así. Por KIE el
 * prompt es texto libre que se le reenvía a grok: ni `@image(2)` ni `<IMAGE_2>` los parsea
 * ningún deserializador, los dos son palabras. Cambiar solo el token sería casi seguro un
 * no-op con dos imágenes, porque persona y producto se distinguen solas por contenido. Lo que
 * puede mover la aguja es que el rol viaje PEGADO a la descripción que lo usa. El brazo B
 * cambia las dos cosas a la vez (token + ubicación) porque ésa es la forma que xAI documenta;
 * si B gana, lo que queda por aislar es cuál de las dos mitades lo hizo.
 *
 * Qué se lee en la tira de fotogramas, en este orden:
 *   1. ¿el frasco es el del usuario (etiqueta, forma) o uno genérico?
 *   2. ¿la persona es la del avatar?
 *   3. ¿el producto aparece FLOTANDO a pantalla completa? — el síntoma documentado de que los
 *      roles no atan, y el que motivó la línea "never as a floating cut-out".
 *
 * **DOS DRAWS POR BRAZO** (4 renders). Es la regla que este repo se impuso tras el probe del
 * cap de 30 y la que le faltó a las tres rondas que se perdieron por n=1. `PROBE_DRAWS=1`
 * existe para mirar el prompt, no para concluir.
 *
 * ⚠️ No toca la cuota del hub, no escribe en la base y no genera ninguna imagen: reusa el
 * avatar y la foto del producto que la sesión ya tiene. Gasta renders de KIE con la key del
 * usuario.
 *
 *   PROBE_DRY=1 npx tsx --env-file=.env.local scripts/probe-cita-imagen.ts <sessionId> [nLote]
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { groupIntoLotes, buildLotePrompt, camaraDeLote } from '../lib/video-ads/lotes'
import { createVideoTask, getTaskDetail, clampDuration } from '../lib/video-ads/kie'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { type ForensicReport } from '../lib/video-ads/forensic'
import { personajesDe } from '../lib/video-ads/personajes'
import { nicheSpec } from '../lib/video-ads/niches'
import { createStrip } from './probe-video-motores'

const SALIDA = process.env.PROBE_OUT ?? `${process.env.HOME}/Downloads/probe-cita-imagen`
const DRAWS = Number(process.env.PROBE_DRAWS ?? 2)
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * Brazo B: `@image(n)` → `<IMAGE_n>`, y el rol citado DENTRO de la cláusula que lo usa.
 *
 * Es una reescritura mecánica sobre el prompt real, no un prompt paralelo: así el diff entre
 * los dos brazos es exactamente esto y nada más. Si alguna sustitución no encuentra su
 * objetivo, LANZA — un brazo B que resultó ser idéntico a A mediría el seed y reportaría
 * "sin diferencia", que es el peor resultado posible de un experimento pagado.
 */
export function citaEnLaClausula(prompt: string, productBlock: string): string {
  let p = prompt
  const exigir = (antes: string, despues: string, que: string) => {
    if (antes === despues) throw new Error(`El brazo B no cambió nada en: ${que}`)
  }

  // 1. La leyenda cambia de token pero se queda: es lo que dice CUÁL imagen es cuál.
  const conToken = p.replace(/@image\((\d+)\)/g, '<IMAGE_$1>')
  exigir(p, conToken, 'la leyenda @image(n)')
  p = conToken

  // 2. El personaje cita su imagen. Con varios personajes el prompt dice `Character P1: …`
  //    y ahí no hay un mapeo imagen→personaje en esta función: se deja como está.
  const conPersona = p.replace(/^Character: /m, 'Character — the person from <IMAGE_1>: ')
  // 3. El producto cita la suya. El rótulo lo pone el nicho (`spec.productBlock`).
  const rotulo = productBlock.replace(/:\s*$/, '')
  const conProducto = conPersona.replace(
    new RegExp(`^${rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: `, 'm'),
    `${rotulo} — the product from <IMAGE_2>: `,
  )
  exigir(conPersona, conProducto, `el bloque de producto ("${rotulo}")`)
  // Con un solo personaje la sustitución 2 es obligatoria; con varios, el prompt no la trae.
  if (conPersona === p && /^Character: /m.test(prompt)) throw new Error('El brazo B no cambió el bloque de personaje')
  return conProducto
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
  const camara = camaraDeLote(lote, f.cortes, 'primer plano')
  const imagenes = [
    { url: r.avatar_url as string, role: 'the person' },
    { url: r.product_url as string, role: 'the product' },
  ]

  const A = buildLotePrompt({
    lote, consistencyBlock: (r.consistency_block as string) ?? '',
    productDesc: scan.productDescription ?? '',
    camara, voz: r.voice_profile as never, movimiento: r.motion_profile as never,
    images: imagenes, cortes: f.cortes, niche: r.niche, personajes: personajesDe(r as never),
  })
  const B = citaEnLaClausula(A, nicheSpec(r.niche).productBlock)

  console.log(`sesión ${id.slice(0, 8)} · lote ${lote.n} de ${lotes.length} · ${lote.duracionSeg}s · ${lote.tomas.length} toma(s)`)
  console.log(`  A (leyenda @image(n) arriba): ${A.length} caracteres`)
  console.log(`  B (<IMAGE_n> citado en la cláusula): ${B.length} caracteres`)
  console.log('\n  --- lo único que cambia ---')
  const lineasA = A.split('\n')
  const lineasB = B.split('\n')
  lineasA.forEach((la, i) => { if (la !== lineasB[i]) console.log(`  - ${la}\n  + ${lineasB[i]}`) })
  console.log()

  await mkdir(SALIDA, { recursive: true })
  await writeFile(`${SALIDA}/prompt-A.txt`, A)
  await writeFile(`${SALIDA}/prompt-B.txt`, B)

  if (process.env.PROBE_DRY) { console.log('PROBE_DRY: prompts escritos, no se creó ninguna tarea.'); return }

  const dur = clampDuration(lote.duracionSeg, chars, lote.tomas.length)
  // ⚠️ DOS DRAWS POR BRAZO. Con uno solo se mide el seed y no el prompt.
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

if (process.argv[1]?.endsWith('probe-cita-imagen.ts')) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
