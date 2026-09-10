/**
 * Mide el conteo de la mano libre sobre las sesiones YA GUARDADAS. Lectura pura de la
 * base: cero llamadas a modelos, cero renders, no escribe nada.
 *
 *   npx tsx --env-file=.env.local scripts/probe-conteo.ts [--sesion <prefijo>]
 *
 * Imprime cuántos lotes ganan la línea del conteo, si el presupuesto de prompt se mueve,
 * y —con `--sesion`— el prompt entero de esa sesión para leerlo al lado del render.
 */
import { createClient } from '@supabase/supabase-js'
import { insumosDeRender, promptDeLote } from '../lib/video-ads/render-lotes'
import { numeroEnunciado } from '../lib/video-ads/lotes'

/** Espejo de `DEDOS` en lotes.ts, para poder verificar la línea exacta por número. */
const DEDOS = ['', 'un dedo', 'dos dedos', 'tres dedos', 'cuatro dedos', 'cinco dedos']
import { AdaptedScriptSchema } from '../lib/video-ads/adapt'
import { KIE_PROMPT_MAX } from '../lib/video-ads/kie'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const pref = process.argv.includes('--sesion') ? process.argv[process.argv.indexOf('--sesion') + 1] : null

async function main() {
  const { data } = await db.from('video_sessions').select('*').not('adapted', 'is', null).limit(500)
  let sesiones = 0, lotes = 0, conConteo = 0, max = 0, enumeradas = 0, tomas = 0, sinEmitir = 0
  const detalle: string[] = []

  for (const s of (data ?? []) as any[]) {
    const adapted = AdaptedScriptSchema.safeParse(s.adapted)
    if (!adapted.success) continue
    if (!s.voice_profile) continue
    const voz = s.voice_profile
    let ins
    try { ins = insumosDeRender(s, adapted.data, voz) } catch { continue }
    sesiones++
    ins.agrupados.forEach((lote, i) => {
      let prompt = ''
      try { ({ prompt } = promptDeLote(lote, ins.camaras[i], ins)) } catch { return }
      lotes++
      max = Math.max(max, prompt.length)
      tomas += lote.tomas.length
      const n = lote.tomas.filter((t) => numeroEnunciado(t.locucion)).length
      enumeradas += n
      // La línea REAL que emite el conteo, no un "dedos" cualquiera: la coreografía dice
      // "con los dedos" y "con las yemas de los dedos" todo el tiempo.
      const emitidas = (prompt.match(/Levanta (?:un dedo|dos dedos|tres dedos|cuatro dedos|cinco dedos) con la mano (?:derecha|izquierda)/gi) ?? []).length
      conConteo += emitidas
      sinEmitir += n - emitidas
      if (!pref) lote.tomas.forEach((t) => {
        const n = numeroEnunciado(t.locucion)
        if (!n) return
        const emitida = new RegExp(`Levanta ${DEDOS[n]} con la mano`, 'i').test(prompt)
        if (!emitida) console.log(`  MISS  ${s.id.slice(0, 8)} toma ${t.n} n=${n}  accion="${t.accionVisual.slice(0, 110)}"`)
      })
      if (pref && s.id.startsWith(pref)) detalle.push(`\n${'='.repeat(70)}\nLOTE ${i + 1}  ${prompt.length} car\n${'='.repeat(70)}\n${prompt}`)
    })
  }

  console.log(`sesiones=${sesiones}  lotes=${lotes}  tomas=${tomas}`)
  console.log(`tomas que ENUMERAN=${enumeradas}  con conteo emitido=${conConteo}  sin emitir (sin mano libre o con pieza)=${sinEmitir}`)
  console.log(`prompt MAX=${max} de ${KIE_PROMPT_MAX}`)
  detalle.forEach((d) => console.log(d))
}
main().catch((e) => { console.error('ERR:', e?.message ?? JSON.stringify(e)); process.exit(1) })
