/**
 * Migración fase 1 (12→7 presets): reorganiza los folders de refs en Storage
 * heredando de los folders viejos hacia los 7 nuevos ids de STYLE_PRESETS, y
 * al final regenera `lib/branding/ref-manifest.ts` SOLO con los 7 nuevos
 * folders (listados en vivo desde Storage, no inventados).
 *
 * Idempotente: usa download+upload(upsert:true) en vez de `.copy()` (que no
 * soporta upsert) — correr dos veces produce el mismo resultado. NO borra
 * ningún folder viejo (el manifest simplemente deja de apuntarlos).
 *
 * Uso:  set -a && source .env.local && set +a && npx tsx scripts/reorg-branding-refs.ts
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const BUCKET = 'ad-uploads'
const PREFIX = 'branding-refs'

/** folder nuevo → folders viejos que heredan en él. Más de uno = merge (se prefija el filename con "<oldFolder0N>_"). */
const INHERITANCE: Record<string, string[]> = {
  '01_neo_apotecario': ['03_vintage_retro'],
  '02_citrico_max': ['05_bold_maximalista'],
  '03_clinical_performance': ['08_moderno_tech', '10_farmaceutico_clean'],
  '04_rich_not_snobby': ['02_lujo'],
  '05_botanico': ['04_organico_eco'],
  '06_editorial': ['01_minimalista'],
  '07_future_nostalgia': ['09_colorido_y2k'],
}

function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

async function main() {
  const storage = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ).storage.from(BUCKET)

  console.log('== Reorg branding-refs ==')
  for (const [newFolder, oldFolders] of Object.entries(INHERITANCE)) {
    const merge = oldFolders.length > 1
    for (const oldFolder of oldFolders) {
      const { data: files, error: listErr } = await storage.list(`${PREFIX}/${oldFolder}`)
      if (listErr) throw new Error(`list ${oldFolder}: ${listErr.message}`)
      const names = (files ?? [])
        .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
        .map((f) => f.name)
        .sort()
      if (names.length === 0) {
        console.warn(`  ! ${oldFolder}: 0 archivos (¿folder inexistente?)`)
        continue
      }
      for (const name of names) {
        const fromPath = `${PREFIX}/${oldFolder}/${name}`
        const toName = merge ? `${oldFolder.slice(0, 2)}_${name}` : name
        const toPath = `${PREFIX}/${newFolder}/${toName}`
        const { data: blob, error: dlErr } = await storage.download(fromPath)
        if (dlErr || !blob) throw new Error(`download ${fromPath}: ${dlErr?.message}`)
        const buf = Buffer.from(await blob.arrayBuffer())
        const { error: upErr } = await storage.upload(toPath, buf, {
          contentType: contentTypeFor(name),
          upsert: true,
        })
        if (upErr) throw new Error(`upload ${toPath}: ${upErr.message}`)
        process.stdout.write('.')
      }
    }
    const { data: finalFiles, error: finalErr } = await storage.list(`${PREFIX}/${newFolder}`)
    if (finalErr) throw new Error(`list final ${newFolder}: ${finalErr.message}`)
    console.log(`\n  ${newFolder} ← ${oldFolders.join(' + ')}: ${finalFiles?.length ?? 0} archivos`)
  }

  console.log('\n== Regenerando ref-manifest.ts (solo 7 folders nuevos) ==')
  const manifest: Record<string, string[]> = {}
  for (const newFolder of Object.keys(INHERITANCE)) {
    const { data: files, error } = await storage.list(`${PREFIX}/${newFolder}`)
    if (error) throw new Error(`list manifest ${newFolder}: ${error.message}`)
    manifest[newFolder] = (files ?? [])
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
      .map((f) => f.name)
      .sort()
  }

  const out = `// GENERADO por scripts/reorg-branding-refs.ts — no editar a mano.\n`
    + `// Nombres de archivo de las refs por carpeta de estilo (bucket ad-uploads, prefijo branding-refs/).\n`
    + `// Migración fase 1 (jul 2026): 12 folders → 7, ver INHERITANCE en reorg-branding-refs.ts.\n`
    + `export const REF_MANIFEST: Record<string, string[]> = ${JSON.stringify(manifest, null, 2)}\n`
  const outPath = path.join(__dirname, '../lib/branding/ref-manifest.ts')
  fs.writeFileSync(outPath, out)
  for (const [folder, files] of Object.entries(manifest)) {
    console.log(`  ${files.length >= 1 ? 'OK  ' : 'FALLA'} ${folder}: ${files.length}`)
  }
  console.log(`\nOK — manifest escrito en ${outPath}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
