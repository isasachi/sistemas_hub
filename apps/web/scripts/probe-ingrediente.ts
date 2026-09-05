/** ¿El 3er ingrediente sale de la etiqueta o es una muletilla? Lectura pura. */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { readFile } from 'node:fs/promises'
config({ path: '.env.local' })
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
async function main() {
  const [sesion, ...archivos] = process.argv.slice(2)
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('video_sessions').select('product_scan').eq('id', sesion).single()
  const etiqueta = norm((data as any).product_scan?.brandingDescription ?? '')
  console.log('ETIQUETA:', etiqueta.slice(0, 220), '\n')
  for (const a of archivos) {
    const adapted = JSON.parse(await readFile(a, 'utf8')).adapted
    const frase = adapted.tomas.map((t: any) => t.locucion).find((l: string) => /contiene/i.test(l)) ?? ''
    const lista = frase.replace(/^.*contiene\s*/i, '').split(/[.]/)[0]
    const items = lista.split(/,| y /).map((x: string) => x.trim()).filter(Boolean)
    const enEtiqueta = items.filter((x: string) => etiqueta.includes(norm(x)))
    console.log(`${a.split('/').pop()}  ${items.length} items · ${enEtiqueta.length} literales en la etiqueta`)
    console.log(`   ${items.map((x: string) => (etiqueta.includes(norm(x)) ? `✔ ${x}` : `✘ ${x}`)).join('  ·  ')}`)
  }
}
main()
