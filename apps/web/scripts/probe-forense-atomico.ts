/**
 * ¿El modelo devuelve el DETALLE ATÓMICO en telegrama, o en prosa que no entra?
 *
 * Es la única pregunta que no se puede responder leyendo código: el prompt lo pide, pero
 * si el modelo contesta con párrafos, el bloque `micro` se come el presupuesto y la
 * escalera lo recorta a nada. Cuesta UN análisis forense (video → Gemini). No escribe.
 *
 *   npx tsx --env-file=.env.local scripts/probe-forense-atomico.ts [sessionId]
 */
import { createClient } from '@supabase/supabase-js'
import { callVideoAds } from '../lib/video-ads/llm'
import { ForensicReportSchema, buildForensicInstruction, unirTomasContinuas, puedenUnirse } from '../lib/video-ads/forensic'
import { LOTE_MAX_SEC, LOTE_MAX_CHARS } from '../lib/video-ads/lotes'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const ID = process.argv[2] ?? '0f1aa12b-ed6c-42ba-a09e-055373d4b558'

async function main() {
  const { data } = await db.from('video_sessions').select('reference_video_url, product_name').eq('id', ID).single()
  const url = (data as { reference_video_url: string }).reference_video_url
  console.log(`Sesión ${ID} — ${(data as { product_name: string }).product_name}\n`)

  const report = await callVideoAds('forensic_report', ForensicReportSchema, [
    { fileData: { fileUri: url, mimeType: 'video/mp4' } },
    { text: buildForensicInstruction() },
  ])

  const largos: number[] = []
  console.log(`${report.cortes.length} cortes\n`)
  for (const c of report.cortes) {
    console.log(`── corte ${c.n} (${c.duracionSeg}s) · ${c.camara.slice(0, 50)}`)
    console.log(`   manos: ${c.objetoEnMano ? `${c.objetoEnMano.inicio} → ${c.objetoEnMano.fin}` : '⚠️ SIN CAMPO'}`)
    if (!c.micro) { console.log('   micro: ⚠️ SIN CAMPO'); continue }
    for (const [k, v] of Object.entries(c.micro)) {
      largos.push(v.length)
      console.log(`   ${k.padEnd(8)}(${String(v.length).padStart(3)}) ${v}`)
    }
  }

  const conObjeto = report.cortes.filter((c) => c.objetoEnMano).length
  const conMicro = report.cortes.filter((c) => c.micro).length
  const med = [...largos].sort((a, b) => a - b)[Math.floor(largos.length / 2)] ?? 0
  const sobre120 = largos.filter((l) => l > 120).length
  // Prosa = artículos y verbos de relleno. El prompt pide telegrama.
  const prosa = report.cortes.filter((c) => c.micro &&
    /\b(la modelo|el sujeto|se puede observar|mientras que|además|se aprecia)\b/i.test(Object.values(c.micro).join(' '))).length

  console.log(`\n─────────────`)
  console.log(`objetoEnMano: ${conObjeto}/${report.cortes.length} cortes`)
  console.log(`micro: ${conMicro}/${report.cortes.length} cortes · largo mediano ${med} car · ${sobre120} casillas sobre 120 · ${prosa} cortes en prosa`)

  const unibles = report.cortes.slice(0, -1).filter((c, i) => puedenUnirse(c, report.cortes[i + 1])).length
  const { report: unido, fusiones } = unirTomasContinuas(report, LOTE_MAX_SEC, LOTE_MAX_CHARS)
  console.log(`fusión por continuidad: ${report.cortes.length} → ${unido.cortes.length} cortes (${unibles} pares elegibles, ${fusiones.length} uniones)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
