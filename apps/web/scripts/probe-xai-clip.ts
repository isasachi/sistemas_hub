/**
 * ¿LA ESTRUCTURA DE PROMPT "DE DIRECCIÓN DE TOMA" LEVANTA LA COREOGRAFÍA EN xAI DIRECTO?
 *
 * Prueba una guía de prompting para `grok-imagine-video-1.5` en reference-to-video, sobre el
 * MISMO tramo (corte 2 de `7e4ccbcf`) que ya tiene contraparte de seedance en disco.
 *
 * ⚠️ SE PRUEBA UN SUBCONJUNTO DE LA GUÍA, y hay que leerlo así:
 *   ✅ blocking físico atómico · beats en orden · CÁMARA separada del sujeto · motion qualities
 *   ❌ el bloque CINEMATOGRAPHY (85mm, bokeh, "high-end commercial skincare") y el dolly-in
 * Los dos descartados CHOCAN CON EL PRODUCTO, no con la guía: el formato es UGC —AGENTS.md
 * tiene medido que pedir estabilidad de trípode trabaja en contra y que la palabra `estable`
 * hubo que sacarla— y la cámara la copia el repo del original (`camaraDeLote`), no la inventa.
 * Con 85mm y bokeh el clip cambiaría de ESTILO y no se aprendería nada sobre la coreografía,
 * que es la variable bajo prueba.
 *
 * ⚠️ EL VEREDICTO ES EL ORDEN, NO LA ESTÉTICA. El defecto reproducible de este tramo es que
 * las acciones salen invertidas. Pass/fail: ¿hace `presenta el frasco a cámara` y DESPUÉS
 * `señala su mejilla`? Se lee en la tira de fotogramas, al lado del clip de seedance.
 *
 * ⚠️ n = 1. AGENTS.md quemó tres rondas concluyendo sobre un solo draw. Un clip que ejecute el
 * orden prueba que la guía PUEDE funcionar, no que funcione.
 *
 * 🔴 **EL PLAN SE VERIFICA CONTRA LA FUENTE ANTES DE GASTAR, NO CONTRA EL FORENSE.** La primera
 * corrida ($0,56) se hizo con el plan del forense —`presents the bottle in both hands … Luego,
 * points to her own cheek`— y al muestrear `tramo2-source.mp4` a 1,5 fps resultó estar
 * **INVERTIDO**: la fuente sube el frasco con UNA mano, se toca la mejilla con la izquierda
 * MIENTRAS lo sostiene arriba, y recién entonces lo acerca a cámara. O sea el corte 2 arrastra
 * el mismo defecto de FASE 1 que ya obligó a escribir a mano los planes de los cortes 1, 4b y 5;
 * nadie lo había contrastado porque el clip de seedance salía bien — pero salía bien porque
 * copia el VIDEO, no el plan. Ese clip midió obediencia al prompt, no fidelidad al original.
 * El comando es una línea y es gratis:
 *   ffmpeg -i tramoN-source.mp4 -vf "fps=1.5,scale=200:-1,tile=6x2" -frames:v 1 fuente.jpg
 *
 * ⚠️ Y LA PROPUESTA FINAL DE LA GUÍA YA ESTÁ CERRADA ACÁ: su `LEFT_HAND: {trajectory, velocity,
 * deceleration_near_target}` es el MotionTimeline de V2 — construido, medido y REVERTIDO,
 * porque coser la frase desde cuatro casillas producía un inventario y la oración redactada le
 * ganó. No lo reconstruyas desde esta guía.
 *
 *   npx tsx --env-file=.env.local scripts/probe-xai-clip.ts        # $0,56
 *   XAI_DRY=1 ... scripts/probe-xai-clip.ts                        # imprime el prompt, no gasta
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { transcribir, cobertura } from './probe-audio-espanol'
import { download, createStrip } from './probe-video-motores'

const BASE = 'https://api.x.ai'
const MODEL = 'grok-imagine-video-1.5'
const KEY = process.env.XAI_API_KEY
const SEG = Number(process.env.XAI_SEG ?? 7)
const OUT = process.env.XAI_OUT ?? `${process.env.HOME}/Downloads/xai-clip`
const NOMBRE = process.env.XAI_NOMBRE ?? 'tramo2-xai'

// Tramo 2 de la sesión 7e4ccbcf, tal como lo tiene la base (7 s).
const AVATAR = 'https://hryygojgihqazsmnduvh.supabase.co/storage/v1/object/public/ad-uploads/7e4ccbcf-eeac-42cd-8e22-7a56f1836e09/avatar-P1.png?v=1788391983442'
const PRODUCTO = 'https://hryygojgihqazsmnduvh.supabase.co/storage/v1/object/public/ad-uploads/7e4ccbcf-eeac-42cd-8e22-7a56f1836e09/product.jpg?v=1788391856564'
const LOCUCION = process.env.XAI_LOCUCION ?? 'Si tú también estás entrando a los 30 como yo, es momento de empezar a implementar este tipo de sueros a tu rutina.'
const CAMARA = process.env.XAI_CAMARA ?? 'Medium close-up; camera at eye level.'
// `carina` es voz de mujer joven (catálogo verificado), coherente con el avatar de 30 años.
const VOZ = process.env.XAI_VOZ ?? 'carina'

/**
 * El plan, VERIFICADO CONTRA `tramo2-source.mp4` fotograma a fotograma (no contra el forense,
 * que lo tiene invertido). Se sobreescribe con XAI_ACCIONES para probar otro tramo.
 */
const ACCIONES = process.env.XAI_ACCIONES ?? [
  'First, she speaks to the camera while gesturing with her right hand near her chest, the bottle still low and out of frame.',
  'Then, she raises the bottle with her right hand up to face level, label facing forward.',
  'Then, while still holding the bottle up with her right hand, she touches her own left cheek with the fingertips of her left hand.',
  'Finally, she brings the bottle closer to the camera with both hands, presenting it.',
].join('\n')

/** La estructura de la guía: qué se mueve, cómo se mueve y cómo se mueve la cámara, separados. */
function prompt(): string {
  return `Use the reference images to preserve identity, wardrobe and product design exactly.

SUBJECT
The woman in <IMAGE_1> is the only person in the shot: Latin woman, 30, medium build, long straight dark brown hair, dusty pink knit sweater, in a home interior with a dark wood cabinet and warm natural light.
She holds the serum bottle from <IMAGE_2>: translucent violet glass cylinder with a matte white dropper cap and a white label with black and blue text. Reproduce it exactly.

ACTION
One continuous physical movement, no cuts.

ACTION SEQUENCE — in this exact order:
${ACCIONES}

CAMERA
${CAMARA}
The camera holds its framing: no dolly, no pan, no tilt, no orbit, no reframing.
Handheld phone camera with natural micro-movement, as if propped up or held by hand.

SUBJECT MOTION
Natural acceleration and deceleration between poses; describe the transitions, not just the poses.
Realistic hand articulation and wrist rotation. Believable inertia and body weight shifts.
Natural breathing, natural blinking, small involuntary head and shoulder movement.
Hair and sweater react subtly to the body movement.
No abrupt pose changes. No frozen limbs. No exaggerated gestures.

SPOKEN LINE
She says this out loud in Latin American Spanish, verbatim and nothing else: "${LOCUCION}"
She speaks with the voice of <AUDIO_0>.

CONTINUITY
Single continuous shot. No cuts, no transitions, no time lapse, no slow motion.
Identity, wardrobe, product and room stay consistent for the whole shot.
No on-screen text, captions, subtitles, watermarks, usernames or platform UI of any kind.`
}

async function main() {
  if (!KEY) throw new Error('falta XAI_API_KEY')
  await mkdir(OUT, { recursive: true })
  const p = prompt()
  await writeFile(`${OUT}/${NOMBRE}-prompt.txt`, p)
  console.log(`\n${p}\n${'─'.repeat(70)}`)
  console.log(`prompt: ${p.length} car · ${SEG} s @480p ≈ $${(SEG * 0.08).toFixed(2)} · voz ${VOZ}`)
  if (process.env.XAI_DRY) return console.log('XAI_DRY: no se genera nada')

  if (!process.env.KIE_API_KEY) throw new Error('falta KIE_API_KEY (BYOK del usuario) para transcribir')
  const body = {
    model: MODEL, prompt: p,
    reference_images: [{ url: AVATAR }, { url: PRODUCTO }],
    reference_audios: [{ voice_id: VOZ }],
    duration: SEG, aspect_ratio: '9:16', resolution: '480p',
  }
  const res = await fetch(`${BASE}/v1/videos/generations`, {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(120_000),
  })
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const id = (j.request_id ?? j.id) as string | undefined
  if (!id) throw new Error(`no despachó: ${res.status} ${JSON.stringify(j).slice(0, 400)}`)
  console.log(`request_id ${id} — pagado`)

  const limite = Date.now() + 20 * 60_000
  let url = ''
  while (Date.now() < limite && !url) {
    await new Promise((r) => setTimeout(r, 10_000))
    const q = await fetch(`${BASE}/v1/videos/${id}`, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(60_000) })
    const d = (await q.json().catch(() => ({}))) as Record<string, unknown>
    const st = d.status as string | undefined
    // ⚠️ El estado terminal es `done` — medido, no documentado.
    if (st === 'done' || st === 'completed' || st === 'succeeded') url = (d.video as { url?: string })?.url ?? ''
    else if (st === 'failed' || st === 'canceled') throw new Error(JSON.stringify(d).slice(0, 400))
    else process.stdout.write('.')
  }
  if (!url) throw new Error(`plazo agotado (request_id ${id})`)

  const mp4 = `${OUT}/${NOMBRE}.mp4`
  await download(url, mp4)
  await createStrip(mp4, `${OUT}/${NOMBRE}-frames.jpg`, SEG)
  const { dicho, idioma } = await transcribir(mp4).catch(() => transcribir(url))
  const cob = cobertura(LOCUCION, dicho)
  console.log(`\n  locución: ${(cob * 100).toFixed(0)}% · idioma: ${idioma}`)
  console.log(`  dicho: ${dicho.replace(/\n/g, ' ')}`)
  console.log(`\n${OUT} — EL VEREDICTO ES EL ORDEN: ¿presenta el frasco y DESPUÉS señala la mejilla?`)
  console.log('  Miralo en la tira, al lado del clip de seedance del mismo tramo. n = 1.')
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
