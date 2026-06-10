import { chromium, type Page, type Response } from 'playwright'
import { loadKeywords, COUNTRIES } from './keywords'
import { upsertProducts, updateNicheAfterScrape, upsertNiche } from './db'

// ⚠️ Corre SOLO en GitHub Actions (necesita un browser real). Nunca en Vercel.
// Portado del scraper Python. Notas críticas conservadas:
//  - Meta Ads Library es una SPA React: se interceptan las respuestas GraphQL,
//    NO se parsea el DOM (excepto el "~X results" para el ad_count).
//  - NO se usa playwright-stealth: rompe el JS de la SPA (0 respuestas GraphQL).
//    Solo se oculta navigator.webdriver con un init script.

const NAV_TIMEOUT = 30_000
const WAIT_MS = 8_000
const SCROLL_WAIT = 1_500
const SCROLL_PASSES = 3

// ─── URLS ─────────────────────────────────────────────────────────────────────

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

// ─── INTERCEPTOR GRAPHQL ──────────────────────────────────────────────────────

// Lee el total del DOM: Meta siempre renderiza "~X results" en texto visible.
async function readTotalFromDom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = document.body.innerText.match(/~?([\d,]+)\s*results?/i)
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0
  })
}

// Colectamos los Response síncronamente y leemos el body DESPUÉS de navegar
// (evita race conditions; Playwright bufferea los bodies).
async function navigateAndCapture(page: Page, url: string): Promise<unknown[]> {
  const rawResponses: Response[] = []
  const collect = (r: Response) => {
    if (!r.url().includes('facebook.com/api/graphql')) return
    if (r.status() !== 200) return
    rawResponses.push(r)
  }

  page.on('response', collect)
  try {
    await page.goto(url, { timeout: NAV_TIMEOUT, waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(WAIT_MS)
    for (let i = 0; i < SCROLL_PASSES; i++) {
      await page.keyboard.press('End')
      await page.waitForTimeout(SCROLL_WAIT)
    }
  } finally {
    page.off('response', collect)
  }

  const captured: unknown[] = []
  for (const r of rawResponses) {
    try {
      const text = await r.text()
      // Facebook prefija con "for(;;);" y manda múltiples JSON por línea (lfjson)
      const clean = text.replace(/^for\s*\(\s*;;\s*\)\s*;/, '').trim()
      for (const line of clean.split('\n')) {
        if (!line.trim()) continue
        try { captured.push(JSON.parse(line)) } catch { /* línea no-JSON */ }
      }
    } catch { /* body no legible */ }
  }

  if (rawResponses.length === 0) {
    const title = await page.title()
    console.error(`[DEBUG] 0 GraphQL responses — title="${title}" url=${page.url()}`)
  } else if (captured.length === 0) {
    const sample = await rawResponses[0].text().catch(() => '(no legible)')
    console.error(`[DEBUG] ${rawResponses.length} responses, 0 parseadas. Primeros 500 chars:\n${sample.slice(0, 500)}`)
  } else {
    const nodes = captured.flatMap((r) => scanAdNodes(r))
    if (nodes.length === 0) {
      const first = captured[0] as Record<string, unknown>
      console.error(`[DEBUG] ${captured.length} JSONs parseados, 0 nodos. Keys: ${Object.keys(first).join(', ')}`)
    }
  }

  return captured
}

// ─── SCANNER DE NODOS ─────────────────────────────────────────────────────────

interface AdNode {
  adArchiveID: string
  pageID: string
  pageName: string
  startDate: number | null
}

// Busca recursivamente nodos que parezcan anuncios. Soporta camelCase y snake_case.
// page_name vive en el nodo padre (patrón collated_results de Meta) → se propaga.
function scanAdNodes(
  obj: unknown,
  found: AdNode[] = [],
  parentPageId: string | null = null,
  parentPageName: string | null = null,
  depth = 0
): AdNode[] {
  if (!obj || typeof obj !== 'object' || depth > 25) return found
  const o = obj as Record<string, unknown>

  const adId = (o.adArchiveID ?? o.ad_archive_id) as string | number | undefined
  const pageId = (o.pageID ?? o.page_id ?? parentPageId) as string | number | null | undefined
  const pageName = (o.pageName ?? o.page_name ?? parentPageName ?? '') as string
  const startDate = (o.startDate ?? o.start_date) as number | undefined

  if (adId && pageId) {
    found.push({
      adArchiveID: String(adId),
      pageID: String(pageId),
      pageName,
      startDate: typeof startDate === 'number' ? startDate : null,
    })
    return found
  }

  const ctxPageId = (o.page_id ?? o.pageID ?? parentPageId) as string | null
  const ctxPageName = (o.page_name ?? o.pageName ?? parentPageName) as string | null

  for (const val of Object.values(o)) {
    if (Array.isArray(val)) val.forEach((v) => scanAdNodes(v, found, ctxPageId, ctxPageName, depth + 1))
    else if (val && typeof val === 'object') scanAdNodes(val, found, ctxPageId, ctxPageName, depth + 1)
  }
  return found
}

// ─── FASE 1: search → candidatos únicos ──────────────────────────────────────

interface Candidate {
  pageId: string
  pageName: string
  adId: string
  startDate: number | null
  keyword: string
  country: string
}

async function collectFromSearch(
  page: Page, keyword: string, country: string, seen: Set<string>
): Promise<Omit<Candidate, 'keyword' | 'country'>[]> {
  process.stdout.write(`  [${country}] "${keyword}" ... `)
  const responses = await navigateAndCapture(page, searchUrl(keyword, country))
  const adNodes = responses.flatMap((r) => scanAdNodes(r))

  const fresh: Omit<Candidate, 'keyword' | 'country'>[] = []
  for (const node of adNodes) {
    if (seen.has(node.pageID)) continue
    seen.add(node.pageID)
    fresh.push({ pageId: node.pageID, pageName: node.pageName, adId: node.adArchiveID, startDate: node.startDate })
  }
  console.log(`${fresh.length} nuevos (${adNodes.length} nodos)`)
  return fresh
}

// ─── FASE 2: enriquecer candidato ────────────────────────────────────────────

interface EnrichedProduct {
  id: string
  niche: string
  page_id: string
  name: string
  raw_data: Record<string, unknown>
}

async function enrichCandidate(page: Page, c: Candidate, niche: string): Promise<EnrichedProduct | null> {
  process.stdout.write(`  ${c.pageId}  ${c.pageName} ... `)
  const responses = await navigateAndCapture(page, pageUrl(c.pageId))
  const adNodes = responses.flatMap((r) => scanAdNodes(r))

  const adCount = (await readTotalFromDom(page)) || adNodes.length

  let daysRunning: number | null = null
  let oldestDate: string | null = null
  const timestamps = adNodes
    .map((n) => n.startDate)
    .filter((d): d is number => typeof d === 'number' && d > 0)
    .map((d) => d * 1000)

  const source = timestamps.length ? Math.min(...timestamps) : (c.startDate ? c.startDate * 1000 : null)
  if (source) {
    oldestDate = new Date(source).toISOString().split('T')[0]
    daysRunning = Math.floor((Date.now() - source) / 86_400_000)
  }

  const adId = c.adId || adNodes[0]?.adArchiveID || null
  if (!adId) { console.log('sin ad_id, omitido'); return null }

  console.log(`✓  ${adCount} ads · ${daysRunning ?? '?'} días`)
  return {
    id: adId,
    niche,
    page_id: c.pageId,
    name: c.pageName,
    raw_data: {
      page_id: c.pageId,
      ad_id: adId,
      advertiser_name: c.pageName,
      ad_count: adCount,
      days_running: daysRunning,
      oldest_date: oldestDate,
      found_keyword: c.keyword,
      found_country: c.country,
    },
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export async function scrapeNiche(niche: string): Promise<void> {
  const keywords = loadKeywords(niche)
  console.log(`\nNiche: "${niche}"  |  Keywords: ${keywords.join(', ')}\n`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'es-419',
    timezoneId: 'America/Lima',
    viewport: { width: 1366, height: 768 },
  })
  // Ocultar navigator.webdriver SIN playwright-stealth (que rompe la SPA de Meta)
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  const page = await context.newPage()

  try {
    const seen = new Set<string>()
    const candidates: Candidate[] = []

    console.log('─── Fase 1: recolectando candidatos ───')
    for (const country of COUNTRIES) {
      for (const keyword of keywords) {
        const found = await collectFromSearch(page, keyword, country, seen)
        candidates.push(...found.map((f) => ({ ...f, keyword, country })))
      }
    }
    console.log(`\nTotal candidatos únicos: ${candidates.length}\n`)

    console.log('─── Fase 2: enriqueciendo candidatos ───')
    const products: EnrichedProduct[] = []
    for (const c of candidates) {
      const product = await enrichCandidate(page, c, niche)
      if (product) products.push(product)
    }

    if (products.length) {
      await upsertProducts(products)
      await updateNicheAfterScrape(niche, products.length)
      console.log(`\n✓ ${products.length} productos guardados para "${niche}"`)
    } else {
      await upsertNiche(niche, 'active')
      console.log(`\nSin productos encontrados para "${niche}"`)
    }
  } finally {
    await browser.close()
  }
}
