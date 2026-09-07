/**
 * Re-corre el FORENSE sobre el video de una sesión y mira lo que el diseño estructural
 * necesita: hechos con ventana de tiempo que cubran cada corte, y la cámara declarando su
 * movimiento. Sin `--write` no toca la base. Con `--write` persiste el análisis nuevo
 * (normalizado y recronometrado como la ruta) — ⚠️ desincroniza el guion: después hay
 * que re-extraer la plantilla y re-adaptar en el wizard.
 *
 *   npx tsx --env-file=.env.local scripts/probe-forense-hechos.ts <sesion> [--write]
 */
import { createClient } from '@supabase/supabase-js'
import type { Part } from '@google/genai'
import { geminiCallStructured, geminiEsDirecto } from '@/lib/gemini'
import { VIDEO_SYSTEM_PROMPT } from '@/lib/video-ads/llm'
import { buildForensicInstruction, normalizarHechos, repairCutTiming, MIN_VISIBLE_SEG, type ForensicReport } from '@/lib/video-ads/forensic'
import { ForensicReportSchema } from '@/lib/video-ads/types'
import { fetchAsBase64, headStorageFile } from '@/lib/storage'
import { MAX_VIDEO_MB } from '@/lib/video-ads/limits'

async function main() {
  const [sesion, flag] = process.argv.slice(2)
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db.from('video_sessions').select('reference_video_url').eq('id', sesion).single()
  if (error || !data?.reference_video_url) throw new Error(`sesión sin video: ${error?.message}`)
  const url = data.reference_video_url as string

  const { mimeType } = await headStorageFile(url, MAX_VIDEO_MB * 1024 * 1024)
  const parts: Part[] = [
    geminiEsDirecto() ? { inlineData: await fetchAsBase64(url, MAX_VIDEO_MB * 1024 * 1024) } : { fileData: { fileUri: url, mimeType } },
    { text: buildForensicInstruction() },
  ]
  // El forense es ESTOCÁSTICO: un sorteo vuelve con dos hechos por corte y el siguiente
  // con uno solo (varias cláusulas adentro) y sin decir dónde queda el frasco. Un corte de
  // más de 8 s con un solo hecho es la firma del colapso; no se persiste, se vuelve a tirar.
  let crudo!: ForensicReport
  for (let intento = 1; intento <= 3; intento++) {
    crudo = await geminiCallStructured('forensic_report', ForensicReportSchema, parts, 3, VIDEO_SYSTEM_PROMPT)
    const colapsados = crudo.cortes.filter((c: ForensicReport['cortes'][number]) => c.duracionSeg > 8 && (c.hechos?.length ?? 0) < 2)
    if (!colapsados.length || flag !== '--write') break
    console.log(`intento ${intento}: ${colapsados.length} corte(s) largos con un solo hecho (${colapsados.map((c: ForensicReport['cortes'][number]) => c.n).join(', ')}) — se vuelve a tirar`)
  }
  crudo.caracteresGuion = crudo.guionOriginal.length
  const { report: normalizado, rellenos } = normalizarHechos(crudo)
  const { report, ajustes } = repairCutTiming(normalizado, MIN_VISIBLE_SEG)

  let sinHechos = 0, conMovimiento = 0
  for (const c of report.cortes) {
    const crudoC = crudo.cortes.find((x) => x.n === c.n)
    const mov = /^(fija|en mano|paneo|zoom|desplazamiento|estática|estatica|handheld)/i.test(c.camara.trim())
    if (mov) conMovimiento++
    if (!crudoC?.hechos?.length) sinHechos++
    console.log(`\n[${c.n}] ${c.tiempo} · ${c.duracionSeg.toFixed(1)} s · cámara: ${c.camara}${mov ? '' : '   ⚠️ sin movimiento declarado'}`)
    console.log(`    diálogo: ${c.dialogo.slice(0, 90)}${c.dialogo.length > 90 ? '…' : ''}`)
    for (const h of c.hechos) console.log(`    ${h.desde.toFixed(1).padStart(5)}–${h.hasta.toFixed(1).padEnd(5)} ${h.texto}`)
    if (!crudoC?.hechos?.length) console.log(`    ⚠️ el modelo no devolvió hechos; accion: ${c.accion}`)
  }
  console.log(`\ncortes ${report.cortes.length} · con hechos ${report.cortes.length - sinHechos} · cámara con movimiento ${conMovimiento}/${report.cortes.length}`)
  console.log(`rellenos por hueco: ${rellenos.length}${rellenos.length ? '\n  ' + rellenos.join('\n  ') : ''}`)
  console.log(`recronometrados: ${ajustes.length}`)

  if (flag !== '--write') { console.log('\n(seco: sin --write no se escribe)'); return }
  if (sinHechos) throw new Error(`no se escribe: ${sinHechos} cortes sin hechos`)
  const { error: e2 } = await db.from('video_sessions').update({ forensic_analysis: report }).eq('id', sesion)
  if (e2) throw e2
  console.log('\n✅ forensic_analysis escrito. Ahora: paso Plantilla → "Extraer otra vez" → re-adaptar el guion → render.')
}
main().catch((e) => { console.error(e); process.exit(1) })
