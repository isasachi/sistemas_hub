/** ¿El scan transcribe la etiqueta o describe el estilo? Una llamada de visión, 0 escrituras. */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import type { Part } from '@google/genai'
import { callVideoAds } from '../lib/video-ads/llm'
import { ProductScanSchema } from '../lib/types'
config({ path: '.env.local' })

async function main() {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('video_sessions')
    .select('product_url, product_name, what_it_does, target_audience, product_scan')
    .eq('id', process.argv[2]).single()
  const s = data as any
  console.log('GUARDADO:', s.product_scan?.brandingDescription, '\n')
  const bytes = Buffer.from(await (await fetch(s.product_url)).arrayBuffer())
  // El texto exacto de la ruta, leído del archivo para que el probe no se desincronice.
  const { readFile } = await import('node:fs/promises')
  const ruta = await readFile('app/api/generador-video-ads/sessions/[id]/analyze-product/route.ts', 'utf8')
  const bloque = ruta.slice(ruta.indexOf("'Analyze the product image"), ruta.indexOf("'Return ProductScan JSON.',"))
  const texto = [`Product name: ${s.product_name}`, `What it does: ${s.what_it_does}`,
    `Target audience: ${s.target_audience}`,
    ...bloque.split('\n').map((l) => l.trim().replace(/^'/, '').replace(/',$/, '')).filter(Boolean),
    'Return ProductScan JSON.'].join('\n')
  const parts: Part[] = [
    { inlineData: { mimeType: 'image/jpeg', data: bytes.toString('base64') } },
    { text: texto },
  ]
  const scan = await callVideoAds('product_scan', ProductScanSchema, parts)
  console.log('NUEVO   :', scan.brandingDescription)
}
main()
