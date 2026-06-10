// CLI del scraper — corre en GitHub Actions.
//   npx tsx scripts/scrape.ts --niche espalda
//   npx tsx scripts/scrape.ts --all          (todos los nichos pendientes/vencidos)
import './bootstrap' // env + polyfill WebSocket — debe ir primero
import { scrapeNiche } from '../lib/product-hunter/scraper'
import { getNichesToRefresh } from '../lib/product-hunter/db'
import { ALL_NICHES } from '../lib/product-hunter/keywords'

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
    await scrapeNiche(niche)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
