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
import { defectosDelForense } from '@/lib/video-ads/lotes'

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
  // Se conserva el MEJOR de los intentos (menos defectos); `--force` lo escribe aunque no
  // salga limpio. Sin `--force`, con defectos no se escribe.
  const escribir = flag === '--write' || flag === '--force'
  let crudo!: ForensicReport
  let mejor = Infinity
  for (let intento = 1; intento <= 3; intento++) {
    const tirada = await geminiCallStructured('forensic_report', ForensicReportSchema, parts, 3, VIDEO_SYSTEM_PROMPT)
    const defectos = defectosDelForense(tirada)
    if (defectos.length < mejor) { crudo = tirada; mejor = defectos.length }
    if (!defectos.length || !escribir) break
    console.log(`intento ${intento}: defectos estructurales — se vuelve a tirar:\n  ${defectos.join('\n  ')}`)
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

  if (!escribir) { console.log('\n(seco: sin --write no se escribe)'); return }
  if (sinHechos) throw new Error(`no se escribe: ${sinHechos} cortes sin hechos`)
  const restantes = defectosDelForense(crudo)
  if (restantes.length && flag !== '--force') throw new Error(`no se escribe tras 3 intentos, defectos: ${restantes.join(' · ')} (usa --force para escribir el mejor igual)`)
  if (restantes.length) console.log(`⚠️ --force: se escribe el mejor sorteo CON defectos: ${restantes.join(' · ')}`)
  const { error: e2 } = await db.from('video_sessions').update({ forensic_analysis: report }).eq('id', sesion)
  if (e2) throw e2
  console.log('\n✅ forensic_analysis escrito. Ahora: paso Plantilla → "Extraer otra vez" → re-adaptar el guion → render.')
}
main().catch((e) => { console.error(e); process.exit(1) })
