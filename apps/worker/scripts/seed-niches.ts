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
import path from 'path'
import { fileURLToPath } from 'url'
import { upsertNiche, updateNichePriority, getNicheStatus } from '@ph/shared'

export interface SeedNiche {
  niche: string
  priority: number
}

// Normaliza un nicho igual que el resto del pipeline: trim + minúsculas.
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// `# @priority N` — directiva que fija la prioridad de los nichos que la siguen
// (hasta la próxima directiva). Es una línea de comentario, así que DEBE
// matchearse ANTES del strip de comentarios (sino se pierde silenciosamente y
// todo queda en priority 0). Tolera un comentario inline tras el número
// (`# @priority 1  ← nota`), pero rechaza basura pegada (`@priority 12abc`).
// N negativo o no-numérico → ignorado.
const PRIORITY_DIRECTIVE = /^#\s*@priority\s+(-?\d+)(?:\s.*)?$/

// Lee nichos de un archivo: 1 por línea, ignora vacíos y comentarios (#).
// Soporta CSV simple (toma la primera columna) y la directiva `# @priority N`.
export function readFromFile(path: string): SeedNiche[] {
  const text = fs.readFileSync(path, 'utf-8')
  const out: SeedNiche[] = []
  let priority = 0
  for (const line of text.split('\n')) {
    const directive = PRIORITY_DIRECTIVE.exec(line.trim())
    if (directive) {
      priority = Number(directive[1])
      continue
    }
    const niche = normalize(line.split(',')[0])
    if (niche && !niche.startsWith('#')) out.push({ niche, priority })
  }
  return out
}

function parseArgs(argv: string[]): { niches: SeedNiche[]; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run')
  const niches: SeedNiche[] = []

  const fromIdx = argv.indexOf('--from')
  if (fromIdx !== -1 && argv[fromIdx + 1]) {
    niches.push(...readFromFile(argv[fromIdx + 1]))
  }

  const nichesIdx = argv.indexOf('--niches')
  if (nichesIdx !== -1 && argv[nichesIdx + 1]) {
    niches.push(...argv[nichesIdx + 1].split(',').map((n) => ({ niche: normalize(n), priority: 0 })))
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
    if (n) niches.push({ niche: n, priority: 0 })
  })

  // Dedupe por nombre preservando orden; ante duplicados conserva la prioridad
  // más alta vista. Descarta vacíos.
  const byNiche = new Map<string, number>()
  for (const { niche, priority } of niches) {
    if (!niche) continue
    byNiche.set(niche, Math.max(byNiche.get(niche) ?? -Infinity, priority))
  }
  const deduped = [...byNiche].map(([niche, priority]) => ({ niche, priority }))
  return { niches: deduped, dryRun }
}

async function main() {
  const { niches, dryRun } = parseArgs(process.argv.slice(2))

  if (!niches.length) {
    console.error('Uso: tsx scripts/seed-niches.ts --from <archivo> | --niches "a,b,c" | <nicho>...')
    process.exit(1)
  }

  const withPriority = niches.filter((n) => n.priority > 0).length
  console.log(
    `${niches.length} nichos a sembrar${dryRun ? ' (dry-run, sin escribir)' : ''}` +
    `${withPriority ? ` (${withPriority} con prioridad>0)` : ''}:`
  )
  for (const { niche, priority } of niches) {
    console.log(`  · ${niche}${priority ? ` [p${priority}]` : ''}`)
  }

  if (dryRun) {
    console.log('\nDry-run: no se escribió nada.')
    return
  }

  let added = 0
  let existing = 0
  let repriced = 0
  let failed = 0
  for (const { niche, priority } of niches) {
    try {
      // No degradar nichos ya existentes (un active→pending forzaría re-scrape),
      // pero SÍ propagar la prioridad de niches.txt si cambió (fuente de verdad).
      const current = await getNicheStatus(niche)
      if (current) {
        existing++
        if (current.priority !== priority) {
          await updateNichePriority(niche, priority)
          repriced++
        }
        continue
      }
      await upsertNiche(niche, 'pending', priority)
      added++
    } catch (e) {
      failed++
      console.error(`  ✗ ${niche}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(
    `\n✓ ${niches.length} nichos procesados: ${added} nuevos (pending) · ${existing} ya existían` +
    `${repriced ? ` · ${repriced} re-priorizados` : ''}${failed ? ` · ${failed} fallidos` : ''}.`
  )
  console.log('Drena la cola con: PH_CONCURRENCY=3 npx tsx scripts/scrape.ts --all')
}

// Solo corre al ejecutarse directamente (tsx scripts/seed-niches.ts …); al
// importarse desde los tests (readFromFile) NO dispara main() ni process.exit.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
