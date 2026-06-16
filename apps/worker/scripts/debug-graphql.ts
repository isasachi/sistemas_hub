// Fase 0 (temporal): vuelca respuestas GraphQL reales de Meta Ads Library para
// mapear los campos del creativo, ad_count y fechas antes de tocar el scraper.
//   npx tsx scripts/debug-graphql.ts [keyword] [country]
// Escribe /tmp/ph_search.json (búsqueda) y /tmp/ph_page.json (vista de página).
import './bootstrap'
import { chromium, type Page, type Response } from 'playwright'
import fs from 'fs'

const KEYWORD = process.argv[2] ?? 'rodillera'
const COUNTRY = process.argv[3] ?? 'MX'

function searchUrl(keyword: string, country: string): string {
  const p = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country,
    is_targeted_country: 'false', media_type: 'all',
    q: keyword, search_type: 'keyword_unordered',
  })
  return `https://www.facebook.com/ads/library/?${p}`
}

function pageUrl(pageId: string): string {
  const p = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: 'ALL',
    is_targeted_country: 'false', media_type: 'all', search_type: 'page',
    'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
    view_all_page_id: pageId,
  })
  return `https://www.facebook.com/ads/library/?${p}`
}

async function capture(page: Page, url: string): Promise<unknown[]> {
  const raw: Response[] = []
  const collect = (r: Response) => {
    if (r.url().includes('facebook.com/api/graphql') && r.status() === 200) raw.push(r)
  }
  page.on('response', collect)
  try {
    await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(8_000)
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('End')
      await page.waitForTimeout(1_500)
    }
  } finally {
    page.off('response', collect)
  }
  const out: unknown[] = []
  for (const r of raw) {
    try {
      const clean = (await r.text()).replace(/^for\s*\(\s*;;\s*\)\s*;/, '').trim()
      for (const line of clean.split('\n')) {
        if (!line.trim()) continue
        try { out.push(JSON.parse(line)) } catch { /* no-JSON */ }
      }
    } catch { /* ilegible */ }
  }
  return out
}

// Escaneo laxo: encuentra el primer objeto con ad_archive_id para sacar su page_id.
function findFirstAd(obj: unknown, depth = 0): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object' || depth > 25) return null
  const o = obj as Record<string, unknown>
  if (o.ad_archive_id ?? o.adArchiveID) return o
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const hit = findFirstAd(v, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

function findPageId(obj: unknown, depth = 0): string | null {
  if (!obj || typeof obj !== 'object' || depth > 25) return null
  const o = obj as Record<string, unknown>
  const pid = o.page_id ?? o.pageID
  if (pid) return String(pid)
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const hit = findPageId(v, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'es-419', timezoneId: 'America/Lima',
    viewport: { width: 1366, height: 768 },
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  const page = await context.newPage()

  try {
    console.log(`[search] ${KEYWORD} / ${COUNTRY} ...`)
    const search = await capture(page, searchUrl(KEYWORD, COUNTRY))
    fs.writeFileSync('/tmp/ph_search.json', JSON.stringify(search, null, 1))
    console.log(`  ${search.length} JSONs → /tmp/ph_search.json`)

    const firstAd = search.map((s) => findFirstAd(s)).find(Boolean)
    const pageId = firstAd ? findPageId(firstAd) ?? findPageId(search.find((s) => findFirstAd(s))) : null
    if (!pageId) { console.error('No se encontró page_id en la búsqueda'); return }

    console.log(`[page] view_all_page_id=${pageId} ...`)
    const pageResp = await capture(page, pageUrl(pageId))
    fs.writeFileSync('/tmp/ph_page.json', JSON.stringify(pageResp, null, 1))
    const total = await page.evaluate(() => {
      const m = document.body.innerText.match(/~?([\d,.]+)\s*(results?|resultados?)/i)
      return m ? m[0] : '(no visible)'
    })
    console.log(`  ${pageResp.length} JSONs → /tmp/ph_page.json · DOM total: ${total}`)
  } finally {
    await browser.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
