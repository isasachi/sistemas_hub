// Research por URL — drena la cola ph_url_research (feature "pega un anuncio").
// El poller (url-research-loop.sh, systemd) lo invoca cada pocos segundos.
//   npx tsx scripts/research-url.ts
//
// Resuelve la URL pegada a la página del anunciante, la scrapea, la analiza con
// LLM y le arma la vista competitiva (PE en vivo + mercado LATAM). NO pasa por las
// reglas de oro ni toca ph_products — devuelve el veredicto aunque el producto sea
// débil (esa es la gracia). Reusa las primitives del scraper, analyzeProduct y
// researchPe.
//
// ⚠️ COSTO: Anthropic SOLO aquí (una llamada por request; la cuota 3/día la acota).
// ⚠️ Segundo proceso navegando la misma IP que el daemon — ver nota en el loop.
import './bootstrap'
import {
  launchScraperBrowser,
  pageUrl,
  searchUrl,
  navigateAndCapture,
  scanAdNodes,
  summarizeCreatives,
  findConnectionCount,
  noteNavResult,
  PersistentBlockError,
} from '../lib/product-hunter/scraper'
import { extractFromDom } from '../lib/product-hunter/dom-fallback'
import { analyzeProduct } from '../lib/product-hunter/anthropic'
import { researchPe } from '../lib/product-hunter/pe-validation'
import { isLikelyService } from '../lib/product-hunter/competitors'
import {
  claimNextUrlResearch,
  saveUrlResearchResult,
  failUrlResearch,
} from '@ph/shared'
import type {
  AdNode,
  MarketCompetitor,
  ProductRow,
  UrlResearchResult,
  UrlResearchRow,
} from '@ph/shared'
import type { Page } from 'playwright'

// Discovery de mercado: acotado a los 2 mercados LATAM grandes × 1 término
// (nivel-card, sin enrich). El presupuesto de navegaciones es lo que fija la
// latencia (~12.5s c/u): resolve-ad(1)+página(1)+PE(3)+mercado(2) ≈ 7 navs ≈
// ~90-110s, con margen para 1 cool-down bajo el cap de 240s de la UI. Comparte la
// IP con el daemon (ponytail: si Meta bloquea, bajar más).
const MARKET_COUNTRIES = ['MX', 'CO'] as const
const MARKET_TERMS = 1
const MAX_PE_TERMS = 3

// URL de un anuncio específico (no hay builder en scraper.ts — el pageUrl es por
// página). active_status='all': el ad pegado puede estar inactivo.
function adLibraryUrl(adId: string): string {
  const p = new URLSearchParams({ active_status: 'all', ad_type: 'all', country: 'ALL', id: adId })
  return `https://www.facebook.com/ads/library/?${p}`
}

// Resuelve el page_id del anunciante desde una URL de anuncio (?id=...): navega el
// ad y lee su page_id del payload GraphQL. Devuelve null si no vino nada.
async function resolvePageFromAd(page: Page, adId: string): Promise<{ pageId: string; pageName: string } | null> {
  const responses = await navigateAndCapture(page, adLibraryUrl(adId))
  const nodes = responses.flatMap((r) => scanAdNodes(r))
  noteNavResult(nodes.length)
  const node = nodes.find((n) => n.adArchiveID === adId) ?? nodes[0]
  if (!node?.pageID) return null
  return { pageId: node.pageID, pageName: node.pageName }
}

// Scrapea la página del anunciante y arma un ProductRow en memoria (mismo shape
// que enrichCandidate, pero standalone — NO se persiste en ph_products).
async function scrapeAdvertiser(
  page: Page, pageId: string, hintName: string, hintAdId: string | null
): Promise<ProductRow | null> {
  const responses = await navigateAndCapture(page, pageUrl(pageId))
  let nodes: AdNode[] = responses.flatMap((r) => scanAdNodes(r, [], pageId, hintName)).filter((n) => n.pageID === pageId)
  if (nodes.length === 0) {
    const fallback = await extractFromDom(page)
    nodes = fallback.length === 1
      ? fallback.map((n) => ({ ...n, pageID: pageId, pageName: hintName || n.pageName }))
      : fallback.filter((n) => n.pageID === pageId)
  }
  noteNavResult(nodes.length)
  if (nodes.length === 0) return null

  const pageName = nodes.find((n) => n.pageName)?.pageName || hintName || 'Anunciante'
  // Total exacto del payload > nº de nodos
  const exactCount = responses.map((r) => findConnectionCount(r)).find((n) => n !== null) ?? null
  const adCount = exactCount ?? nodes.length

  const timestamps = nodes
    .map((n) => n.startDate)
    .filter((d): d is number => typeof d === 'number' && d > 0)
    .map((d) => d * 1000)
  const source = timestamps.length ? Math.min(...timestamps) : null
  const daysRunning = source ? Math.floor((Date.now() - source) / 86_400_000) : null
  const oldestDate = source ? new Date(source).toISOString().split('T')[0] : null

  const adId = hintAdId || nodes[0]?.adArchiveID || pageId
  const creatives = summarizeCreatives(nodes)
  const pageCategories = nodes.find((n) => n.pageCategories.length)?.pageCategories ?? []

  return {
    id: adId,
    niche: 'url-research',
    page_id: pageId,
    name: pageName,
    raw_data: {
      page_id: pageId,
      ad_id: adId,
      advertiser_name: pageName,
      ad_count: adCount,
      days_running: daysRunning,
      oldest_date: oldestDate,
      found_keyword: '',
      found_country: '—',
      page_categories: pageCategories,
      creatives,
    },
    score: null,
    analysis: null,
    scraped_at: new Date().toISOString(),
    analyzed_at: null,
  }
}

// Vista de mercado: quién más corre el producto en LATAM (nivel-card, sin enrich).
async function discoverMarket(page: Page, terms: string[]): Promise<MarketCompetitor[]> {
  const byPage = new Map<string, MarketCompetitor>()
  for (const term of terms.slice(0, MARKET_TERMS)) {
    for (const country of MARKET_COUNTRIES) {
      let nodes: AdNode[] = []
      try {
        const responses = await navigateAndCapture(page, searchUrl(term, country))
        nodes = responses.flatMap((r) => scanAdNodes(r))
      } catch (e) {
        if (e instanceof PersistentBlockError) throw e
        continue  // un término/país que falla no tumba la vista
      }
      noteNavResult(nodes.length)
      // Agrega por anunciante; usa collationCount (ads en su card) o nº de nodos.
      const counts = new Map<string, { name: string; nodes: number; coll: number | null; cats: string[] }>()
      for (const n of nodes) {
        const prev = counts.get(n.pageID)
        if (prev) {
          prev.nodes++
          if (n.collationCount !== null) prev.coll = Math.max(prev.coll ?? 0, n.collationCount)
        } else {
          counts.set(n.pageID, { name: n.pageName, nodes: 1, coll: n.collationCount, cats: n.pageCategories })
        }
      }
      for (const [pid, a] of counts) {
        if (isLikelyService(a.name, a.cats)) continue
        const adCount = a.coll ?? a.nodes
        const prev = byPage.get(pid)
        if (!prev || adCount > prev.adCount) byPage.set(pid, { name: a.name, adCount, country })
      }
    }
  }
  return [...byPage.values()].sort((a, b) => b.adCount - a.adCount).slice(0, 12)
}

async function processRow(row: UrlResearchRow, page: Page): Promise<void> {
  // 1. Resolver el page_id (si solo vino el ad_id, navegar el anuncio primero).
  let pageId = row.page_id
  let pageName = ''
  if (!pageId && row.ad_id) {
    const resolved = await resolvePageFromAd(page, row.ad_id)
    if (!resolved) throw new Error('No pudimos leer el anunciante desde ese anuncio. Revisa que la URL sea de un anuncio activo.')
    pageId = resolved.pageId
    pageName = resolved.pageName
  }
  if (!pageId) throw new Error('La URL no apunta a un anunciante ni a un anuncio válido.')

  // 2. Scrapear la página del anunciante → ProductRow en memoria.
  const product = await scrapeAdvertiser(page, pageId, pageName, row.ad_id)
  if (!product) throw new Error('El anunciante no devolvió anuncios (puede no tener anuncios activos ahora).')

  // 3. Análisis LLM. Sin pool PE offline — la competencia la trae la validación
  //    en vivo (researchPe), no el matching contra ph_pe_pool (aquí no hay nicho).
  const analysis = await analyzeProduct({
    candidate: product,
    peMatch: { competitors: [], poolSize: 0, servicesExcluded: 0 },
    standalone: true,  // sin nicho de referencia — no penalizar fuera-de-categoría
  })

  // 4. Competencia en Perú (en vivo) + vista de mercado LATAM.
  const terms = (analysis.peSearchTerms.length ? analysis.peSearchTerms : [analysis.productName])
    .filter(Boolean)
    .slice(0, MAX_PE_TERMS)
  const pe = terms.length ? await researchPe(page, terms, analysis.score) : null  // null = inconcluso
  const market = await discoverMarket(page, terms)

  // 5. Escribir el resultado (reglas de oro NO aplican: veredicto siempre).
  const result: UrlResearchResult = {
    verdict: {
      productName: analysis.productName,
      whatItIs: analysis.whatItIs,
      problemSolved: analysis.problemSolved,
      attributes: analysis.attributes,
      adCount: product.raw_data.ad_count,
      daysRunning: product.raw_data.days_running,
      foundCountry: product.raw_data.found_country,
      pageName: product.name ?? '',
      score: pe?.score ?? analysis.score,
      priority: pe?.priority ?? analysis.priority,
      reasoning: analysis.reasoning,
    },
    peScenario: pe?.scenario ?? null,
    peCompetitors: pe?.competitors.slice(0, 10) ?? [],
    marketCompetitors: market,
    adUrl: `https://www.facebook.com/ads/library/?id=${product.raw_data.ad_id}`,
    pageUrl: pageUrl(pageId),
  }
  await saveUrlResearchResult(row.id, result)
}

async function main() {
  // ponytail: una fila que muere en 'processing' (timeout de la tanda / crash del
  // proceso) queda pegada — no hay reconciliación como reconcileOrphanBatches. El
  // usuario simplemente reintenta (gasta un recheck gratis). Upgrade si molesta:
  // un barrido que devuelva a 'pending' las processing con >N min.
  const first = await claimNextUrlResearch()
  if (!first) return  // cola vacía — salida rápida sin lanzar browser

  const { browser, page } = await launchScraperBrowser()
  try {
    let row: UrlResearchRow | null = first
    while (row) {
      console.log(`▶ research ${row.id} · ${row.url}`)
      try {
        await processRow(row, page)
        console.log(`✓ research ${row.id} listo`)
      } catch (e) {
        if (e instanceof PersistentBlockError) {
          await failUrlResearch(row.id, 'blocked', 'Meta bloqueó la IP temporalmente. Intenta de nuevo en unos minutos.')
          console.error(`🛑 research ${row.id}: block persistente — corto el drain`)
          break
        }
        const msg = e instanceof Error ? e.message : String(e)
        await failUrlResearch(row.id, 'error', msg)
        console.error(`✗ research ${row.id}: ${msg}`)
      }
      row = await claimNextUrlResearch()
    }
  } finally {
    await browser.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
