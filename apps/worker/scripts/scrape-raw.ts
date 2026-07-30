// Scraper del BUSCADOR SIMPLE (tool de TESTEO, temporal).
//   npx tsx scripts/scrape-raw.ts --niche rodilla
//   npx tsx scripts/scrape-raw.ts --all          (cola ph_raw_niches, bloque de N)
//
// Dos fases:
//   1. Descubrimiento — keywords × países, igual que el buscador normal. Único
//      filtro: producto físico (se descartan servicios vía isLikelyService). NO
//      hay reglas de oro: PE y los anunciantes chicos también se guardan.
//   2. Enrich LIVIANO del top-K por presencia — una navegación por anunciante
//      SOLO para leer su total de anuncios activos.
//
// Por qué la fase 2 existe (medido 2026-07-30): la página de búsqueda NO trae
// el total de anuncios del anunciante, ni por GraphQL ni en el DOM renderizado
// (son la misma fuente SSR). Lo único que hay ahí es `collation_count` = ads que
// comparten un creativo (45 de 55 valen 1) y el "~N resultados" de la búsqueda
// entera. El total real solo existe en la página del anunciante.
//
// Por qué es barata: el conteo viene en el JSON inline del SSR y aparece a
// ~1,4s de cargar — no hacen falta los 8s de espera + 3 scrolls de
// navigateAndCapture (eso es para juntar creativos, que acá no se usan). ~2s por
// anunciante en vez de ~15s. Un fetch plano NO sirve: Meta responde 403.
//
// Sin LLM en ninguna fase: keywords de cache/seed, cero análisis. Escribe SOLO
// en ph_raw_products / ph_raw_niches.
//
// ⚠️ NO correrlo en paralelo con el daemon: cada proceso tiene su PROPIO
// rate-control singleton, así que ambos sumarían volumen sobre la misma IP —
// justo el gatillo del soft-block de Meta. Correr con el daemon detenido.
import './bootstrap' // env + polyfill WebSocket — debe ir primero
import type { Page } from 'playwright'
import {
  launchScraperContext,
  navigateAndCapture,
  scanAdNodes,
  searchUrl,
  pageUrl,
  runPool,
  noteNavResult,
  isPersistentlyBlocked,
  rateGateMs,
  PersistentBlockError,
  CONCURRENCY,
} from '../lib/product-hunter/scraper'
import { extractFromDom } from '../lib/product-hunter/dom-fallback'
import { isLikelyService } from '../lib/product-hunter/competitors'
import {
  COUNTRIES,
  seedKeywords,
  getNicheStatus,
  getRawNichesToRefresh,
  updateRawNicheAfterScrape,
  upsertRawProducts,
} from '@ph/shared'

const NICHE_BATCH = Math.max(1, Number(process.env.PH_RAW_BATCH ?? 5))
// Tope de keywords por nicho y por corrida (0 = sin tope). Acota el nº de
// navegaciones: keywords × países. Sin rotación — cada run usa las mismas.
const KEYWORD_LIMIT = Math.max(0, Number(process.env.PH_RAW_KEYWORDS ?? 15))
// Anunciantes que reciben la navegación de conteo, rankeados por presencia en
// las búsquedas. 300 = mismo orden que PH_ENRICH_LIMIT del daemon: el descubrimiento
// devuelve >1000 por nicho y enriquecerlos todos triplicaría el volumen de
// requests sobre la misma IP residencial. 0 = sin tope (no recomendado).
const ENRICH_LIMIT = Math.max(0, Number(process.env.PH_RAW_ENRICH_LIMIT ?? 300))
// Ventana de polling del conteo inline (medido: aparece a ~1,4s).
const COUNT_TIMEOUT_MS = Math.max(2_000, Number(process.env.PH_RAW_COUNT_TIMEOUT ?? 10_000))
const JITTER_MS = Math.max(0, Number(process.env.PH_JITTER_MS ?? 500))

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface Candidate {
  pageId: string
  pageName: string
  adId: string | null
  country: string
  keyword: string
  title: string | null
  body: string | null
  categories: string[]
  nodesSeen: number   // presencia acumulada en las búsquedas → ranking del enrich
}

// Keywords SIN LLM: cache del nicho en ph_niches (solo lectura) → seed estático
// → el nicho a secas. resolveKeywords() NO se usa acá: cae a Haiku en cache miss.
async function keywordsFor(niche: string): Promise<string[]> {
  const row = await getNicheStatus(niche).catch(() => null)
  const all = row?.keywords?.length ? row.keywords : (seedKeywords(niche) ?? [niche])
  return KEYWORD_LIMIT ? all.slice(0, KEYWORD_LIMIT) : all
}

// Total de anuncios ACTIVOS del anunciante, del JSON inline del SSR. Devuelve
// null si no apareció dentro de la ventana (página rara o navegación bloqueada).
// No usa navigateAndCapture: no necesitamos creativos, así que nos ahorramos los
// ~12s de espera+scrolls. Sí respeta el cool-down y el hard-abort compartidos.
async function fetchAdCount(page: Page, pageId: string): Promise<number | null> {
  if (isPersistentlyBlocked()) throw new PersistentBlockError()
  const gate = rateGateMs()
  if (gate > 0) await sleep(gate)
  if (JITTER_MS) await sleep(Math.random() * JITTER_MS)

  await page.goto(pageUrl(pageId), { timeout: 30_000, waitUntil: 'domcontentloaded' })
  const deadline = Date.now() + COUNT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const count = await page.evaluate(() => {
      for (const s of Array.from(document.querySelectorAll('script[type="application/json"]'))) {
        const t = s.textContent ?? ''
        if (!t.includes('search_results_connection')) continue
        const m = /"search_results_connection":\{[^{]*?"count":(\d+)/.exec(t)
        if (m) return Number(m[1])
      }
      // Respaldo: el "~N resultados" que Meta renderiza en texto visible.
      const dm = /~?\s*([\d.,]+)\s*(?:resultados?|results?)/i.exec(document.body?.innerText ?? '')
      return dm ? Number(dm[1].replace(/[.,]/g, '')) : null
    }).catch(() => null)
    if (count !== null) return count
    await page.waitForTimeout(250)
  }
  return null
}

async function scrapeRawNiche(niche: string): Promise<void> {
  const keywords = await keywordsFor(niche)
  console.log(`\nNicho "${niche}" — ${keywords.length} keywords × ${COUNTRIES.length} países · conc ${CONCURRENCY}`)

  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  const byPage = new Map<string, Candidate>()
  let searches = 0
  let zeros = 0
  let services = 0

  try {
    // ── Fase 1: descubrimiento ────────────────────────────────────────────────
    const tasks = keywords.flatMap((keyword) => COUNTRIES.map((country) => ({ keyword, country })))
    const settled = await runPool(tasks, pages, async ({ keyword, country }, page: Page) => {
      searches++
      const responses = await navigateAndCapture(page, searchUrl(keyword, country))
      let nodes = responses.flatMap((r) => scanAdNodes(r))
      if (nodes.length === 0) {
        const dom = await extractFromDom(page)
        if (dom.length) nodes = dom
        else zeros++
      }
      noteNavResult(nodes.length) // alimenta el cool-down compartido

      const grouped = new Map<string, typeof nodes>()
      for (const n of nodes) grouped.set(n.pageID, [...(grouped.get(n.pageID) ?? []), n])

      for (const [pageId, group] of grouped) {
        const first = group[0]
        if (isLikelyService(first.pageName, first.pageCategories)) { services++; continue }
        const prev = byPage.get(pageId)
        if (prev) { prev.nodesSeen += group.length; continue }
        byPage.set(pageId, {
          pageId,
          pageName: first.pageName,
          adId: first.adArchiveID || null,
          country,
          keyword,
          title: first.title,
          body: first.bodyText ? first.bodyText.slice(0, 300) : null,
          categories: first.pageCategories,
          nodesSeen: group.length,
        })
      }
      console.log(`  [${country}] "${keyword}" → ${grouped.size} páginas (${nodes.length} nodos)`)
    })
    const failedSearches = settled.filter((r) => r.status === 'rejected').length

    // ── Fase 2: conteo exacto del top-K ───────────────────────────────────────
    const ranked = [...byPage.values()].sort((a, b) => b.nodesSeen - a.nodesSeen)
    const toCount = ENRICH_LIMIT ? ranked.slice(0, ENRICH_LIMIT) : ranked
    console.log(
      `\n─── Conteo de anuncios: ${toCount.length} de ${ranked.length} anunciantes` +
        `${ranked.length > toCount.length ? ` (top por presencia; ${ranked.length - toCount.length} omitidos)` : ''} ───`,
    )

    const counted = await runPool(toCount, pages, async (c, page: Page) => {
      const adCount = await fetchAdCount(page, c.pageId)
      noteNavResult(adCount === null ? 0 : 1)
      return { c, adCount }
    })

    const rows = []
    let sinConteo = 0
    for (const r of counted) {
      if (r.status !== 'fulfilled') { sinConteo++; continue }
      const { c, adCount } = r.value
      // Sin conteo o 0 activos → no se guarda: una fila sin número real
      // ensuciaría el grupo "0-50", que es justo lo que esta tool promete.
      if (adCount === null || adCount <= 0) { sinConteo++; continue }
      rows.push({
        niche,
        page_id: c.pageId,
        ad_id: c.adId,
        name: c.pageName || null,
        ad_count: adCount,
        country: c.country,
        raw_data: { title: c.title, body: c.body, keyword: c.keyword, categories: c.categories },
      })
    }

    await upsertRawProducts(rows)
    await updateRawNicheAfterScrape(niche)

    const b1 = rows.filter((r) => r.ad_count < 50).length
    const b2 = rows.filter((r) => r.ad_count >= 50 && r.ad_count < 100).length
    const b3 = rows.filter((r) => r.ad_count >= 100).length
    console.log(
      `\n─── [${niche}] ${rows.length} anunciantes guardados ───\n` +
        `  búsquedas: ${searches} (fallidas: ${failedSearches}) | vacías: ${zeros} | servicios descartados: ${services}\n` +
        `  descubiertos: ${ranked.length} | con conteo: ${rows.length} | sin conteo/0 activos: ${sinConteo}\n` +
        `  grupos: 0-50=${b1} · 50-100=${b2} · 100+=${b3}`,
    )
  } finally {
    await browser.close()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--niche')

  let niches: string[]
  if (idx !== -1 && args[idx + 1]) {
    niches = [args[idx + 1]]
  } else if (args.includes('--all')) {
    niches = (await getRawNichesToRefresh()).slice(0, NICHE_BATCH)
    if (!niches.length) { console.log('PH_RAW_QUEUE_EMPTY'); return }
  } else {
    console.error('Uso: tsx scripts/scrape-raw.ts --niche <nombre> | --all')
    process.exit(1)
  }

  let ok = 0
  let failed = 0
  for (const niche of niches) {
    try {
      await scrapeRawNiche(niche)
      ok++
    } catch (e) {
      failed++
      console.error(`✗ [${niche}]: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    }
    // IP muerta: cortar el bloque en vez de seguir martillando (mismo criterio
    // que pipeline.ts). Los nichos restantes siguen en cola.
    if (isPersistentlyBlocked()) {
      console.error('🛑 block persistente — abortando el bloque')
      console.log('PH_PERSISTENT_BLOCK')
      break
    }
  }
  console.log(`\n═══ scrape-raw: ${ok} nichos OK · ${failed} fallidos ═══`)
}

main().catch((e) => { console.error(e); process.exit(1) })
