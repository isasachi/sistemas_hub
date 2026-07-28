/**
 * Convierte las fotos de plantilla en ADN commiteado. One-off, idempotente.
 *
 *   tsx scripts/seed-branding-templates.ts <dir-de-fotos> [categoryId ...]
 *
 * Por cada plantilla del catálogo (`lib/branding/templates.ts`), en orden:
 *   1. sube el PNG a ad-uploads/branding-templates/<id>.png
 *   2. extrae identidad + layout con analyzeUploadedStyle(), y valida que el
 *      anatomy bandeado sume 85-115% (re-pide hasta 3 veces; si no converge, ABORTA)
 *   3. extrae containerType + 2 paletas alternativas, y las valida por contraste
 *      Y por copia literal de los ejemplos del prompt (isSuspectedExampleCopy)
 *      (re-pide hasta 3 veces; si no consigue 3 paletas válidas o el containerType
 *      sigue pareciendo copiado, ABORTA)
 *   4. renderiza el wireframe determinista del layout y lo sube
 *   5. escribe lib/branding/template-dna.ts
 *
 * Sin argumentos de categoría procesa las 30. Con ellos, sólo esas categorías —
 * el manifiesto existente se FUSIONA, no se pisa, así se puede sembrar por
 * partes. Requiere SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y la key de Gemini
 * en el entorno (apps/web/.env.local).
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { TEMPLATES, type TemplateMeta, type TemplateDna } from '../lib/branding/templates'
import { TEMPLATE_DNA as EXISTING } from '../lib/branding/template-dna'
import { analyzeUploadedStyle } from '../lib/branding/style-extract'
import {
  extractTemplateExtras, buildPalettes, hasLegalPair, isSuspectedExampleCopy,
} from '../lib/branding/palette-variants'
import { renderWireframePng, anatomyBandSum } from '../lib/branding/wireframe'

const BUCKET = 'ad-uploads'
const PREFIX = 'branding-templates'
const MAX_PALETTE_ATTEMPTS = 3
const MAX_ANATOMY_ATTEMPTS = 3
const ANATOMY_SUM_MIN = 85
const ANATOMY_SUM_MAX = 115

const storage = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from(BUCKET)

async function upload(objectPath: string, body: Buffer, contentType: string) {
  const { error } = await storage().upload(`${PREFIX}/${objectPath}`, body, { contentType, upsert: true })
  if (error) throw new Error(`upload ${objectPath}: ${error.message}`)
}

async function seedOne(t: TemplateMeta, srcDir: string): Promise<TemplateDna> {
  const buf = fs.readFileSync(path.join(srcDir, t.file))
  await upload(`${t.id}.png`, buf, 'image/png')

  const base64 = buf.toString('base64')

  // El anatomy crudo se inyecta SIN normalizar en el prompt real de generación
  // (layoutToPrompt); si no cubre ~100% del panel, el modelo generador recibe una
  // estructura "exacta a seguir" que en realidad deja la mitad del panel sin definir.
  let dna: Awaited<ReturnType<typeof analyzeUploadedStyle>> | undefined
  let sum = 0
  for (let attempt = 1; attempt <= MAX_ANATOMY_ATTEMPTS; attempt++) {
    dna = await analyzeUploadedStyle(base64, 'image/png')
    sum = anatomyBandSum(dna.layout.anatomy)
    if (sum >= ANATOMY_SUM_MIN && sum <= ANATOMY_SUM_MAX) break
    console.warn(`  ⚠ ${t.id}: intento ${attempt}, anatomy suma ${sum}% (fuera de ${ANATOMY_SUM_MIN}-${ANATOMY_SUM_MAX})`)
  }
  if (sum < ANATOMY_SUM_MIN || sum > ANATOMY_SUM_MAX) {
    throw new Error(`${t.id}: anatomy no converge a ~100% en ${MAX_ANATOMY_ATTEMPTS} intentos (última suma: ${sum}%)`)
  }
  const finalDna = dna!

  if (!hasLegalPair(finalDna.palette)) {
    throw new Error(`${t.id}: la paleta extraída no tiene ningún par texto/fondo >= 4.5:1`)
  }

  // Las variantes son lo único no determinista que puede salir mal: reintentamos.
  // También reintenta si containerType parece una copia literal de un ejemplo del
  // prompt (guard determinista, ver isSuspectedExampleCopy) — un caso real: el modelo
  // devolvió "doypack con ventana" para un sachet plano sin ventana ninguna.
  let palettes: TemplateDna['palettes'] = []
  let containerType = ''
  let copySuspected = false
  for (let attempt = 1; attempt <= MAX_PALETTE_ATTEMPTS; attempt++) {
    const extras = await extractTemplateExtras(base64, 'image/png', finalDna.palette)
    containerType = extras.containerType
    copySuspected = isSuspectedExampleCopy(containerType)
    if (copySuspected) {
      console.warn(`  ⚠ ${t.id}: intento ${attempt}, containerType parece copiado del prompt ("${containerType}")`)
      palettes = []
      continue
    }
    palettes = buildPalettes(finalDna.palette, extras.variants)
    if (palettes.length === 3) break
    console.warn(`  ⚠ ${t.id}: intento ${attempt}, sólo ${palettes.length}/3 paletas válidas`)
  }
  if (copySuspected) {
    throw new Error(`${t.id}: containerType sigue pareciendo copiado literal de un ejemplo del prompt tras ${MAX_PALETTE_ATTEMPTS} intentos: "${containerType}"`)
  }
  if (palettes.length < 3) {
    throw new Error(`${t.id}: no se consiguieron 3 paletas con contraste válido en ${MAX_PALETTE_ATTEMPTS} intentos`)
  }

  const wf = await renderWireframePng(finalDna.layout, t.id)
  await upload(`wireframes/${t.id.replace('/', '__')}.png`, wf, 'image/png')

  return { dna: finalDna, containerType, palettes }
}

function writeManifest(all: Record<string, TemplateDna>) {
  const ordered: Record<string, TemplateDna> = {}
  for (const t of TEMPLATES) if (all[t.id]) ordered[t.id] = all[t.id]
  const out =
    `// GENERADO por scripts/seed-branding-templates.ts — no editar a mano.\n` +
    `// ADN compositivo extraído de la foto de cada plantilla + su containerType +\n` +
    `// sus 3 paletas (la [0] es la de la foto original).\n` +
    `import type { TemplateDna } from './templates'\n\n` +
    `export const TEMPLATE_DNA: Record<string, TemplateDna> = ${JSON.stringify(ordered, null, 2)}\n`
  fs.writeFileSync(path.join(__dirname, '../lib/branding/template-dna.ts'), out)
}

async function main() {
  const srcDir = process.argv[2]
  if (!srcDir) throw new Error('Uso: tsx scripts/seed-branding-templates.ts <dir-de-fotos> [categoryId ...]')
  const only = new Set(process.argv.slice(3))

  const targets = only.size ? TEMPLATES.filter((t) => only.has(t.categoryId)) : TEMPLATES
  if (!targets.length) throw new Error(`Ninguna plantilla en las categorías: ${[...only].join(', ')}`)

  const all: Record<string, TemplateDna> = { ...EXISTING }
  for (const t of targets) {
    process.stdout.write(`→ ${t.id} ... `)
    all[t.id] = await seedOne(t, srcDir)
    const sum = anatomyBandSum(all[t.id].dna.layout.anatomy)
    console.log(`ok (${all[t.id].containerType} · anatomy ${sum}%)`)
  }

  writeManifest(all)
  console.log(`\nOK — ${targets.length} plantillas sembradas, ${Object.keys(all).length} en el manifiesto.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
