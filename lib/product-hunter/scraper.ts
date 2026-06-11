import { chromium, type Page, type Response } from 'playwright'
import {
  seedKeywords,
  COUNTRIES,
  FALLBACK_COUNTRIES,
  MIN_CANDIDATES_BEFORE_FALLBACK,
} from './keywords'
import { upsertProducts, updateNicheAfterScrape, upsertNiche } from './db'
import type { CreativeSnippet } from './types'

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

export function searchUrl(keyword: string, country: string): string {
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

// La PRIMERA tanda de resultados no llega por GraphQL: viene embebida como JSON
// inline en <script type="application/json"> (payload Relay del SSR). En la vista
// de página con pocos ads no hay paginación → sin esto el enrich ve 0 nodos.
// La estructura interna es la misma (search_results_connection → collated_results),
// así que estos payloads se escanean con el mismo scanAdNodes.
async function readInlineAdData(page: Page): Promise<unknown[]> {
  const texts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[type="application/json"]'))
      .map((s) => s.textContent ?? '')
      .filter((t) => t.includes('"ad_archive_id"') || t.includes('"search_results_connection"'))
  )
  const out: unknown[] = []
  for (const t of texts) {
    try { out.push(JSON.parse(t)) } catch { /* script no-JSON */ }
  }
  return out
}

// Busca el total exacto de ads del anunciante: search_results_connection.count.
// Más confiable que el "~X results" del DOM (que es aproximado).
function findConnectionCount(obj: unknown, depth = 0): number | null {
  if (!obj || typeof obj !== 'object' || depth > 25) return null
  const o = obj as Record<string, unknown>
  const conn = o.search_results_connection as Record<string, unknown> | undefined
  if (conn && typeof conn.count === 'number') return conn.count
  for (const val of Object.values(o)) {
    if (val && typeof val === 'object') {
      const hit = findConnectionCount(val, depth + 1)
      if (hit !== null) return hit
    }
  }
  return null
}

// Colectamos los Response síncronamente y leemos el body DESPUÉS de navegar
// (evita race conditions; Playwright bufferea los bodies).
export async function navigateAndCapture(page: Page, url: string): Promise<unknown[]> {
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

  // La primera tanda viene inline en el HTML, no por GraphQL (ver readInlineAdData)
  captured.push(...(await readInlineAdData(page).catch(() => [] as unknown[])))

  if (captured.length === 0) {
    const title = await page.title()
    console.error(`[DEBUG] 0 payloads (GraphQL+inline) — title="${title}" url=${page.url()}`)
  }

  return captured
}

// ─── SCANNER DE NODOS ─────────────────────────────────────────────────────────

export interface AdNode {
  adArchiveID: string
  pageID: string
  pageName: string
  startDate: number | null
  // Datos ricos del snapshot (Fase 1) — lo que el agente original "leía" del anuncio
  bodyText: string | null
  title: string | null
  ctaText: string | null
  linkUrl: string | null
  pageCategories: string[]
}

// Creativo compacto para raw_data (tipo en types.ts) — truncado para no inflar
// DB ni tokens del análisis
const MAX_CREATIVE_BODY = 300
const MAX_CREATIVES = 3

function extractSnapshot(o: Record<string, unknown>): Pick<AdNode, 'bodyText' | 'title' | 'ctaText' | 'linkUrl' | 'pageCategories'> {
  const snap = (o.snapshot ?? null) as Record<string, unknown> | null
  const body = (snap?.body ?? null) as Record<string, unknown> | null
  const cards = (Array.isArray(snap?.cards) ? snap?.cards : []) as Record<string, unknown>[]
  const card = cards[0] ?? null
  // body.text vive en snapshot.body; en ads carousel el texto está en cards[]
  const bodyText = (typeof body?.text === 'string' && body.text) || (typeof card?.body === 'string' && card.body) || null
  const title = (typeof snap?.title === 'string' && snap.title) || (typeof card?.title === 'string' && card.title) || null
  const ctaText = (typeof snap?.cta_text === 'string' && snap.cta_text) || (typeof card?.cta_text === 'string' && card.cta_text) || null
  const linkUrl = (typeof snap?.link_url === 'string' && snap.link_url) || (typeof card?.link_url === 'string' && card.link_url) || null
  const pageCategories = (Array.isArray(snap?.page_categories) ? snap.page_categories : [])
    .filter((c): c is string => typeof c === 'string')
  return { bodyText, title, ctaText, linkUrl, pageCategories }
}

// Resume los creativos únicos de un set de nodos (para raw_data.creatives)
export function summarizeCreatives(nodes: AdNode[]): CreativeSnippet[] {
  const seen = new Set<string>()
  const out: CreativeSnippet[] = []
  for (const n of nodes) {
    if (!n.bodyText && !n.title) continue
    const key = `${n.bodyText ?? ''}|${n.title ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      body: n.bodyText ? n.bodyText.slice(0, MAX_CREATIVE_BODY) : null,
      title: n.title,
      cta: n.ctaText,
      link: n.linkUrl,
    })
    if (out.length >= MAX_CREATIVES) break
  }
  return out
}

// Busca recursivamente nodos que parezcan anuncios. Soporta camelCase y snake_case.
// page_name vive en el nodo padre (patrón collated_results de Meta) → se propaga.
export function scanAdNodes(
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
      ...extractSnapshot(o),
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
  // Datos ricos capturados en la búsqueda (fallback si el enrich no trae nodos)
  creatives: CreativeSnippet[]
  pageCategories: string[]
}

async function collectFromSearch(
  page: Page, keyword: string, country: string, seen: Set<string>
): Promise<Omit<Candidate, 'keyword' | 'country'>[]> {
  process.stdout.write(`  [${country}] "${keyword}" ... `)
  const responses = await navigateAndCapture(page, searchUrl(keyword, country))
  const adNodes = responses.flatMap((r) => scanAdNodes(r))

  // Agrupar nodos por página: una página puede aparecer con varios ads y los
  // creativos de todos suman señal para identificar el producto.
  const byPage = new Map<string, AdNode[]>()
  for (const node of adNodes) {
    const group = byPage.get(node.pageID) ?? []
    group.push(node)
    byPage.set(node.pageID, group)
  }

  const fresh: Omit<Candidate, 'keyword' | 'country'>[] = []
  for (const [pageId, group] of byPage) {
    if (seen.has(pageId)) continue
    seen.add(pageId)
    const first = group[0]
    fresh.push({
      pageId,
      pageName: first.pageName,
      adId: first.adArchiveID,
      startDate: first.startDate,
      creatives: summarizeCreatives(group),
      pageCategories: first.pageCategories,
    })
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
  // page_id conocido se propaga como parent: en la vista de página algunos
  // payloads no repiten page_id por nodo.
  const adNodes = responses.flatMap((r) => scanAdNodes(r, [], c.pageId, c.pageName))
    .filter((n) => n.pageID === c.pageId)

  // Total exacto del payload (search_results_connection.count) > DOM "~X" > nodos
  const exactCount = responses.map((r) => findConnectionCount(r)).find((n) => n !== null) ?? null
  const adCount = exactCount ?? (await readTotalFromDom(page)) ?? adNodes.length

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

  // Creativos: los de la página del anunciante (más completos) o los de la búsqueda
  const creatives = summarizeCreatives(adNodes)
  const finalCreatives = creatives.length ? creatives : c.creatives
  const pageCategories = adNodes.find((n) => n.pageCategories.length)?.pageCategories ?? c.pageCategories

  console.log(`✓  ${adCount} ads · ${daysRunning ?? '?'} días · ${finalCreatives.length} creativos`)
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
      page_categories: pageCategories,
      creatives: finalCreatives,
    },
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

// Setup compartido del browser (lo usa también la validación PE en vivo).
// ⚠️ NO usar playwright-stealth — rompe la SPA de Meta. Solo ocultar webdriver.
export async function launchScraperBrowser() {
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
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  const page = await context.newPage()
  return { browser, page }
}

export interface ScrapeOptions {
  // Keywords a buscar. Default: seed estático del nicho, o el nicho a secas.
  // scripts/scrape.ts pasa aquí las keywords expandidas (DB/LLM).
  keywords?: string[]
  // Países a recorrer. Default: LATAM+PE con fallback automático a US/ES si la
  // pasada inicial junta pocos candidatos. Pasar países explícitos (ej. solo
  // US/ES en la pasada de garantía) desactiva el fallback interno.
  countries?: readonly string[]
}

export async function scrapeNiche(niche: string, opts: ScrapeOptions = {}): Promise<void> {
  const keywords = opts.keywords ?? seedKeywords(niche) ?? [niche]
  const countries = opts.countries ?? COUNTRIES
  const useFallback = !opts.countries
  console.log(`\nNiche: "${niche}"  |  ${keywords.length} keywords: ${keywords.join(', ')}\n`)

  const { browser, page } = await launchScraperBrowser()

  try {
    const seen = new Set<string>()
    const candidates: Candidate[] = []

    console.log('─── Fase 1: recolectando candidatos ───')
    for (const country of countries) {
      for (const keyword of keywords) {
        const found = await collectFromSearch(page, keyword, country, seen)
        candidates.push(...found.map((f) => ({ ...f, keyword, country })))
      }
    }

    // Fallback del modelo original: si LATAM no dio suficiente data, ampliar
    // a US/ES con las mismas keywords (el dedupe por page_id ya está en `seen`).
    if (useFallback && candidates.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
      console.log(
        `\nSolo ${candidates.length} candidatos en LATAM (<${MIN_CANDIDATES_BEFORE_FALLBACK}) — ampliando a ${FALLBACK_COUNTRIES.join(', ')}`
      )
      for (const country of FALLBACK_COUNTRIES) {
        for (const keyword of keywords) {
          const found = await collectFromSearch(page, keyword, country, seen)
          candidates.push(...found.map((f) => ({ ...f, keyword, country })))
        }
      }
    }
    console.log(`\nTotal candidatos únicos: ${candidates.length}\n`)

    console.log('─── Fase 2: enriqueciendo candidatos ───')
    // Guardado incremental: con cientos de candidatos el enrich tarda horas;
    // upsert por lotes para que un corte/crash no pierda todo lo ya enriquecido.
    const SAVE_BATCH = 15
    let saved = 0
    let batch: EnrichedProduct[] = []
    for (const c of candidates) {
      const product = await enrichCandidate(page, c, niche)
      if (product) batch.push(product)
      if (batch.length >= SAVE_BATCH) {
        await upsertProducts(batch)
        saved += batch.length
        batch = []
      }
    }
    if (batch.length) {
      await upsertProducts(batch)
      saved += batch.length
    }

    if (saved > 0) {
      await updateNicheAfterScrape(niche, saved)
      console.log(`\n✓ ${saved} productos guardados para "${niche}"`)
    } else {
      await upsertNiche(niche, 'active')
      console.log(`\nSin productos encontrados para "${niche}"`)
    }
  } finally {
    await browser.close()
  }
}
