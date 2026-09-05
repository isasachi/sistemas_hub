/** ¿Los ids de `slotOriginals` casan con los de `extractSlots`? Lectura pura. */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { readFile } from 'node:fs/promises'
import { extractSlots, slotOriginals } from '../lib/video-ads/fill'
import type { ForensicReport } from '../lib/video-ads/types'

config({ path: '.env.local' })

async function main() {
  const [sesion, archivo] = process.argv.slice(2)
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('video_sessions').select('forensic_analysis').eq('id', sesion).single()
  const cortes = (data!.forensic_analysis as ForensicReport).cortes
  const tpl = JSON.parse(await readFile(archivo, 'utf8')).template
  const slots = extractSlots(tpl)
  const orig = slotOriginals(tpl, cortes)
  const huerfanos = Object.keys(orig).filter((k) => !slots.some((s) => s.id === k))
  console.log(`slots ${slots.length} · originales ${Object.keys(orig).length} · huérfanos ${huerfanos.length}`)
  if (huerfanos.length) console.log('  huérfanos:', huerfanos)
  console.log('sin original:', slots.filter((s) => !orig[s.id]).map((s) => s.id).join(', ') || 'ninguno')
  for (const s of slots.slice(0, 6)) console.log(`  ${s.id}  ←  "${orig[s.id] ?? ''}"`)
}
main()
