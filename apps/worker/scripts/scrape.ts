// CLI del scraper — corre en GitHub Actions.
//   npx tsx scripts/scrape.ts --niche espalda
//   npx tsx scripts/scrape.ts --all          (todos los nichos pendientes/vencidos)
//
// ⚠️ Para corridas --all el workflow usa scripts/pipeline.ts (scrape + análisis
// entrelazados por nicho). Este CLI queda para nichos puntuales y debug.
// Keywords/países por nicho: ver scripts/resolve.ts.
import './bootstrap' // env + polyfill WebSocket — debe ir primero
import { scrapeNiche } from '../lib/product-hunter/scraper'
import { getNichesToRefresh } from '@ph/shared'
import { ALL_NICHES } from '@ph/shared'
import { resolveKeywords, resolveCountries } from './resolve'

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
