/**
 * Sube las 60 imágenes de referencia (12 estilos × 5) al bucket `ad-uploads`
 * bajo `branding-refs/<folder>/<file>.jpg` y escribe el manifiesto commiteable
 * `lib/branding/ref-manifest.ts`. Idempotente (upsert). Correr UNA vez con las
 * refs ya descomprimidas:  tsx scripts/seed-branding-refs.ts <dir-descomprimido>
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const BUCKET = 'ad-uploads'
const PREFIX = 'branding-refs'

async function main() {
  const srcDir = process.argv[2]
  if (!srcDir) throw new Error('Uso: tsx scripts/seed-branding-refs.ts <dir con las 12 carpetas>')
  const storage = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ).storage.from(BUCKET)

  const folders = fs.readdirSync(srcDir).filter((f) =>
    fs.statSync(path.join(srcDir, f)).isDirectory(),
  ).sort()

  const manifest: Record<string, string[]> = {}
  for (const folder of folders) {
    const files = fs.readdirSync(path.join(srcDir, folder))
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort()
    manifest[folder] = files
    for (const file of files) {
      const buf = fs.readFileSync(path.join(srcDir, folder, file))
      const { error } = await storage.upload(`${PREFIX}/${folder}/${file}`, buf, {
        contentType: 'image/jpeg', upsert: true,
      })
      if (error) throw new Error(`upload ${folder}/${file}: ${error.message}`)
      process.stdout.write('.')
    }
  }

  const out = `// GENERADO por scripts/seed-branding-refs.ts — no editar a mano.\n`
    + `// Nombres de archivo de las refs por carpeta de estilo (bucket ad-uploads, prefijo branding-refs/).\n`
    + `export const REF_MANIFEST: Record<string, string[]> = ${JSON.stringify(manifest, null, 2)}\n`
  fs.writeFileSync(path.join(__dirname, '../lib/branding/ref-manifest.ts'), out)
  console.log(`\nOK — ${folders.length} estilos, manifest escrito.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
