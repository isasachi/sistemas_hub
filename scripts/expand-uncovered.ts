// Garantía de output (Fase 3.5) — corre en GitHub Actions DESPUÉS del análisis.
//   npx tsx scripts/expand-uncovered.ts --niche espalda
//   npx tsx scripts/expand-uncovered.ts            (todos los nichos activos)
//
// Si un nicho ya analizado quedó sin ganadores (0 productos alta/media frescos),
// amplía la red una sola vez: re-scrapea con las mismas keywords en US/ES
// (fallback del modelo original). El workflow corre analyze.ts de nuevo después
// para puntuar los productos nuevos. El flag ph_niches.expanded evita repetir
// la ampliación en cada corrida del cron.
//
// ⚠️ COSTO: $0 LLM aquí — solo Playwright en el runner self-hosted.
import './bootstrap'
import { scrapeNiche } from '../lib/product-hunter/scraper'
import {
  getActiveNiches,
  getNicheStatus,
  countNicheWinners,
  markNicheExpanded,
} from '../lib/product-hunter/db'
import { seedKeywords, FALLBACK_COUNTRIES } from '../lib/product-hunter/keywords'

async function main() {
  const args = process.argv.slice(2)
  const nicheIdx = args.indexOf('--niche')

  let niches: string[]
  if (nicheIdx !== -1 && args[nicheIdx + 1]) {
    niches = [args[nicheIdx + 1]]
  } else {
    niches = (await getActiveNiches()).map((n) => n.id)
  }

  for (const niche of niches) {
    const row = await getNicheStatus(niche)
    if (!row || row.status !== 'active') continue
    if (row.expanded) continue // ya se amplió una vez — no repetir

    const winners = await countNicheWinners(niche)
    if (winners > 0) {
      console.log(`[${niche}] ${winners} ganadores — sin ampliación`)
      continue
    }

    const keywords = row.keywords?.length ? row.keywords : seedKeywords(niche) ?? [niche]
    console.log(`[${niche}] 0 ganadores — ampliando a ${FALLBACK_COUNTRIES.join(', ')} (${keywords.length} keywords)`)
    await scrapeNiche(niche, { keywords, countries: FALLBACK_COUNTRIES })
    await markNicheExpanded(niche)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
