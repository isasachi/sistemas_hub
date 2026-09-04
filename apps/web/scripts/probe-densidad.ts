/**
 * ¿SE PUEDE ROMPER EL TECHO DE 2-3 BEATS POR CORTE?
 *
 * Es el hallazgo que dejó la medición del CANDADO DE MOVIMIENTO: el refinamiento devuelve
 * 2 o 3 beats por corte **sin importar cuánto dure el corte** (medido en tres sesiones; un
 * corte de 20 s vuelve con 3). Con esa densidad no hay coreografía que fijar, así que la
 * palanca no es el prompt del lote sino ésta.
 *
 * Lo que se prueba es la ÚNICA táctica que ya funcionó antes en este repo para el mismo
 * techo: darle al modelo una ESTRUCTURA donde colgar las respuestas en vez de pedirle
 * "más". Con la prosa, pasar de *"describí más movimientos"* a *"describí cada tramo"*
 * subió la densidad de 0,24 a 0,39 movimientos por segundo.
 *
 *   A (control) — el prompt de refinamiento actual.
 *   B           — el mismo prompt con cada corte PRE-PARTIDO en ventanas fijas y un beat
 *                 como mínimo por ventana.
 *
 * ⚠️ B NO ES LA CUOTA QUE EL SPEC PROHÍBE. Aquélla es de MOVIMIENTO (inventar gestos que
 * el original no tiene, y que el render después ejecuta); ésta es de OBSERVACIONES: una
 * ventana quieta se responde con un beat que dice que está quieta.
 *
 * ⚠️ Y POR ESO SE MIDE TAMBIÉN EL LARGO DE CADA CASILLA. El riesgo conocido —anotado en
 * AGENTS.md antes de intentarlo— es cambiar detalle por estructura: si vuelve con nueve
 * beats de dos palabras, la estructura ganó y el contenido se perdió. Un beat vacío no
 * preserva nada.
 *
 * Cuesta: 1 forense (cacheado en disco) + 2 refinamientos por brazo. Sin renders, sin
 * imágenes, no escribe en la base.
 *
 *   npx tsx --env-file=.env.local scripts/probe-densidad.ts [sessionId] [ventanaSeg]
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { callVideoAds } from '../lib/video-ads/llm'
import {
  ForensicReportSchema, buildForensicInstruction,
  buildMotionRefinementInstruction, MotionRefinementSchema, type ForensicReport,
} from '../lib/video-ads/forensic'
import { normalizeMotionTimeline, validateMotionTimeline, type MotionBeat } from '../lib/video-ads/motion'

const SALIDA = process.env.PROBE_OUT ?? '/home/isasachi/.claude/jobs/29c3edaa/tmp/densidad'
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const mediana = (xs: number[]) => {
  if (!xs.length) return 0
  const o = [...xs].sort((a, b) => a - b)
  return o[Math.floor(o.length / 2)]
}

type Corte = ForensicReport['cortes'][number]

/** Lo que hay que mirar junto: la CUENTA y el CONTENIDO. Una sola de las dos engaña. */
function medir(cortes: Corte[]) {
  const porCorte: number[] = []
  const largos: number[] = []
  let beats = 0, rotos = 0, sinFrame = 0, seg = 0
  for (const c of cortes) {
    const n = c.motion?.beats?.length ?? 0
    porCorte.push(n)
    beats += n
    seg += c.duracionSeg
    if (!c.motion) continue
    const tl = normalizeMotionTimeline(c.motion, c.duracionSeg)
    rotos += validateMotionTimeline(tl).length
    for (const b of tl.beats as MotionBeat[]) {
      if (!b.referenceFrameMs) sinFrame++
      for (const v of [b.body, b.headAndGaze, b.leftHand, b.rightHand]) {
        const t = String(v ?? '').trim()
        if (t) largos.push(t.split(/\s+/).length)
      }
    }
  }
  return { porCorte, beats, porSegundo: seg ? beats / seg : 0, palabrasMedianas: mediana(largos), rotos, sinFrame }
}

async function refinar(video: string, cortes: Corte[], ventanaSeg: number | null): Promise<Corte[]> {
  const ref = await callVideoAds('motion_refinement', MotionRefinementSchema, [
    { fileData: { fileUri: video, mimeType: 'video/mp4' } },
    { text: buildMotionRefinementInstruction(cortes, ventanaSeg) },
  ])
  const porN = new Map((ref.cortes ?? []).map((c) => [c.n, c.motion]))
  // Copia: los brazos no pueden pisarse el reporte entre sí.
  return cortes.map((c) => ({ ...c, motion: porN.get(c.n) ?? c.motion }))
}

async function main() {
  const id = process.argv[2] ?? '7e4ccbcf'
  const ventanaSeg = Number(process.argv[3] ?? 1.5)

  const { data: ids } = await db.from('video_sessions').select('id')
  const completo = (ids as { id: string }[] | null)?.find((f) => f.id.startsWith(id))?.id
  if (!completo) throw new Error(`No existe la sesión ${id}`)
  const { data } = await db.from('video_sessions').select('reference_video_url, product_name').eq('id', completo).single()
  const video = (data as { reference_video_url: string }).reference_video_url

  await mkdir(SALIDA, { recursive: true })
  const cache = `${SALIDA}/forense-${id.slice(0, 8)}.json`
  const guardado = process.env.PROBE_FRESH ? null : await readFile(cache, 'utf8').catch(() => null)
  const base: ForensicReport = guardado ? JSON.parse(guardado) : await (async () => {
    console.log('forense…')
    const r = await callVideoAds('forensic_report', ForensicReportSchema, [
      { fileData: { fileUri: video, mimeType: 'video/mp4' } },
      { text: buildForensicInstruction() },
    ])
    await writeFile(cache, JSON.stringify(r))
    return r
  })()

  console.log(`sesión ${id.slice(0, 8)} · ${base.cortes.length} cortes · ventana ${ventanaSeg}s`)
  console.log(`duraciones: [${base.cortes.map((c) => c.duracionSeg).join(', ')}]\n`)

  // Dos draws por brazo: el modelo es estocástico y una corrida mide el sorteo.
  const brazos: [string, number | null][] = [['A1', null], ['A2', null], ['B1', ventanaSeg], ['B2', ventanaSeg]]
  for (const [etiqueta, v] of brazos) {
    const cortes = await refinar(video, base.cortes, v)
    const m = medir(cortes)
    console.log(`${etiqueta} ${v ? `(ventanas ${v}s)` : '(control)'}`)
    console.log(`  beats por corte : [${m.porCorte.join(', ')}]  total ${m.beats}  ${m.porSegundo.toFixed(2)}/s`)
    console.log(`  palabras/casilla: mediana ${m.palabrasMedianas}`)
    console.log(`  eslabones rotos : ${m.rotos}  ·  sin referenceFrameMs: ${m.sinFrame}`)
    const mas = cortes.reduce((a, c) => ((c.motion?.beats?.length ?? 0) > (a.motion?.beats?.length ?? 0) ? c : a), cortes[0])
    for (const b of (mas.motion?.beats ?? []).slice(0, 12)) {
      console.log(`    · [${b.startSec}–${b.endSec}] ${b.body} | L:${b.leftHand} | R:${b.rightHand}`)
    }
    console.log()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
