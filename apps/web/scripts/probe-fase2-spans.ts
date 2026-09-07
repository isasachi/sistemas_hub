/**
 * Puntúa una plantilla de FASE 2 contra el guion original de su sesión.
 * Lectura pura + aritmética: cero llamadas a modelos, cero cuota.
 *
 *   npx tsx --env-file=.env.local scripts/probe-fase2-spans.ts <sesion> <archivo.json>...
 *
 * Por cada hueco reconstruye qué decía el original ahí (`alignSlots`) y pregunta lo
 * único que discrimina: ¿el dato del nicho quedó DENTRO del corchete, o colgando fuera?
 */
import { createClient } from '@supabase/supabase-js'
import { alignSlots } from '../lib/video-ads/fill'
import type { ForensicReport } from '../lib/video-ads/types'
import type { ScriptTemplate } from '../lib/video-ads/template'

// Los datos que el ORIGINAL afirma de La Roche-Posay. Si alguno sobrevive FUERA de un
// corchete, la plantilla le publica ese claim al producto del usuario.
const DEL_NICHO = [
  'antienvejecimiento', 'luminosidad', 'lifting', 'capas más profundas',
  'ingredientes naturales', 'glow', 'niacinamida', 'suero', 'sérum',
  'la roche', 'manchas', 'arrugas', 'colágeno', 'poros',
]

const norm = (s: string) => s.toLowerCase().normalize('NFC')

async function main() {
  const [sesion, ...archivos] = process.argv.slice(2)
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('video_sessions').select('forensic_analysis').eq('id', sesion).single()
  const forensic = data!.forensic_analysis as ForensicReport

  for (const archivo of archivos) {
    const template: ScriptTemplate = JSON.parse(await Bun_readFile(archivo)).template
    let huecos = 0, sinAlinear = 0, fugas = 0
    console.log(`\n━━ ${archivo}`)
    for (const t of template.tomas) {
      const corte = forensic.cortes.find((c) => c.n === t.n)
      const dialogo = corte?.dialogo ?? ''
      const n = (t.locucion.match(/\[/g) ?? []).length
      huecos += n
      // Andamiaje = lo que queda al sacar los corchetes. Ahí no puede vivir el nicho.
      const andamiaje = norm(t.locucion.replace(/\[[^\]]*\]/g, ' '))
      const fuera = DEL_NICHO.filter((w) => andamiaje.includes(w))
      fugas += fuera.length
      const al = alignSlots(dialogo, t.locucion)
      if (!al && n) sinAlinear++
      console.log(`  toma ${t.n} · ${n} huecos${fuera.length ? `  ⚠ FUERA: ${fuera.join(', ')}` : ''}`)
      console.log(`    ORIGINAL: ${dialogo}`)
      console.log(`    PLANTILLA: ${t.locucion}`)
      if (!al && n) console.log('      ⚠ no alinea: el andamiaje no copia su corte')
      for (const h of al?.huecos ?? []) console.log(`      [${h.nombre}] ← "${h.original}"`)
    }
    console.log(`  TOTAL: ${huecos} huecos · ${fugas} datos del nicho fuera de corchete · ${sinAlinear} tomas sin alinear`)
  }
}

async function Bun_readFile(p: string) {
  const { readFile } = await import('node:fs/promises')
  return readFile(p, 'utf8')
}

main()
