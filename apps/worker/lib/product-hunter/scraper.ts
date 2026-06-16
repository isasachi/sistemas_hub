import { chromium, type Page, type Response } from 'playwright'
import {
  seedKeywords,
  COUNTRIES,
  FALLBACK_COUNTRIES,
  MIN_CANDIDATES_BEFORE_FALLBACK,
} from '@ph/shared'
import { upsertProducts, upsertPePool, upsertWatchlist, updateNicheAfterScrape, upsertNiche } from '@ph/shared'
import type { AdNode, CreativeSnippet } from '@ph/shared'
import { quickDiscard, goldenDiscard, isNearWinner } from './quick-discard'
import { extractFromDom } from './dom-fallback'
import { prescore } from '@ph/shared'

// Re-export para consumidores externos (validate-pe.ts usa el tipo indirectamente)
export type { AdNode }

// ⚠️ Corre SOLO en GitHub Actions (necesita un browser real). Nunca en Vercel.
// Portado del scraper Python. Notas críticas conservadas:
//  - Meta Ads Library es una SPA React: se interceptan las respuestas GraphQL,
//    NO se parsea el DOM (excepto el "~X results" para el ad_count).
//  - NO se usa playwright-stealth: rompe el JS de la SPA (0 respuestas GraphQL).
//    Solo se oculta navigator.webdriver con un init script.

const NAV_TIMEOUT = 30_000
const WAIT_MS = 8_000
const SCROLL_WAIT = 1_500
// Pasadas de scroll por navegación (cada una ~SCROLL_WAIT carga más nodos).
// Configurable (plan 13 parte D) para experimentar nodos/búsqueda SIN cambiar el
// default 3 — subir vía PH_SCROLL_PASSES y comparar la métrica antes de fijarlo.
const SCROLL_PASSES = Math.max(1, Number(process.env.PH_SCROLL_PASSES ?? 3))

// Navegaciones en paralelo dentro del mismo browser context. Cada navegación
// gasta ~12s ESPERANDO (no CPU), así que N pages multiplican el throughput ~N×
// sin tocar los timings. ⚠️ La IP residencial es el recurso escaso: 3 es el
// balance entre velocidad y riesgo de que Meta sirva vacíos / bloquee la IP.
// Exportado: validate-pe.ts usa el mismo pool para sus búsquedas PE en vivo.
export const CONCURRENCY = Math.max(1, Number(process.env.PH_CONCURRENCY ?? 3))

// ─── Presupuesto de tiempo por nicho ──────────────────────────────────────────
// Las búsquedas traen cientos/miles de candidatos pero el análisis solo procesa
// PH_ANALYZE_LIMIT (50) por corrida — enriquecer la cola larga de candidatos
// débiles es trabajo perdido. Dos topes ($0, configurables; 0 = sin tope):

// Corta la Fase 1 discovery al juntar este nº de candidatos únicos (las
// keywords restantes mayormente traen duplicados). PE nunca se corta.
// Default 300 (plan 13 parte B): ventana amplia para más inventario; bajar por
// env en corridas con presupuesto de tiempo apretado.
const SEARCH_CAP = Math.max(0, Number(process.env.PH_SEARCH_CAP ?? 300))

// Solo el top-K de candidatos discovery (por señal de card, prescore P_w)
// recibe la navegación de enrich (~14s c/u). El resto se descarta.
// Default 150 (plan 13 parte B): ~3× el batch de análisis, deja margen para que
// el goldenDiscard post-enrich descarte sin quedarse corto de ganadores.
const ENRICH_LIMIT = Math.max(0, Number(process.env.PH_ENRICH_LIMIT ?? 150))

// Worker-pool de concurrencia acotada: cada page drena un índice compartido
// hasta agotar los items. Un fallo aislado no tumba el pool (PromiseSettled).
export async function runPool<T, R>(
  items: T[],
  pages: Page[],
  fn: (item: T, page: Page) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  await Promise.all(
    pages.map(async (page) => {
      while (true) {
        const i = next++
        if (i >= items.length) break
        try {
          results[i] = { status: 'fulfilled', value: await fn(items[i], page) }
        } catch (reason) {
          results[i] = { status: 'rejected', reason }
        }
      }
    })
  )
  return results
}

// ─── URLS ─────────────────────────────────────────────────────────────────────

export function searchUrl(keyword: string, country: string): string {
  const p = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country,
    is_targeted_country: 'false', media_type: 'all',
    q: keyword, search_type: 'keyword_unordered',
  })
  return `https://www.facebook.com/ads/library/?${p}`
}

export function pageUrl(pageId: string): string {
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
export function findConnectionCount(obj: unknown, depth = 0): number | null {
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

// Reintentos de navegación: Meta/red dan errores transitorios (DNS
// ERR_NAME_NOT_RESOLVED, timeouts puntuales) en el runner residencial. Un par de
// reintentos con backoff recupera el candidato sin perderlo. Si agota los
// intentos, relanza el error para que el caller lo capture y siga con el siguiente.
const NAV_RETRIES = 2
const NAV_RETRY_WAIT = 3_000

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= NAV_RETRIES; attempt++) {
    try {
      await page.goto(url, { timeout: NAV_TIMEOUT, waitUntil: 'domcontentloaded' })
      return
    } catch (e) {
      lastErr = e
      if (attempt < NAV_RETRIES) {
        const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
        console.error(`\n  [retry ${attempt + 1}/${NAV_RETRIES}] navegación falló (${msg}) — reintentando en ${NAV_RETRY_WAIT / 1000}s`)
        await page.waitForTimeout(NAV_RETRY_WAIT)
      }
    }
  }
  throw lastErr
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
    await gotoWithRetry(page, url)
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
// page_name y collation_count viven en el nodo padre (patrón collated_results de
// Meta) → se propagan a los nodos hijo.
export function scanAdNodes(
  obj: unknown,
  found: AdNode[] = [],
  parentPageId: string | null = null,
  parentPageName: string | null = null,
  parentCollationCount: number | null = null,
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
      collationCount: parentCollationCount,
      ...extractSnapshot(o),
    })
    return found
  }

  const ctxPageId = (o.page_id ?? o.pageID ?? parentPageId) as string | null
  const ctxPageName = (o.page_name ?? o.pageName ?? parentPageName) as string | null
  // collation_count / collationCount viven en el nodo "collated result" (mismo
  // nivel que page_id). Si no está en este nodo, se hereda del padre.
  const rawCollation = o.collation_count ?? o.collationCount
  const ctxCollationCount =
    typeof rawCollation === 'number' ? rawCollation : parentCollationCount

  for (const val of Object.values(o)) {
    if (Array.isArray(val)) {
      val.forEach((v) => scanAdNodes(v, found, ctxPageId, ctxPageName, ctxCollationCount, depth + 1))
    } else if (val && typeof val === 'object') {
      scanAdNodes(val, found, ctxPageId, ctxPageName, ctxCollationCount, depth + 1)
    }
  }
  return found
}

// ─── MÉTRICAS ─────────────────────────────────────────────────────────────────

interface ScrapeMetrics {
  searches: number
  zeroPayloads: number
  domFallbacks: number
  discarded: Record<string, number>
  enriched: number
  // Navegaciones que fallaron tras agotar los reintentos (búsqueda o enrich).
  navFailures: number
  // Presupuesto de tiempo: búsquedas no corridas por SEARCH_CAP, candidatos
  // discovery descartados por ENRICH_LIMIT, productos PE armados desde la card.
  searchesSkipped: number
  enrichSkipped: number
  peFromCard: number
}

function emptyMetrics(): ScrapeMetrics {
  return {
    searches: 0, zeroPayloads: 0, domFallbacks: 0, discarded: {}, enriched: 0,
    navFailures: 0, searchesSkipped: 0, enrichSkipped: 0, peFromCard: 0,
  }
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
  // Ads count de la card del anunciante — para el quick discard de Etapa 1.
  // null cuando el payload no incluye el campo (conservador: pasa al enrich).
  collationCount: number | null
  // Nodos de anuncio que la búsqueda devolvió para esta página — proxy de
  // volumen cuando collationCount falta (ranking de enrich y ad_count PE).
  nodesSeen: number
}

// Devuelve TODOS los candidatos de esta búsqueda (un entry por página). El dedupe
// entre búsquedas se hace globalmente tras la Fase 1 (concurrencia-safe: no se
// puede compartir un Set con check-then-add a través de awaits concurrentes).
async function collectFromSearch(
  page: Page, keyword: string, country: string, metrics: ScrapeMetrics
): Promise<Omit<Candidate, 'keyword' | 'country'>[]> {
  metrics.searches++
  const responses = await navigateAndCapture(page, searchUrl(keyword, country))
  let adNodes = responses.flatMap((r) => scanAdNodes(r))

  if (adNodes.length === 0) {
    metrics.zeroPayloads++
    const fallback = await extractFromDom(page)
    if (fallback.length > 0) {
      metrics.domFallbacks++
      adNodes = fallback
    }
  }

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
    const first = group[0]
    // collationCount: máximo entre los nodos del grupo (todos deberían tener el
    // mismo valor propagado del padre; max es defensivo para rarezas de schema).
    const collationCount = group.reduce<number | null>((max, n) => {
      if (n.collationCount === null) return max
      return max === null ? n.collationCount : Math.max(max, n.collationCount)
    }, null)
    fresh.push({
      pageId,
      pageName: first.pageName,
      adId: first.adArchiveID,
      startDate: first.startDate,
      creatives: summarizeCreatives(group),
      pageCategories: first.pageCategories,
      collationCount,
      nodesSeen: group.length,
    })
  }
  console.log(`  [${country}] "${keyword}" → ${fresh.length} páginas (${adNodes.length} nodos)`)
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

// Señal de calidad desde la card de búsqueda (sin navegar): mismo P_w del
// análisis, con collationCount (o nodos vistos como proxy débil) y startDate.
function cardSignal(c: Candidate): number {
  const adCount = c.collationCount ?? Math.min(c.nodesSeen, 20)
  const daysRunning = c.startDate
    ? Math.max(0, Math.floor(Date.now() / 1000 / 86_400 - c.startDate / 86_400))
    : null
  return prescore({ ad_count: adCount, days_running: daysRunning })
}

// Producto construido SOLO con datos de la card (sin visitar la página del
// anunciante). Para el pool PE: el matching de competidores usa nombre/creativos
// (ya capturados en búsqueda) y validate-pe trae los counts en vivo después —
// la navegación de enrich por anunciante PE era redundante (~14s c/u).
function productFromCard(c: Candidate, niche: string): EnrichedProduct | null {
  if (!c.adId) return null
  const adCount = c.collationCount ?? c.nodesSeen
  let daysRunning: number | null = null
  let oldestDate: string | null = null
  if (c.startDate) {
    oldestDate = new Date(c.startDate * 1000).toISOString().split('T')[0]
    daysRunning = Math.floor((Date.now() - c.startDate * 1000) / 86_400_000)
  }
  return {
    id: c.adId,
    niche,
    page_id: c.pageId,
    name: c.pageName,
    raw_data: {
      page_id: c.pageId,
      ad_id: c.adId,
      advertiser_name: c.pageName,
      ad_count: adCount,
      days_running: daysRunning,
      oldest_date: oldestDate,
      found_keyword: c.keyword,
      found_country: c.country,
      page_categories: c.pageCategories,
      creatives: c.creatives,
      source: 'search-card',
    },
  }
}

async function enrichCandidate(
  page: Page, c: Candidate, niche: string, metrics: ScrapeMetrics
): Promise<EnrichedProduct | null> {
  const responses = await navigateAndCapture(page, pageUrl(c.pageId))
  // page_id conocido se propaga como parent: en la vista de página algunos
  // payloads no repiten page_id por nodo.
  let adNodes = responses.flatMap((r) => scanAdNodes(r, [], c.pageId, c.pageName))
    .filter((n) => n.pageID === c.pageId)

  let usedDomFallback = false
  if (adNodes.length === 0) {
    metrics.zeroPayloads++
    const fallback = await extractFromDom(page)
    // En la vista de página solo hay un anunciante; si el DOM extrae exactamente
    // una página, la mapeamos al candidato que estamos enriqueciendo.
    const relevant = fallback.length === 1
      ? fallback.map((n) => ({ ...n, pageID: c.pageId, pageName: c.pageName }))
      : fallback.filter((n) => n.pageID === c.pageId)
    if (relevant.length > 0) {
      metrics.domFallbacks++
      usedDomFallback = true
      adNodes = relevant
    }
  }

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
  if (!adId) { console.log(`  ${c.pageId} ${c.pageName} → sin ad_id, omitido`); return null }

  // Creativos: los de la página del anunciante (más completos) o los de la búsqueda
  const creatives = summarizeCreatives(adNodes)
  const finalCreatives = creatives.length ? creatives : c.creatives
  const pageCategories = adNodes.find((n) => n.pageCategories.length)?.pageCategories ?? c.pageCategories

  console.log(`  ✓ ${c.pageName} → ${adCount} ads · ${daysRunning ?? '?'} días · ${finalCreatives.length} creativos`)
  metrics.enriched++
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
      // collationCount de la card del anunciante — numerador del filtro anti-catálogo.
      // null si el payload de búsqueda no incluyó el campo.
      main_product_ad_count: c.collationCount,
      ...(usedDomFallback ? { source: 'dom-fallback' } : {}),
    },
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

// Setup compartido del browser. Crea `pageCount` pages en un mismo context
// (comparten sesión/cookies; cada page navega y captura GraphQL de forma
// independiente). ⚠️ NO usar playwright-stealth — rompe la SPA de Meta. Solo
// ocultar webdriver.
export async function launchScraperContext(pageCount = 1) {
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
  const pages: Page[] = []
  for (let i = 0; i < Math.max(1, pageCount); i++) {
    pages.push(await context.newPage())
  }
  return { browser, pages }
}

// Wrapper de una sola page (validación PE en vivo, debug-graphql).
export async function launchScraperBrowser() {
  const { browser, pages } = await launchScraperContext(1)
  return { browser, page: pages[0] }
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
  console.log(`\nNiche: "${niche}"  |  ${keywords.length} keywords · concurrencia ${CONCURRENCY}: ${keywords.join(', ')}\n`)

  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  const metrics = emptyMetrics()

  // Recorre país×keyword en paralelo (pool de pages) y devuelve los candidatos
  // con su keyword/country. Los fallos por búsqueda se cuentan, no abortan.
  // `cap` > 0: corta al juntar ese nº de páginas únicas (las keywords restantes
  // mayormente traen duplicados) — se procesa por chunks para poder frenar.
  async function searchCountries(countriesToSearch: readonly string[], cap = 0): Promise<Candidate[]> {
    // Intercalado keyword×país (no país×keywords): así el SEARCH_CAP corta
    // keywords tardías cubriendo TODOS los países de las primeras, en vez de
    // llenarse con un país y dejar los demás sin correr (bug visto en rodilla:
    // el cap se llenó con MX y CO nunca corrió).
    const tasks = keywords.flatMap((keyword) =>
      countriesToSearch.map((country) => ({ keyword, country }))
    )
    const out: Candidate[] = []
    const uniquePages = new Set<string>()
    const chunkSize = pages.length * 2

    for (let start = 0; start < tasks.length; start += chunkSize) {
      const chunk = tasks.slice(start, start + chunkSize)
      const settled = await runPool(chunk, pages, async ({ keyword, country }, page) => {
        const found = await collectFromSearch(page, keyword, country, metrics)
        return found.map((f) => ({ ...f, keyword, country }))
      })
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i]
        if (r.status === 'fulfilled') {
          out.push(...r.value)
          for (const c of r.value) uniquePages.add(c.pageId)
        } else {
          metrics.navFailures++
          const msg = r.reason instanceof Error ? r.reason.message.split('\n')[0] : String(r.reason)
          console.log(`✗ búsqueda falló [${chunk[i].country}] "${chunk[i].keyword}": ${msg}`)
        }
      }
      if (cap > 0 && uniquePages.size >= cap) {
        const remaining = tasks.length - start - chunk.length
        if (remaining > 0) {
          metrics.searchesSkipped += remaining
          console.log(`  ⏹ tope de búsqueda: ${uniquePages.size} candidatos únicos ≥ ${cap} — ${remaining} búsquedas omitidas`)
        }
        break
      }
    }
    return out
  }

  // Dedupe global por pageId (concurrencia-safe: no compartimos Set entre awaits).
  // Mantiene el primer hit de cada página.
  function dedupe(cands: Candidate[]): Candidate[] {
    const byPage = new Map<string, Candidate>()
    for (const c of cands) if (!byPage.has(c.pageId)) byPage.set(c.pageId, c)
    return [...byPage.values()]
  }

  try {
    console.log('─── Fase 1: recolectando candidatos ───')
    // Discovery con tope (SEARCH_CAP); PE SIEMPRE completo — es el pool de
    // competidores locales y no se sacrifica por presupuesto de tiempo.
    const discoveryCountries = countries.filter((c) => c !== 'PE')
    const includePe = countries.includes('PE')
    let candidates = dedupe(await searchCountries(discoveryCountries, SEARCH_CAP))
    if (includePe) {
      candidates = dedupe([...candidates, ...(await searchCountries(['PE']))])
    }

    // Fallback del modelo original: si LATAM no dio suficiente data, ampliar
    // a US/ES con las mismas keywords (se re-deduplica el total acumulado).
    if (useFallback && candidates.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
      console.log(
        `\nSolo ${candidates.length} candidatos en LATAM (<${MIN_CANDIDATES_BEFORE_FALLBACK}) — ampliando a ${FALLBACK_COUNTRIES.join(', ')}`
      )
      candidates = dedupe([...candidates, ...(await searchCountries(FALLBACK_COUNTRIES, SEARCH_CAP))])
    }
    console.log(`\nTotal candidatos únicos: ${candidates.length}\n`)

    // ── Etapa 1: descarte rápido desde la card ────────────────────────────────
    // Replica el filtro pre-enrich del agente original: solo los candidatos que
    // superan el umbral de volumen (≥40 ads) y antigüedad (≥10 días) pasan a
    // la Fase 2. Los servicios se descartan siempre. Los PE no se descartan
    // (son el pool de competidores locales y siempre se enriquecen).
    console.log('─── Etapa 1: descarte rápido ───')
    const toEnrich: Candidate[] = []
    for (const c of candidates) {
      const reason = quickDiscard({
        pageName: c.pageName,
        pageCategories: c.pageCategories,
        collationCount: c.collationCount,
        startDate: c.startDate,
        foundCountry: c.country,
      })
      if (reason) {
        metrics.discarded[reason] = (metrics.discarded[reason] ?? 0) + 1
      } else {
        toEnrich.push(c)
      }
    }
    const discardSummary = Object.entries(metrics.discarded)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ') || 'ninguno'
    console.log(
      `  ${candidates.length - toEnrich.length} descartados (${discardSummary}) · ${toEnrich.length} pasan al enrich\n`
    )

    console.log('─── Fase 2: enriqueciendo candidatos ───')
    const products: EnrichedProduct[] = []
    const watchlist: (EnrichedProduct & { reason: string })[] = []

    // Pool PE → tabla ph_pe_pool, directo desde la card y SIN visitar la página.
    // ⚠️ REGLA DE ORO: un anunciante PE NUNCA entra a ph_products — solo
    // alimenta el matching de competencia. validate-pe trae counts en vivo.
    const peRows = toEnrich
      .filter((c) => c.country === 'PE')
      .map((c) => productFromCard(c, niche))
      .filter((p): p is EnrichedProduct => p !== null)
    if (peRows.length) {
      await upsertPePool(peRows)
      metrics.peFromCard = peRows.length
      console.log(`  ${peRows.length} anunciantes PE → pool de competidores (ph_pe_pool, 0 navegaciones)`)
    }

    // Discovery: solo el top-K por señal de card merece la navegación de
    // enrich — el análisis procesa 50/corrida; la cola débil es tiempo perdido.
    const ranked = toEnrich
      .filter((c) => c.country !== 'PE')
      .sort((a, b) => cardSignal(b) - cardSignal(a))
    const toVisit = ENRICH_LIMIT > 0 ? ranked.slice(0, ENRICH_LIMIT) : ranked
    metrics.enrichSkipped = ranked.length - toVisit.length
    if (metrics.enrichSkipped > 0) {
      console.log(`  ⏹ tope de enrich: ${toVisit.length} de ${ranked.length} candidatos (top por señal de card) — ${metrics.enrichSkipped} omitidos`)
    }

    // Enrich en paralelo (pool de pages). Se guarda en lotes al cerrar el nicho
    // (los nichos previos del --all ya quedaron salvados vía updateNicheAfterScrape).
    const settled = await runPool(toVisit, pages, (c, page) => enrichCandidate(page, c, niche, metrics))
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i]
      if (r.status === 'fulfilled') {
        if (!r.value) continue
        // ⚠️ REGLAS DE ORO (Etapa 2): con los datos EXACTOS del enrich, el
        // filtro es estricto — <40 ads, <10 días o antigüedad desconocida
        // NUNCA se guardan en ph_products (requisito explícito del usuario).
        const raw = r.value.raw_data as { ad_count: number; days_running: number | null; main_product_ad_count?: number | null }
        const reason = goldenDiscard(raw.ad_count, raw.days_running, raw.main_product_ad_count)
        if (reason) {
          metrics.discarded[`oro_${reason}`] = (metrics.discarded[`oro_${reason}`] ?? 0) + 1
          // Casi-ganador (plan 13 E): tracción suficiente → a la watchlist para
          // re-chequear, en vez de perderlo. El cron lo promueve si madura.
          if (isNearWinner(raw.ad_count, raw.days_running)) {
            watchlist.push({ ...r.value, reason: `oro_${reason}` })
          }
          console.log(`  ⊘ ${r.value.name} → ${raw.ad_count} ads · ${raw.days_running ?? '?'} días — regla de oro (${reason})`)
        } else {
          products.push(r.value)
        }
      } else {
        metrics.navFailures++
        const c = toVisit[i]
        const msg = r.reason instanceof Error ? r.reason.message.split('\n')[0] : String(r.reason)
        console.log(`✗ enrich falló (${c.pageId} ${c.pageName}): ${msg}`)
      }
    }

    const SAVE_BATCH = 15
    let saved = 0
    for (let i = 0; i < products.length; i += SAVE_BATCH) {
      const batch = products.slice(i, i + SAVE_BATCH)
      await upsertProducts(batch)
      saved += batch.length
    }

    // Casi-ganadores → watchlist (plan 13 E): inventario futuro, se promueven
    // cuando maduran (scripts/recheck-watchlist.ts en el cron).
    if (watchlist.length) await upsertWatchlist(watchlist)

    // ── Resumen de métricas (visible en logs de Actions) ──────────────────────
    // Recalculado al final: incluye los descartes de regla de oro (oro_*) de Fase 2.
    const finalDiscardSummary = Object.entries(metrics.discarded)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ') || 'ninguno'
    const discardedTotal = Object.values(metrics.discarded).reduce((a, b) => a + b, 0)
    console.log(
      `\n─── Métricas [${niche}] ───\n` +
      `  búsquedas: ${metrics.searches} (omitidas por tope: ${metrics.searchesSkipped}) | 0-payloads: ${metrics.zeroPayloads} | fallback-DOM: ${metrics.domFallbacks}\n` +
      `  descartados: ${discardedTotal} (${finalDiscardSummary})\n` +
      `  enriquecidos: ${metrics.enriched} | PE al pool: ${metrics.peFromCard} | omitidos por tope: ${metrics.enrichSkipped} | navegaciones fallidas: ${metrics.navFailures}\n` +
      `  guardados en ph_products (cumplen reglas de oro): ${products.length} | a watchlist (casi-ganadores): ${watchlist.length}`
    )

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
