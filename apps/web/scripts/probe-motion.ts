/**
 * ¿GEMINI DEVUELVE UNA MÁQUINA DE ESTADOS, O PROSA DISFRAZADA DE SCHEMA?
 *
 * Es LA pregunta del upgrade V2 y no se puede responder leyendo código: el schema acepta
 * cualquier string, así que un timeline con los campos llenos pero sin encadenar pasa el
 * `parse` y no preserva nada. Lo que hay que medir es si `productStateAfter` de un beat
 * es de verdad `productStateBefore` del siguiente — eso es lo que separa una estructura
 * de una descripción con más casillas.
 *
 * Se corre ANTES de cablear nada río abajo: si el modelo no produce el encadenado, todo
 * lo que dependa del timeline (anclas de pose, MOTION LOCK, carga de movimiento) se
 * construye sobre arena.
 *
 * Cuesta UN análisis forense (video → Gemini, lo paga el hub). No escribe en la base.
 *
 *   npx tsx --env-file=.env.local scripts/probe-motion.ts [sessionId]
 */
import { createClient } from '@supabase/supabase-js'
import { callVideoAds } from '../lib/video-ads/llm'
import { ForensicReportSchema, buildForensicInstruction, buildMotionRefinementInstruction, MotionRefinementSchema } from '../lib/video-ads/forensic'
import { normalizeMotionTimeline, validateMotionTimeline, objetoEnManoFromMotion, compileAccion } from '../lib/video-ads/motion'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const ID = process.argv[2] ?? '7e4ccbcf-eeac-42cd-8e22-7a56f1836e09'

async function main() {
  const { data } = await db.from('video_sessions')
    .select('reference_video_url, product_name').eq('id', ID).single()
  const url = (data as { reference_video_url: string } | null)?.reference_video_url
  if (!url) throw new Error(`La sesión ${ID} no tiene video de referencia`)
  console.log(`sesión ${ID.slice(0, 8)} — ${(data as { product_name: string }).product_name}\n`)

  const r = await callVideoAds('forensic_report', ForensicReportSchema, [
    { fileData: { fileUri: url, mimeType: 'video/mp4' } },
    { text: buildForensicInstruction() },
  ])

  // ── PASE 2: el refinamiento dedicado. Lo que se mide es si una llamada que SOLO hace
  // movimiento rompe el techo de contenido por respuesta del pase general.
  const densidad = (rep: typeof r) => rep.cortes.map((c) => c.motion?.beats?.length ?? 0)
  const antes = densidad(r)
  console.log(`beats por corte — pase 1 (general): [${antes.join(', ')}]`)

  const ref = await callVideoAds('motion_refinement', MotionRefinementSchema, [
    { fileData: { fileUri: url, mimeType: 'video/mp4' } },
    { text: buildMotionRefinementInstruction(r.cortes) },
  ])
  const porN = new Map(ref.cortes.map((c) => [c.n, c.motion]))
  for (const c of r.cortes) {
    const m = porN.get(c.n)
    if (m && m.beats.length) c.motion = m
  }
  const porVideo = densidad(r)
  console.log(`beats por corte — pase 2 (dedicado, 1 llamada/video): [${porVideo.join(', ')}]`)

  let conMotion = 0
  let beatsTot = 0
  let rotas = 0
  let sinFrame = 0

  for (const c of r.cortes) {
    console.log(`━━ corte ${c.n} [${c.tiempo}] ${c.duracionSeg}s`)
    if (!c.motion) { console.log('   ⚠️ SIN motion\n'); continue }
    conMotion++
    const tl = normalizeMotionTimeline(c.motion, c.duracionSeg)
    const issues = validateMotionTimeline(tl)
    beatsTot += tl.beats.length
    rotas += issues.length
    sinFrame += tl.beats.filter((b) => !b.referenceFrameMs).length

    console.log(`   beats ${tl.beats.length} (major ${tl.majorBeatCount}, ${tl.majorBeatsPerSecond}/s) · transiciones de producto ${tl.productStateTransitionCount}`)
    console.log(`   startState: ${tl.startState.bodyPose} | producto: ${tl.startState.productState}`)
    for (const b of tl.beats) {
      console.log(`   · [${b.startSec}–${b.endSec}s @${b.referenceFrameMs}ms] ${b.importance.padEnd(10)} L:${b.leftHand || '—'} | R:${b.rightHand || '—'}`)
      console.log(`       producto: "${b.productStateBefore}" → "${b.productStateAfter}"`)
    }
    console.log(`   endState: ${tl.endState.bodyPose} | producto: ${tl.endState.productState}`)
    if (issues.length) for (const i of issues) console.log(`   ❌ ${i.beat}: ${i.motivo}`)
    else console.log('   ✅ la cadena de estados del producto encadena entera')
    const der = objetoEnManoFromMotion(tl)
    console.log(`   objetoEnMano derivado: ${der ? `${der.inicio} → ${der.fin}${der.accesorios ? ` (${der.accesorios})` : ''}` : '—'}`)
    console.log(`   accion compilada: ${compileAccion(tl).slice(0, 150)}\n`)
  }

  console.log('════════════════════════════════════════')
  console.log(`cortes con timeline      : ${conMotion} de ${r.cortes.length}`)
  console.log(`beats totales            : ${beatsTot}`)
  console.log(`eslabones rotos          : ${rotas}`)
  console.log(`beats sin referenceFrameMs: ${sinFrame}`)
  console.log(`\naccion (resumen del modelo, corte 1): ${r.cortes[0]?.accion?.slice(0, 120)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
