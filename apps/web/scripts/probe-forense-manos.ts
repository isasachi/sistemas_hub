/**
 * Re-corre el FORENSE sobre el video de una sesión guardada y mira las dos cosas que se
 * ven rotas en los clips: si cada corte dice qué sostiene cada mano (la tercera mano) y
 * si nombra la TRANSFERENCIA del producto al cuerpo (el primer clip que no aplica nada).
 *
 * NO escribe en la base: re-analizar desincroniza el guion de una sesión ya adaptada.
 * Cuesta una llamada de video a Gemini por corrida, ninguna imagen y ningún render.
 *
 *   npx tsx --env-file=.env.local scripts/probe-forense-manos.ts <sesion>
 */
import { createClient } from '@supabase/supabase-js'
import type { Part } from '@google/genai'
import { geminiCallStructured, geminiEsDirecto } from '@/lib/gemini'
import { VIDEO_SYSTEM_PROMPT } from '@/lib/video-ads/llm'
import { buildForensicInstruction, ForensicReportSchema } from '@/lib/video-ads/forensic'
import { fetchAsBase64, headStorageFile } from '@/lib/storage'
import { MAX_VIDEO_MB } from '@/lib/video-ads/limits'

// ⚠️ ESTAS REGEX NO PUNTÚAN NADA: son un índice para leer más rápido. Ya dieron un
// falso negativo —"usa el gotero con la derecha para aplicar producto en la mejilla" es
// la transferencia y no matcheaba—, así que el veredicto se lee en las líneas impresas.
const DOS_MANOS = /(mano izquierda|con la izquierda|ambas manos)/i
const TRANSFIERE = /(suelta|deja caer|deposita|aplica|cae|extiende)[^.;]{0,60}(gota|producto|serum|suero)|(gota|producto|serum|suero)[^.;]{0,40}(sobre|en) (la|su) /i

async function main() {
  const [sesion] = process.argv.slice(2)
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db.from('video_sessions')
    .select('reference_video_url, forensic_analysis').eq('id', sesion).single()
  if (error || !data) throw new Error(`sesión ilegible: ${error?.message}`)
  const url = (data as any).reference_video_url as string
  if (!url) throw new Error('la sesión no tiene video de referencia')

  const { mimeType } = await headStorageFile(url, MAX_VIDEO_MB * 1024 * 1024)
  const parts: Part[] = [
    geminiEsDirecto()
      ? { inlineData: await fetchAsBase64(url, MAX_VIDEO_MB * 1024 * 1024) }
      : { fileData: { fileUri: url, mimeType } },
    { text: buildForensicInstruction() },
  ]
  const nuevo = await geminiCallStructured('forensic_report', ForensicReportSchema, parts, 3, VIDEO_SYSTEM_PROMPT)

  const medir = (etiqueta: string, cortes: any[]) => {
    let manos = 0, transf = 0
    for (const c of cortes) {
      if (DOS_MANOS.test(c.accion)) manos++
      if (TRANSFIERE.test(c.accion)) transf++
    }
    console.log(`\n${etiqueta} — ${cortes.length} cortes`)
    console.log(`  nombran las DOS manos: ${manos}/${cortes.length}`)
    console.log(`  parecen nombrar la transferencia al cuerpo: ${transf}/${cortes.length}`)
    for (const c of cortes) console.log(`  [${c.n}] ${c.accion}`)
  }

  medir('GUARDADO', (data as any).forensic_analysis?.cortes ?? [])
  medir('NUEVO', nuevo.cortes ?? [])
}
main()
