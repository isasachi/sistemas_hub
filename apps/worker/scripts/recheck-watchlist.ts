// Re-chequeo de la watchlist de casi-ganadores (plan 13 parte E) — corre en el
// cron DESPUÉS del scrape/análisis.
//   npx tsx scripts/recheck-watchlist.ts            (todos los nichos)
//   npx tsx scripts/recheck-watchlist.ts --niche rodilla
//
// Re-visita la página de cada casi-ganador vencido (last_checked > 5 días): si
// ya cumple las reglas de oro (≥40 ads · ≥10 días) lo PROMUEVE a ph_products
// (el análisis lo toma solo por score IS NULL); si no, refresca last_checked.
// $0 LLM — solo Playwright. Inventario futuro casi gratis.
import './bootstrap'
import {
  launchScraperContext,
  navigateAndCapture,
  scanAdNodes,
  findConnectionCount,
  pageUrl,
  runPool,
  CONCURRENCY,
} from '../lib/product-hunter/scraper'
import {
  getActiveNicheIds,
  getWatchlistToRecheck,
  upsertProducts,
  removeFromWatchlist,
  touchWatchlist,
} from '@ph/shared'
import { goldenDiscard } from '../lib/product-hunter/quick-discard'
import type { WatchlistRow } from '@ph/shared'
import type { Page } from 'playwright'

const MAX_AGE_DAYS = Number(process.env.PH_WATCHLIST_TTL_DAYS ?? 5)
const PER_NICHE = Number(process.env.PH_WATCHLIST_LIMIT ?? 15)

// Re-mide ad_count y days_running de la página del anunciante (como enrichCandidate
// pero sin creativos — solo necesitamos los counts para la regla de oro).
async function remeasure(page: Page, row: WatchlistRow): Promise<{ adCount: number; daysRunning: number | null }> {
  const responses = await navigateAndCapture(page, pageUrl(row.page_id ?? ''))
  const nodes = responses.flatMap((r) => scanAdNodes(r, [], row.page_id, row.name)).filter((n) => n.pageID === row.page_id)
  const exact = responses.map((r) => findConnectionCount(r)).find((n) => n !== null) ?? null
  const adCount = exact ?? nodes.length

  const ts = nodes.map((n) => n.startDate).filter((d): d is number => typeof d === 'number' && d > 0).map((d) => d * 1000)
  const oldest = ts.length ? Math.min(...ts) : null
  const daysRunning = oldest ? Math.floor((Date.now() - oldest) / 86_400_000) : null
  return { adCount, daysRunning }
}

async function recheckNiche(pages: Page[], niche: string) {
  const rows = await getWatchlistToRecheck(niche, MAX_AGE_DAYS, PER_NICHE)
  if (!rows.length) return
  console.log(`[${niche}] re-chequeando ${rows.length} casi-ganadores`)

  const promoted: typeof rows = []
  await runPool(rows, pages, async (row, page) => {
    try {
      const { adCount, daysRunning } = await remeasure(page, row)
      if (goldenDiscard(adCount, daysRunning) === null) {
        // Maduró → promover a ph_products con los counts frescos (score queda
        // null → el análisis lo toma en la próxima pasada).
        await upsertProducts([{
          id: row.id,
          niche: row.niche,
          page_id: row.page_id ?? '',
          name: row.name ?? row.raw_data.advertiser_name,
          raw_data: { ...row.raw_data, ad_count: adCount, days_running: daysRunning },
        }])
        promoted.push(row)
        console.log(`  ✓ ${row.name} maduró → ${adCount} ads · ${daysRunning} días — promovido`)
      } else {
        await touchWatchlist(row.id)
      }
    } catch (e) {
      console.error(`  ✗ ${row.name}: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    }
  })

  if (promoted.length) await removeFromWatchlist(promoted.map((r) => r.id))
  console.log(`[${niche}] ${promoted.length} promovidos de ${rows.length} revisados`)
}

async function main() {
  const args = process.argv.slice(2)
  const nicheIdx = args.indexOf('--niche')
  const niches = nicheIdx !== -1 && args[nicheIdx + 1] ? [args[nicheIdx + 1]] : await getActiveNicheIds()

  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  try {
    for (const niche of niches) await recheckNiche(pages, niche)
  } finally {
    await browser.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
