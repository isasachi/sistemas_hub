/**
 * PASO 0 DEL CABLEADO DE WAN: ¿honra la emisión REAL de `buildLotePrompt`?
 *
 * El render que abrió esta puerta se hizo desde el wizard con un prompt escrito A MANO, con
 * bloques `【0.0–4.0 s】`. El pipeline emite otra forma (`Toma N — X segundos` + lista numerada).
 * Que Wan ejecute LA NUESTRA no está medido, y la respuesta decide el tamaño del trabajo: si la
 * ejecuta, el cableado es de transporte; si no, hay que portar la plantilla y eso arrastra huella.
 *
 * ⚠️ EL BED ES UN DUELO DIRECTO, no un lote cualquiera. El lote 1 de `520c9169` tiene el plan
 * CORRECTO —su forense dice *"She releases one drop of serum onto her left cheek with the
 * dropper"*— y está VERIFICADO que grok lo falló: su clip pagado muestra a la mujer sosteniendo
 * el frasco y hablando, sin sacar el gotero. Mismo prompt, mismas imágenes, otro motor.
 *
 * ⚠️ El clip de referencia va MUDO (`-an`), medido en el experimento de motores.
 *
 *   npx tsx --env-file=.env.local scripts/probe-wan.ts <prefijo-de-sesion> [nLote]
 *   PROBE_DRY=1 …  → escribe el prompt y el body, no crea ninguna tarea (gratis)
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { groupIntoLotes, buildLotePrompt, camaraDeLote } from '../lib/video-ads/lotes'
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { enProsa, type ForensicReport } from '../lib/video-ads/forensic'
import { tieneMotion } from '../lib/video-ads/motion'
import { personajesDe, hablantesPorTiempo, vozEnOffPorTiempo } from '../lib/video-ads/personajes'
import { clampDuration, getTaskDetail, buildTaskBody, MOTOR } from '../lib/video-ads/kie'
import { tramosDeLotes, cortarTramos } from '../lib/video-ads/tramo'
import { createStrip } from './probe-video-motores'
import { uploadToStorage } from '../lib/storage'

const SALIDA = process.env.PROBE_OUT ?? `${process.env.HOME}/Downloads/probe-wan`
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function saldo(key: string): Promise<number> {
  const j = await (await fetch('https://api.kie.ai/api/v1/chat/credit', {
    headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000),
  })).json()
  return (j as { data: number }).data
}

async function main() {
  const pref = process.argv[2] ?? '520c9169'
  const nLote = Number(process.argv[3] ?? 1)
  const { data, error } = await db.from('video_sessions').select('*').not('adapted', 'is', null)
  if (error) { console.error('ERROR:', error); return }
  const r = (data ?? []).find((x) => (x as { id: string }).id.startsWith(pref)) as
    (Record<string, unknown> & { forensic_analysis: ForensicReport }) | undefined
  if (!r) throw new Error(`no hay sesión que empiece con ${pref}`)

  const adapted = AdaptedScriptSchema.parse(r.adapted)
  const f = r.forensic_analysis
  const cortes = f?.cortes ?? []
  const motionPorTiempo = new Map(cortes.filter(tieneMotion).map((c) => [c.tiempo, c.motion!] as const))
  const lote = groupIntoLotes(adapted.tomas, motionPorTiempo).find((l) => l.n === nLote)
  if (!lote) throw new Error(`la sesión no tiene lote ${nLote}`)
  const chars = lote.tomas.reduce((n, t) => n + t.locucion.length, 0)
  const scan = (r.product_scan ?? {}) as { productDescription?: string }
  const gente = personajesDe(r as never)
  const images = [
    { url: r.avatar_url as string, role: 'la persona' },
    { url: r.product_url as string, role: 'el producto' },
  ]
  // LA EMISIÓN REAL DEL PIPELINE, sin tocar una coma. Es lo que se está midiendo.
  const prompt = buildLotePrompt({
    lote,
    consistencyBlock: (r.consistency_block as string) ?? '',
    productDesc: scan.productDescription ?? '',
    camara: camaraDeLote(lote, cortes),
    escenario: enProsa(f?.fondo),
    voz: r.voice_profile as never,
    movimiento: r.motion_profile as never,
    images, cortes, niche: r.niche, personajes: gente,
    quien: hablantesPorTiempo(cortes, gente),
    vozEnOff: vozEnOffPorTiempo(cortes),
  })

  // EL MISMO CAMINO QUE LA RUTA: el tramo lo deriva `tramosDeLotes` y el cuerpo lo arma
  // `buildTaskBody`. Copiarlos acá haría que el probe midiera su propia copia — que es
  // exactamente cómo se descubre tarde que producción manda otra cosa.
  const dur = clampDuration(lote.duracionSeg, chars, lote.tomas.length)
  const [tramo] = tramosDeLotes([lote], () => dur)
  await mkdir(SALIDA, { recursive: true })
  await writeFile(`${SALIDA}/prompt.txt`, prompt)
  console.log(`sesión ${String(r.id).slice(0, 8)} · lote ${lote.n} · motor ${MOTOR} · salida ${dur}s` +
    ` · prompt ${prompt.length}/20000`)
  console.log(tramo
    ? `referencia: ${tramo.iniSeg}-${tramo.finSeg}s del original · presupuesto ${dur + (tramo.finSeg - tramo.iniSeg)}/30`
    : '⚠️ sin tramo de referencia: este render mide el motor SIN la señal de movimiento')

  const { data: st } = await db.from('user_settings').select('kie_api_key').eq('user_id', r.user_id as string).single()
  const key = (st as { kie_api_key?: string } | null)?.kie_api_key
  if (!key) throw new Error('el usuario no tiene key de KIE')

  // Recorte MUDO del original (`-an` obligatorio, ver `cortarTramos`) y subida al bucket.
  let refUrl: string | null = null
  const [bytes] = await cortarTramos(r.reference_video_url as string, [tramo])
  if (bytes) {
    await writeFile(`${SALIDA}/referencia.mp4`, bytes)
    // Por `uploadToStorage` y no por el cliente crudo: así la URL que se mide es la MISMA
    // forma que manda la ruta —con su `?v=<ts>` de cache-bust incluido—. Un probe que sube
    // distinto que producción mide una URL que producción no manda.
    refUrl = await uploadToStorage(String(r.id), bytes, 'video/mp4', `probe-wan-tramo-${lote.n}`)
  }

  const body = buildTaskBody({
    images, prompt, durationSec: lote.duracionSeg, locucionChars: chars, tomas: lote.tomas.length,
    referenceVideoUrl: refUrl,
  })
  await writeFile(`${SALIDA}/body.json`, JSON.stringify(body, null, 2))
  if (process.env.PROBE_DRY) { console.log(`PROBE_DRY: prompt y body en ${SALIDA}, ninguna tarea creada.`); return }

  const antes = await saldo(key)
  const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  })
  const j = await res.json() as { data?: { taskId?: string }; msg?: string }
  const taskId = j?.data?.taskId
  if (!taskId) throw new Error(`sin taskId: ${JSON.stringify(j)}`)
  console.log(`tarea ${taskId} · saldo antes ${antes}`)

  const refSeg = tramo ? tramo.finSeg - tramo.iniSeg : 0
  const limite = Date.now() + 25 * 60_000
  while (Date.now() < limite) {
    const d = await getTaskDetail(taskId, key)
    if (d.state === 'success' && d.videoUrl) {
      const mp4 = `${SALIDA}/wan.mp4`
      await writeFile(mp4, Buffer.from(await (await fetch(d.videoUrl)).arrayBuffer()))
      await createStrip(mp4, `${SALIDA}/wan.jpg`, dur)
      const despues = await saldo(key)
      console.log(`✅ listo · ${mp4}`)
      console.log(`COSTO: ${(antes - despues).toFixed(2)} créditos · salida ${dur}s · referencia ${refSeg}s`)
      // ⚠️ MEDIDO: cobra entrada+salida. Se deja impreso para que una corrida futura lo
      // vuelva a comprobar en vez de heredar el número de esta nota.
      console.log(`   solo-salida serían ${dur * 16} · entrada+salida serían ${(dur + refSeg) * 16}`)
      return
    }
    if (d.state === 'fail') throw new Error(`falló: ${d.failMsg}`)
    await new Promise((ok) => setTimeout(ok, 8000))
  }
  console.error('plazo agotado — la tarea sigue viva y YA está pagada')
}
main().catch((e) => { console.error(e); process.exit(1) })
