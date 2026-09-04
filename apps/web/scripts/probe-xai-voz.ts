/**
 * ¿ALGUNA VOZ PRESET DE xAI HABLA ESPAÑOL LATINO?
 *
 * Es la única pregunta abierta que decide si xAI directo aporta algo. `reference_audios` con
 * voz preset es lo único que xAI ofrece y KIE no expone; si ninguna voz habla español, muere
 * para este pipeline y con eso casi todo el caso del provider.
 *
 * ⚠️ LO QUE ESTE PROBE **NO** MIDE, a propósito: si xAI ejecuta la coreografía desde texto.
 * `/v1/videos/generations` NO tiene `reference_videos` — reference-to-video es texto+imágenes,
 * o sea el BRAZO A del experimento de motores, que ya falló en ~15 renders. Volver a medirlo
 * sería pagar por re-confirmar un resultado cerrado.
 *
 * ⚠️ EL TTS NO SIRVE PARA PROBAR ESTO BARATO: `POST /v1/audio/speech` devuelve
 * `403 "Team is not authorized to perform this action"` con esta key. El roster solo se puede
 * oír generando video, así que cuesta $0,08 por segundo de salida.
 *
 * Por eso la duración es el mínimo que deja oír una frase, no la del tramo real: se necesita
 * UN segundo de habla, no la locución entera.
 *
 *   npx tsx --env-file=.env.local scripts/probe-xai-voz.ts            # canarios + 1 voz
 *   XAI_VOCES=celeste,luna,carina  ... scripts/probe-xai-voz.ts       # varias
 *   XAI_SOLO_CANARIO=1             ... scripts/probe-xai-voz.ts       # gratis, no genera
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { transcribir, cobertura } from './probe-audio-espanol'
import { download, createStrip } from './probe-video-motores'

const BASE = 'https://api.x.ai'
const MODEL = 'grok-imagine-video-1.5'
const KEY = process.env.XAI_API_KEY
// El usuario paga $0,08 por segundo de SALIDA y pidió 480p siempre.
const SEG = Number(process.env.XAI_SEG ?? 3)
const USD_POR_SEG = 0.08
const OUT = process.env.XAI_OUT ?? `${process.env.HOME}/Downloads/xai-voz`

// La frase tiene que caber en SEG a ritmo conversacional (~16 car/s) o el clip la corta y el
// oráculo castiga un recorte que no es culpa de la voz.
const FRASE = process.env.XAI_FRASE ?? 'Este suero cambió mi piel.'

interface Rta { status: number; body: Record<string, unknown> }

async function xai(ruta: string, body?: unknown, metodo = 'POST'): Promise<Rta> {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120_000),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

function pedido(voz: string, duration: number) {
  return {
    model: MODEL,
    // La locución va en el PROMPT (la voz solo aporta el timbre), igual que en seedance y grok.
    prompt: `A woman looks at the camera and says out loud, in Latin American Spanish, verbatim and nothing else: "${FRASE}". She speaks with the voice of <AUDIO_0>. Plain background. No on-screen text, captions or watermarks.`,
    reference_audios: [{ voice_id: voz }],
    duration,
    aspect_ratio: '9:16',
    resolution: '480p',
  }
}

/**
 * Los canarios son GRATIS porque xAI valida antes de despachar — pero cada uno enmascara al
 * siguiente (con `duration` inválida ya no evalúa la voz), así que van de a uno.
 * ⚠️ El conteo de IMÁGENES no es canario: 4 `reference_images` despacharon y la tarea murió
 * con la cuota tomada. Los assets se validan DESPUÉS de crear la tarea.
 */
async function canarios(voz: string): Promise<boolean> {
  // 1. duration fuera de rango → el error nombra el rango permitido.
  const a = await xai('/v1/videos/generations', pedido(voz, 999))
  console.log(`  duration 999 → ${a.status} ${JSON.stringify(a.body).slice(0, 200)}`)
  if (a.status < 400) { console.log('  ❌ despachó una duración imposible: el canario no existe, ABORTA'); return false }

  // 2. voz inexistente, con duración VÁLIDA → si vuelve el roster, la forma de
  //    `reference_audios` y el `resolution: 480p` pasaron la validación.
  const b = await xai('/v1/videos/generations', pedido('no_existe_esta_voz', SEG))
  const txt = JSON.stringify(b.body)
  console.log(`  voz inválida  → ${b.status} ${txt.slice(0, 300)}`)
  if (b.status < 400) { console.log('  ❌ despachó con una voz inexistente — CANCELA la tarea a mano'); return false }
  if (!txt.includes(voz)) console.log(`  ⚠️ el roster del error no menciona "${voz}" — puede no existir`)
  return true
}

async function generar(voz: string): Promise<string | null> {
  const { status, body } = await xai('/v1/videos/generations', pedido(voz, SEG))
  const id = (body.request_id ?? body.id) as string | undefined
  if (status >= 400 || !id) { console.log(`  ✗ ${voz}: ${status} ${JSON.stringify(body).slice(0, 300)}`); return null }
  console.log(`  ${voz}: request_id ${id} — pagando ${SEG} s ≈ $${(SEG * USD_POR_SEG).toFixed(2)}`)

  const limite = Date.now() + 15 * 60_000
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 10_000))
    const { body: p } = await xai(`/v1/videos/${id}`, undefined, 'GET')
    const st = p.status as string | undefined
    // ⚠️ EL ESTADO TERMINAL ES `done` — medido, no documentado. Con solo `completed`/
    // `succeeded` el polling agota su plazo sobre un video que estaba listo y COBRADO.
    if (st === 'done' || st === 'completed' || st === 'succeeded') {
      const url = (p.video as { url?: string } | undefined)?.url
      if (url) return url
      console.log(`  ✗ ${voz}: terminó sin URL — ${JSON.stringify(p).slice(0, 300)}`); return null
    }
    if (st === 'failed' || st === 'canceled') { console.log(`  ✗ ${voz}: ${JSON.stringify(p).slice(0, 300)}`); return null }
    process.stdout.write('.')
  }
  console.log(`  ✗ ${voz}: se agotó el plazo (request_id ${id})`)
  return null
}

async function main() {
  if (!KEY) throw new Error('falta XAI_API_KEY')
  const voces = (process.env.XAI_VOCES ?? 'celeste').split(',').map((v) => v.trim()).filter(Boolean)
  await mkdir(OUT, { recursive: true })

  console.log(`\nfrase: "${FRASE}" (${FRASE.length} car en ${SEG} s = ${(FRASE.length / SEG).toFixed(1)} car/s)`)
  console.log(`voces: ${voces.join(', ')} · costo si generan todas: $${(voces.length * SEG * USD_POR_SEG).toFixed(2)}\n`)

  console.log('CANARIOS (gratis)')
  if (!(await canarios(voces[0]))) return
  console.log('  ✅ la forma del pedido y 480p pasan la validación\n')
  if (process.env.XAI_SOLO_CANARIO) { console.log('XAI_SOLO_CANARIO: no se genera nada'); return }

  // La transcripción va por KIE con la key del USUARIO (BYOK), igual que el resto de los probes.
  // ⚠️ Se pasa por env y no se lee de `user_settings`: este probe no tiene sesión de la que
  // colgar un user_id, y la key es del usuario — inventarle un dueño sería peor.
  if (!process.env.KIE_API_KEY) throw new Error('falta KIE_API_KEY (la key BYOK del usuario) para transcribir')

  console.log('GENERANDO')
  for (const voz of voces) {
    const url = await generar(voz)
    if (!url) continue
    const mp4 = `${OUT}/${voz}.mp4`
    await download(url, mp4)
    await createStrip(mp4, `${OUT}/${voz}-frames.jpg`, SEG)
    // ⚠️ Se transcribe el ARCHIVO LOCAL, no la URL de xAI: esa URL puede estar firmada y
    // Gemini no la podría bajar — el síntoma sería un error de KIE que se lee como "falló el
    // test". Un clip de 3 s a 480p pesa poco y entra inline; la URL queda de respaldo por si
    // algún día el clip crece (medido: 2,4 MB ya no entra).
    const { dicho, idioma } = await transcribir(mp4).catch(() => transcribir(url))
    const cob = cobertura(FRASE, dicho)
    console.log(`\n  ${voz}`)
    console.log(`    dicho:  ${dicho.replace(/\n/g, ' ')}`)
    console.log(`    idioma: ${idioma}`)
    // ⚠️ "NO HABLÓ" Y "HABLÓ MAL" SON RESPUESTAS OPUESTAS y colapsarlas en un ❌ hace
    // concluir de más: un clip mudo es un artefacto del test (3 s puede no alcanzar para que
    // arranque), y se responde con UN reintento más largo, no dando la voz por perdida.
    const mudo = dicho.replace(/\[\?\]/g, '').trim().length < 4
    console.log(`    cobertura: ${(cob * 100).toFixed(0)}% · ${mudo ? '⚠️ NO HABLÓ — reintentá con XAI_SEG=6 antes de concluir' : cob >= 0.9 ? '✅ dice la frase' : cob >= 0.6 ? '⚠️ a medias' : '❌ habla, pero no dice la frase'}`)
    await writeFile(`${OUT}/${voz}.txt`, `esperado: ${FRASE}\ndicho: ${dicho}\nidioma: ${idioma}\ncobertura: ${cob}\n`)
  }
  // ⚠️ IMPRIME ADEMÁS DE PUNTUAR: el veredicto real es ESCUCHAR el clip. Un acento no lo mide
  // la transcripción — un español ibérico o de robot da 100% de cobertura igual.
  console.log(`\nclips en ${OUT} — ESCUCHALOS: la cobertura no mide el acento.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
