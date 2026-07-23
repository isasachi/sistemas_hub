/**
 * Genera 1 wireframe DETERMINISTA por estilo (7 total) — la pieza clave de
 * consistencia compositiva de la migración fase 1. NO usa Gemini: dibuja el
 * esqueleto de `LABEL_LAYOUTS[styleId].anatomy` como bandas horizontales en
 * escala de grises con `sharp` (vía `lib/branding/wireframe.ts`, algoritmo
 * compartido con el render on-the-fly del modo upload), y lo sube a
 * `branding-refs/wireframes/<styleId>.png`.
 *
 * Algoritmo (ver .superpowers/sdd/phase1-assets-brief.md §1.3, implementado en
 * `lib/branding/wireframe.ts`):
 *  - Lienzo retrato 4:5 (800×1000), fondo #EEEEEE.
 *  - De `anatomy`, cada entrada con un "(~N%)" es una banda; se apilan de
 *    arriba a abajo, normalizadas a que sumen 100 (= alto del lienzo).
 *  - Las entradas SIN "(~N%)" no son banda: si mencionan
 *    filete/marco/enmarcando se dibuja un borde rectangular interior; si
 *    mencionan "a sangre"/"sin marco" se omite (full-bleed, sin marco).
 *  - Cada banda: relleno gris alternado, borde fino, etiqueta con las 2-4
 *    primeras palabras de la entrada (limpias del "(~N%)"), alineada según
 *    `alignment` (left/centered/justified).
 *
 * Uso:  set -a && source .env.local && set +a && npx tsx scripts/gen-wireframes.ts
 */
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { LABEL_LAYOUTS } from '../lib/branding/label-layouts'
import { buildWireframeSvg } from '../lib/branding/wireframe'

const BUCKET = 'ad-uploads'
const PREFIX = 'branding-refs/wireframes'

async function main() {
  const storage = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ).storage.from(BUCKET)

  console.log('== Wireframes deterministas ==')
  const ids = Object.keys(LABEL_LAYOUTS)
  for (const styleId of ids) {
    const layout = LABEL_LAYOUTS[styleId]
    const { svg, bandCount, totalPercent } = buildWireframeSvg(layout, styleId)
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const path = `${PREFIX}/${styleId}.png`
    const { error } = await storage.upload(path, png, { contentType: 'image/png', upsert: true })
    if (error) throw new Error(`upload ${path}: ${error.message}`)
    console.log(`  OK ${styleId}: ${bandCount} bandas, ${totalPercent}% total (normalizado a 100)`)
  }
  console.log(`\nOK — ${ids.length} wireframes generados y subidos.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
