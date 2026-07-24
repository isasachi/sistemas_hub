/**
 * seed-landing-refs.ts — sube las 8 imágenes de referencia de composición (una por
 * sección) al bucket `ad-uploads`, prefijo `landing-refs/<section>.png`. Cada sección
 * adjunta SU ref como guía de layout en la generación (ver clarificación 2026-07-23).
 *
 *   cd apps/web && set -a && source .env.local && set +a && npx tsx scripts/seed-landing-refs.ts
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DL = '/mnt/c/Users/isaac/Downloads'
// section key (spec) → archivo fuente. Mapeo confirmado por el usuario 2026-07-23.
const MAP: Record<string, string> = {
  hero_problem: `${DL}/ChatGPT Image 23 jul 2026, 01_15_39.png`,
  before_after: `${DL}/ChatGPT Image 23 jul 2026, 01_21_31.png`,
  benefits: `${DL}/ChatGPT Image 23 jul 2026, 01_19_50.png`,
  offer: `${DL}/ChatGPT Image 23 jul 2026, 01_17_54.png`,
  testimonials: `${DL}/ChatGPT Image 23 jul 2026, 02_24_47.png`,
  faq: `${DL}/ChatGPT Image 23 jul 2026, 02_27_49.png`,
  guarantee: `${DL}/ChatGPT Image 23 jul 2026, 02_29_54.png`,
  cta_final: `${DL}/ChatGPT Image 23 jul 2026, 02_32_15.png`,
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (source .env.local)')
  const storage = createClient(url, key).storage.from('ad-uploads')

  for (const [section, src] of Object.entries(MAP)) {
    if (!fs.existsSync(src)) throw new Error(`no existe: ${src}`)
    const path = `landing-refs/${section}.png`
    const { error } = await storage.upload(path, fs.readFileSync(src), { contentType: 'image/png', upsert: true })
    if (error) throw new Error(`${section}: ${error.message}`)
    console.log(`  OK ${section} → ${storage.getPublicUrl(path).data.publicUrl}`)
  }
  console.log('listo — 8 refs de sección subidas.')
}

main().catch((e) => { console.error(e); process.exit(1) })
