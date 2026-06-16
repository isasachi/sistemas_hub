// Validación PE en vivo (Fase 4) — CLI standalone.
//   npx tsx scripts/validate-pe.ts --niche rodilla
//   npx tsx scripts/validate-pe.ts            (todos los nichos activos)
//
// La lógica vive en lib/product-hunter/pe-validation.ts (reusada por pipeline.ts
// para validar por-bloque con el browser caliente). Este archivo solo arma el
// browser y itera los nichos.
//
// ⚠️ COSTO: $0 LLM — solo Playwright.
import './bootstrap'
import { launchScraperContext, CONCURRENCY } from '../lib/product-hunter/scraper'
import { getActiveNiches, ALL_NICHES } from '@ph/shared'
import { validateNiche } from '../lib/product-hunter/pe-validation'

async function main() {
  const args = process.argv.slice(2)
  const nicheIdx = args.indexOf('--niche')
  // Sin --niche: todos los nichos activos del DB (incluye los creados por
  // usuarios, que el mapa estático ALL_NICHES no conoce).
  const niches =
    nicheIdx !== -1 && args[nicheIdx + 1]
      ? [args[nicheIdx + 1]]
      : await getActiveNiches().then((rows) => (rows.length ? rows.map((n) => n.id) : ALL_NICHES))

  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  try {
    for (const niche of niches) await validateNiche(pages, niche)
  } finally {
    await browser.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
