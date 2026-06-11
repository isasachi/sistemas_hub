// CLI del scraper — corre en GitHub Actions.
//   npx tsx scripts/scrape.ts --niche espalda
//   npx tsx scripts/scrape.ts --all          (todos los nichos pendientes/vencidos)
//
// Keywords por nicho (modelo original: ≥15 en 4 direcciones):
//   1. cache en ph_niches.keywords  →  2. seed estático (keywords.ts)
//   →  3. expansión LLM (Haiku, una sola vez, queda cacheada en DB).
// La expansión es la ÚNICA llamada LLM de este script y solo ocurre para
// nichos nuevos — el análisis sigue siendo exclusivo de scripts/analyze.ts.
import './bootstrap' // env + polyfill WebSocket — debe ir primero
import { scrapeNiche } from '../lib/product-hunter/scraper'
import { getNichesToRefresh, getNicheStatus, saveNicheKeywords } from '../lib/product-hunter/db'
import { seedKeywords, ALL_NICHES } from '../lib/product-hunter/keywords'
import { expandNicheKeywords } from '../lib/product-hunter/keyword-expansion'

async function resolveKeywords(niche: string): Promise<string[]> {
  const row = await getNicheStatus(niche)
  if (row?.keywords?.length) return row.keywords

  const seed = seedKeywords(niche)
  if (seed) {
    await saveNicheKeywords(niche, seed)
    return seed
  }

  console.log(`[${niche}] sin keywords — expandiendo con LLM (una sola vez)...`)
  const expanded = await expandNicheKeywords(niche)
  await saveNicheKeywords(niche, expanded)
  console.log(`[${niche}] ${expanded.length} keywords generadas: ${expanded.join(', ')}`)
  return expanded
}

async function main() {
  const args = process.argv.slice(2)
  const nicheIdx = args.indexOf('--niche')

  let niches: string[]
  if (nicheIdx !== -1 && args[nicheIdx + 1]) {
    niches = [args[nicheIdx + 1]]
  } else if (args.includes('--all')) {
    // Pendientes/vencidos del DB; si está vacío (primera corrida), todos los conocidos.
    const toRefresh = await getNichesToRefresh()
    niches = toRefresh.length ? toRefresh.map((n) => n.id) : ALL_NICHES
  } else {
    console.error('Uso: tsx scripts/scrape.ts --niche <nombre> | --all')
    process.exit(1)
  }

  for (const niche of niches) {
    const keywords = await resolveKeywords(niche)
    await scrapeNiche(niche, { keywords })
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
