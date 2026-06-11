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
import {
  getNichesToRefresh,
  getNicheStatus,
  saveNicheKeywords,
  getTopCountriesForNiche,
} from '../lib/product-hunter/db'
import { seedKeywords, ALL_NICHES } from '../lib/product-hunter/keywords'
import { expandNicheKeywords } from '../lib/product-hunter/keyword-expansion'

// Países de descubrimiento cuando el nicho no tiene historial en DB.
// MX y CO son los mercados LATAM más grandes y activos en e-commerce.
const DEFAULT_DISCOVERY = ['MX', 'CO'] as const

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

// Selecciona los 2 países de descubrimiento óptimos para el nicho más PE.
//
// Lógica: usa los 2 países donde el nicho ya tiene más productos ganadores
// (alta/media en el análisis previo). Para nichos nuevos sin historial, usa
// MX + CO (los mercados LATAM con mayor volumen de e-commerce).
// PE siempre se añade al final — es el pool de competidores locales.
async function resolveCountries(niche: string): Promise<string[]> {
  const top = await getTopCountriesForNiche(niche, 2)

  // Completar con defaults si el historial no alcanza 2 países
  const discovery = [...top]
  for (const def of DEFAULT_DISCOVERY) {
    if (discovery.length >= 2) break
    if (!discovery.includes(def)) discovery.push(def)
  }

  const source = top.length >= 2 ? 'historial DB' : top.length === 1 ? 'DB + default' : 'defaults'
  console.log(`[${niche}] países: ${[...discovery, 'PE'].join(', ')} (${source})`)
  return [...discovery, 'PE']
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

  // Resiliencia: un fallo en un nicho (LLM/red) no debe abortar los demás —
  // crítico al sembrar decenas de nichos en una sola corrida --all.
  let ok = 0
  let failed = 0
  for (const niche of niches) {
    try {
      const keywords = await resolveKeywords(niche)
      const countries = await resolveCountries(niche)
      await scrapeNiche(niche, { keywords, countries })
      ok++
    } catch (e) {
      failed++
      console.error(`✗ [${niche}]: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    }
  }
  if (niches.length > 1) console.log(`\n═══ ${ok} nichos OK · ${failed} fallidos ═══`)
}

main().catch((e) => { console.error(e); process.exit(1) })
