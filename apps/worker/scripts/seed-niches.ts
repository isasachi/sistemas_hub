// Siembra masiva de nichos — corre local o en el runner self-hosted.
//   npx tsx scripts/seed-niches.ts --from niches.txt          (1 nicho/línea)
//   npx tsx scripts/seed-niches.ts --niches "colageno, lampara sal"
//   npx tsx scripts/seed-niches.ts colageno "lampara sal"     (posicionales)
//   npx tsx scripts/seed-niches.ts --from niches.txt --dry-run
//
// Registra cada nicho como `pending` en ph_niches. Luego `scrape.ts --all`
// (o el cron) los drena: resuelve keywords (lazy, Haiku cacheado) y scrapea.
// ⚠️ NO llama LLM ni scrapea — solo escribe filas pending. $0.
import './bootstrap'
import fs from 'fs'
import { upsertNiche, getNicheStatus } from '@ph/shared'

// Normaliza un nicho igual que el resto del pipeline: trim + minúsculas.
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Lee nichos de un archivo: 1 por línea, ignora vacíos y comentarios (#).
// Soporta también CSV simple (toma la primera columna).
function readFromFile(path: string): string[] {
  const text = fs.readFileSync(path, 'utf-8')
  return text
    .split('\n')
    .map((line) => line.split(',')[0])
    .map(normalize)
    .filter((l) => l && !l.startsWith('#'))
}

function parseArgs(argv: string[]): { niches: string[]; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run')
  const niches: string[] = []

  const fromIdx = argv.indexOf('--from')
  if (fromIdx !== -1 && argv[fromIdx + 1]) {
    niches.push(...readFromFile(argv[fromIdx + 1]))
  }

  const nichesIdx = argv.indexOf('--niches')
  if (nichesIdx !== -1 && argv[nichesIdx + 1]) {
    niches.push(...argv[nichesIdx + 1].split(',').map(normalize))
  }

  // Posicionales: cualquier arg que no sea flag ni valor de flag.
  const consumed = new Set<number>()
  for (const flag of ['--from', '--niches']) {
    const i = argv.indexOf(flag)
    if (i !== -1) { consumed.add(i); consumed.add(i + 1) }
  }
  argv.forEach((a, i) => {
    if (consumed.has(i) || a.startsWith('--')) return
    const n = normalize(a)
    if (n) niches.push(n)
  })

  // Dedupe preservando orden, descarta vacíos.
  const seen = new Set<string>()
  const deduped = niches.filter((n) => n && !seen.has(n) && (seen.add(n), true))
  return { niches: deduped, dryRun }
}

async function main() {
  const { niches, dryRun } = parseArgs(process.argv.slice(2))

  if (!niches.length) {
    console.error('Uso: tsx scripts/seed-niches.ts --from <archivo> | --niches "a,b,c" | <nicho>...')
    process.exit(1)
  }

  console.log(`${niches.length} nichos a sembrar${dryRun ? ' (dry-run, sin escribir)' : ''}:`)
  for (const n of niches) console.log(`  · ${n}`)

  if (dryRun) {
    console.log('\nDry-run: no se escribió nada.')
    return
  }

  let added = 0
  let existing = 0
  let failed = 0
  for (const niche of niches) {
    try {
      // No degradar nichos ya existentes (un active→pending forzaría re-scrape).
      if (await getNicheStatus(niche)) {
        existing++
        continue
      }
      await upsertNiche(niche, 'pending')
      added++
    } catch (e) {
      failed++
      console.error(`  ✗ ${niche}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(
    `\n✓ ${niches.length} nichos procesados: ${added} nuevos (pending) · ${existing} ya existían` +
    `${failed ? ` · ${failed} fallidos` : ''}.`
  )
  console.log('Drena la cola con: PH_CONCURRENCY=3 npx tsx scripts/scrape.ts --all')
}

main().catch((e) => { console.error(e); process.exit(1) })
