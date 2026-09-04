/**
 * RE-CORRE EL ANÁLISIS FORENSE DE UNA SESIÓN YA GUARDADA.
 *
 * ⚠️ EXISTE PORQUE ESTE REPO REPITE UNA FRASE: *"solo alcanza a análisis NUEVOS"*. Cada
 * arreglo del prompt de FASE 1 —el paso caro— deja atrás a toda sesión ya analizada, y hasta
 * ahora la única forma de verlo era rehacer la sesión entera por el wizard.
 *
 * Replica el orden EXACTO de `analyze-reference/route.ts`, que no es negociable:
 * forense → refinamiento → normalizar el movimiento → recontar caracteres →
 * limpiar diálogos → verificar hablantes → reconciliar con la ventana → recronometrar.
 * Cualquier otro orden cambia las duraciones (ver los avisos de esa ruta).
 *
 * ⚠️ NO ESCRIBE salvo que se le pase `--write`, y antes AVISA si las ventanas de tiempo se
 * movieron: `adapted.tomas[].tiempoOriginal` se emparejó con las viejas, así que persistir un
 * corte distinto desincroniza el guión con los cortes EN SILENCIO — que es exactamente lo que
 * `repairCutTiming` evita al no tocar `tiempo`.
 *
 * Cuesta 2 llamadas de video a Gemini (las paga el hub). Sin renders.
 *
 *   npx tsx --env-file=.env.local scripts/reanalizar-forense.ts <sessionId> [--write]
 */
import { createClient } from '@supabase/supabase-js'
import { callVideoAds } from '../lib/video-ads/llm'
import {
  ForensicReportSchema, buildForensicInstruction, buildMotionRefinementInstruction,
  MotionRefinementSchema, limpiarDialogos, verificarHablantes, reconciliarConVentana,
  repairCutTiming, type ForensicReport,
} from '../lib/video-ads/forensic'
import {
  normalizeMotionTimeline, validateMotionTimeline, objetoEnManoFromMotion, compileAccion, tieneMotion,
} from '../lib/video-ads/motion'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const id = process.argv[2]
  const escribir = process.argv.includes('--write')
  if (!id) throw new Error('Falta el sessionId')

  const { data: ids } = await db.from('video_sessions').select('id')
  const completo = (ids as { id: string }[] | null)?.find((f) => f.id.startsWith(id))?.id
  if (!completo) throw new Error(`No existe la sesión ${id}`)
  const { data } = await db.from('video_sessions')
    .select('reference_video_url, forensic_analysis, adapted').eq('id', completo).single()
  const r = data as { reference_video_url: string; forensic_analysis: ForensicReport | null; adapted: { tomas: { tiempoOriginal: string }[] } | null }
  const video = r.reference_video_url
  const parte = { fileData: { fileUri: video, mimeType: 'video/mp4' } }

  console.log('forense…')
  const analysis = await callVideoAds('forensic_report', ForensicReportSchema, [parte, { text: buildForensicInstruction() }])

  if ((analysis.cortes ?? []).length) try {
    console.log('refinamiento…')
    const refinado = await callVideoAds('motion_refinement', MotionRefinementSchema, [
      parte, { text: buildMotionRefinementInstruction(analysis.cortes) },
    ])
    const porN = new Map((refinado.cortes ?? []).map((c) => [c.n, c.motion]))
    for (const c of analysis.cortes) {
      const m = porN.get(c.n)
      if (m && m.beats.length > (c.motion?.beats?.length ?? 0)) c.motion = m
    }
  } catch (err) {
    console.warn('el refinamiento falló, se conserva el del pase general —', err)
  }

  for (const c of analysis.cortes ?? []) {
    if (!tieneMotion(c)) continue
    c.motion = normalizeMotionTimeline(c.motion!, c.duracionSeg)
    const issues = validateMotionTimeline(c.motion)
    if (issues.length) console.warn(`corte ${c.n}: ${issues.map((i) => i.motivo).join(' · ')}`)
    const compilada = compileAccion(c.motion)
    if (compilada) c.accion = compilada
    const derivado = objetoEnManoFromMotion(c.motion)
    if (derivado) c.objetoEnMano = derivado
  }
  analysis.caracteresGuion = analysis.guionOriginal.length
  const { report: atribuido } = verificarHablantes(limpiarDialogos(analysis))
  const { report: conVentana } = reconciliarConVentana(atribuido)
  const { report: final } = repairCutTiming(conVentana)

  console.log(`\n${final.cortes.length} cortes · ${final.duracionTotalSeg}s`)
  for (const c of final.cortes) {
    console.log(`\n── corte ${c.n} [${c.tiempo}] ${c.duracionSeg}s · ${c.motion?.beats?.length ?? 0} beats`)
    console.log(`   accion: ${c.accion}`)
    for (const b of c.motion?.beats ?? []) {
      console.log(`     · ${b.body} | L: ${b.leftHand} | R: ${b.rightHand}`)
    }
  }

  // ⚠️ El guión adaptado se emparejó con las ventanas VIEJAS.
  const viejas = new Set((r.forensic_analysis?.cortes ?? []).map((c) => c.tiempo))
  const nuevas = new Set(final.cortes.map((c) => c.tiempo))
  const mismas = viejas.size === nuevas.size && [...viejas].every((t) => nuevas.has(t))
  const tomas = r.adapted?.tomas ?? []
  const huerfanas = tomas.filter((t) => !nuevas.has(t.tiempoOriginal)).length
  console.log(`\nventanas de tiempo: ${mismas ? 'IGUALES a las guardadas' : 'DISTINTAS'}` +
    ` · tomas del guión que se quedan sin corte: ${huerfanas} de ${tomas.length}`)

  if (!escribir) { console.log('\n(sin --write no se guardó nada)'); return }
  if (huerfanas) {
    console.log('\n⚠️ Se guarda igual, pero el guión adaptado quedó desincronizado:')
    console.log('   hay que volver al paso de plantilla y re-adaptar el guión en el wizard.')
  }
  await db.from('video_sessions').update({ forensic_analysis: final }).eq('id', completo)
  console.log('\nforensic_analysis actualizado.')
}

main().catch((e) => { console.error(e); process.exit(1) })
