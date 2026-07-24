/**
 * seed-landing-templates.ts — sube las 8 PLANTILLAS canónicas (una por sección) al bucket
 * `ad-uploads`, prefijo `landing-templates/<spec_key>.png`. Estas son la NUEVA fuente de verdad
 * de composición y estructura (refactor 2026-07-23): el prompt de cada sección solo inyecta
 * variables sobre su plantilla. Distinto prefijo que las viejas `landing-refs/` (motor DNA).
 *
 *   cd apps/web && set -a && source .env.local && set +a && npx tsx scripts/seed-landing-templates.ts
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DL = '/mnt/c/Users/isaac/Downloads/landing'
// spec section key ↔ archivo fuente (nombres con acento/guion-bajo → key de código).
const MAP: Record<string, string> = {
  hero_problem: `${DL}/hero.png`,
  before_after: `${DL}/antes_despues.png`,
  benefits: `${DL}/beneficios.png`,
  offer: `${DL}/oferta.png`,
  testimonials: `${DL}/testimonios.png`,
  faq: `${DL}/faq.png`,
  guarantee: `${DL}/garantía.png`,
  cta_final: `${DL}/cta_final.png`,
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (source .env.local)')
  const storage = createClient(url, key).storage.from('ad-uploads')

  for (const [section, src] of Object.entries(MAP)) {
    if (!fs.existsSync(src)) throw new Error(`no existe: ${src}`)
    const path = `landing-templates/${section}.png`
    const { error } = await storage.upload(path, fs.readFileSync(src), { contentType: 'image/png', upsert: true })
    if (error) throw new Error(`${section}: ${error.message}`)
    console.log(`  OK ${section} → ${storage.getPublicUrl(path).data.publicUrl}`)
  }
  console.log('listo — 8 plantillas de sección subidas.')
}

main().catch((e) => { console.error(e); process.exit(1) })
