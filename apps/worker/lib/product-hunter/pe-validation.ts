// Validación PE en vivo (Fase 4) — lógica reusable.
//
// La usan dos entradas: el CLI `scripts/validate-pe.ts` (standalone, todos los
// nichos) y `scripts/pipeline.ts` (por-bloque, tras analizar los 15 con el
// browser caliente). Vive en lib/ para no duplicar lógica ni arrastrar el
// `main()` del CLI al importarla.
//
// Replica el "paso 4" del agente original: para los candidatos prometedores
// (prioridad alta/media), busca sus peSearchTerms en Meta Ads Library filtrando
// por Perú y registra qué competidores REALES existen hoy. Reclasifica el
// escenario A/B/C/D con datos en vivo, de forma determinista.
//
// ⚠️ COSTO: $0 LLM — solo Playwright. El volumen se acota con PH_VALIDATE_LIMIT
// (candidatos/nicho) y MAX_TERMS (búsquedas c/u).
import {
  navigateAndCapture,
  scanAdNodes,
  searchUrl,
  runPool,
  noteNavResult,
} from './scraper'
import { isLikelyService } from './competitors'
import {
  getProductsToValidatePe,
  getStrongDiscardsToValidate,
  saveProductAnalysis,
} from '@ph/shared'
import type { PeCompetitor, PeValidation, ProductRow } from '@ph/shared'
import type { Page } from 'playwright'

const VALIDATE_LIMIT = Number(process.env.PH_VALIDATE_LIMIT ?? 15)
// Rescate de falsos-D: cuántos descartados-con-validación-fuerte revisar por nicho
const VALIDATE_D_LIMIT = Number(process.env.PH_VALIDATE_D_LIMIT ?? 10)
const MAX_TERMS = 4

// Distingue "0 resultados" REAL de un bloqueo de Meta. En una búsqueda vacía
// genuina la SPA renderiza el marcador "~0 results"; bajo soft-block la página no
// carga el JS y no hay marcador. (readTotalFromDom del scraper colapsa ambos a 0,
// perdiendo la señal — acá leemos el marcador crudo: número si renderizó, null si no.)
async function readResultsMarker(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const m = document.body.innerText.match(/~?([\d,]+)\s*results?/i)
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null
  })
}

// Busca un término en PE y devuelve los anunciantes-vendedores (sin servicios).
// `valid` = el probe obtuvo respuesta confiable: vino data por GraphQL, o la
// página renderizó el marcador de resultados (incluso 0). Sin nodos Y sin
// marcador = bloqueo, NO un mercado PE vacío — el caller no puede concluir
// "sin competencia" a partir de un probe inválido.
async function searchPeAdvertisers(
  page: Page,
  term: string
): Promise<{ competitors: Map<string, PeCompetitor>; valid: boolean }> {
  const responses = await navigateAndCapture(page, searchUrl(term, 'PE'))
  const nodes = responses.flatMap((r) => scanAdNodes(r))
  noteNavResult(nodes.length)  // cool-down: una racha de probes sin nodos = block
  const valid = nodes.length > 0 ? true : (await readResultsMarker(page)) !== null
  const byPage = new Map<string, { name: string; count: number; categories: string[] }>()
  for (const n of nodes) {
    const prev = byPage.get(n.pageID)
    if (prev) prev.count++
    else byPage.set(n.pageID, { name: n.pageName, count: 1, categories: n.pageCategories })
  }
  const out = new Map<string, PeCompetitor>()
  for (const [pageId, a] of byPage) {
    if (isLikelyService(a.name, a.categories)) continue
    out.set(pageId, { name: a.name, adCount: a.count })
  }
  return { competitors: out, valid }
}

// Escenario determinista según competidores distintos encontrados en vivo.
// Mismos umbrales que el prompt (y que el agente original).
function classify(totalAdvertisers: number, maxAds: number): 'A' | 'B' | 'C' | 'D' {
  if (totalAdvertisers === 0) return 'A'
  if (totalAdvertisers <= 3 && maxAds <= 10) return 'B'
  if (totalAdvertisers <= 7) return 'C'
  return 'D'
}

// Reclasificación de score/prioridad con el escenario en vivo. Conservador:
// sube si hay ventana real, baja si el mercado ya está tomado.
function rescore(oldScore: number, scenario: 'A' | 'B' | 'C' | 'D') {
  switch (scenario) {
    case 'A': return { score: Math.max(oldScore, 80), priority: 'alta' as const }
    case 'B': return { score: Math.max(oldScore, 65), priority: 'alta' as const }
    case 'C': return { score: Math.min(Math.max(oldScore, 40), 60), priority: 'media' as const }
    case 'D': return { score: Math.min(oldScore, 25), priority: 'baja' as const }
  }
}

// Términos a buscar: los del análisis o, si faltan (descartados emiten []),
// derivados del productName + la keyword que lo encontró.
export function termsFor(product: ProductRow): string[] {
  const fromAnalysis = (product.analysis?.peSearchTerms ?? []).filter(Boolean)
  if (fromAnalysis.length) return fromAnalysis.slice(0, MAX_TERMS)
  const out = new Set<string>()
  const name = product.analysis?.productName
  if (name) out.add(name.toLowerCase().split(/\s+/).slice(0, 3).join(' '))
  if (product.raw_data.found_keyword) out.add(product.raw_data.found_keyword.toLowerCase())
  return [...out].slice(0, MAX_TERMS)
}

export interface PeResearch {
  scenario: 'A' | 'B' | 'C' | 'D'
  competitors: PeCompetitor[]
  perTerm: PeValidation['terms']
  score: number
  priority: 'alta' | 'media' | 'baja'
}

// Núcleo reusable de la validación PE en vivo: busca `terms` en Meta Ads Library
// filtrando por Perú, agrega los competidores-vendedores y clasifica el escenario
// A/B/C/D de forma determinista, reclasificando el score/prioridad. Lo comparten
// validateProduct (cola de nichos → ph_products) y el research por URL (cola
// aparte) — una sola fuente de verdad para el guard de la regla de oro.
//
// Devuelve null si es INCONCLUSO: 0 competidores pero algún probe quedó bloqueado.
// "0 competidores" solo significa "sin competencia en PE" si TODOS los probes
// respondieron; con uno bloqueado el 0 puede ser competencia oculta por el
// throttle → NO declarar escenario A (regla de oro "no pautado en PE" sin
// verificar). El caller decide qué hacer con el inconcluso (re-encolar / mostrar
// "no verificado"). Con competidores>0 sí clasifica: un probe bloqueado solo
// habría sumado más competencia, así que B/C/D sobre data parcial es conservador.
export async function researchPe(
  page: Page,
  terms: string[],
  oldScore: number,
): Promise<PeResearch | null> {
  if (!terms.length) return null  // sin términos no se puede concluir (no fabricar 'A')
  const seen = new Map<string, PeCompetitor>()
  const perTerm: PeValidation['terms'] = []
  let allValid = true
  for (const term of terms) {
    const { competitors: found, valid } = await searchPeAdvertisers(page, term)
    if (!valid) allValid = false
    perTerm.push({ term, competitors: [...found.values()] })
    for (const [pageId, comp] of found) {
      const prev = seen.get(pageId)
      if (!prev || comp.adCount > prev.adCount) seen.set(pageId, comp)
    }
  }

  const competitors = [...seen.values()].sort((a, b) => b.adCount - a.adCount)
  if (competitors.length === 0 && !allValid) return null

  const maxAds = competitors[0]?.adCount ?? 0
  const scenario = classify(competitors.length, maxAds)
  const { score, priority } = rescore(oldScore, scenario)
  return { scenario, competitors, perTerm, score, priority }
}

// Valida UN producto: busca sus términos en PE (secuencial dentro de su page)
// y reclasifica con datos en vivo. Los errores se loguean, no tumban el pool.
async function validateProduct(page: Page, product: ProductRow): Promise<void> {
  const analysis = product.analysis
  if (!analysis) return
  const terms = termsFor(product)
  if (!terms.length) return

  try {
    const r = await researchPe(page, terms, product.score ?? 0)
    // Inconcluso: no persistimos — el producto queda en la cola de
    // getProductsToValidatePe y se re-valida en un run limpio.
    if (!r) {
      console.log(
        `  ⊘ ${analysis.productName} — PE inconcluso (probe bloqueado, 0 competidores no confiable) — se re-validará`
      )
      return
    }

    const updated = {
      ...analysis,
      score: r.score,
      priority: r.priority,
      peScenario: r.scenario,
      peCompetitors: r.competitors.slice(0, 10),
      peValidation: {
        validated_at: new Date().toISOString(),
        terms: r.perTerm,
        scenario: r.scenario,
      },
    }
    await saveProductAnalysis(product.id, r.score, updated)
    console.log(
      `  ✓ ${analysis.productName} — ${terms.length} búsquedas → ${r.competitors.length} competidores ` +
      `→ escenario ${r.scenario} · score ${product.score} → ${r.score} · ${r.priority}`
    )
  } catch (e) {
    console.error(`  ✗ ${analysis.productName}: ${e instanceof Error ? e.message : e}`)
  }
}

// Valida UN nicho: prometedores (alta/media) + rescate de falsos-D, en paralelo
// sobre el pool de pages provisto. El caller es dueño del browser.
export async function validateNiche(pages: Page[], niche: string) {
  // Dos grupos: los prometedores (alta/media) y el rescate de falsos-D
  // (descartados por el matching de pool pese a validación externa fuerte).
  const promising = await getProductsToValidatePe(niche, VALIDATE_LIMIT)
  const strongDiscards = await getStrongDiscardsToValidate(niche, VALIDATE_D_LIMIT)
  const products = [...promising, ...strongDiscards]
  if (!products.length) {
    console.log(`[${niche}] nada por validar en PE`)
    return
  }
  console.log(
    `[${niche}] validando en PE (en vivo): ${promising.length} alta/media + ${strongDiscards.length} rescate-D · concurrencia ${pages.length}`
  )

  // Pool concurrente: cada producto hace sus búsquedas secuenciales en su page;
  // varios productos en paralelo (mismo patrón que el scraper).
  await runPool(products, pages, (product, page) => validateProduct(page, product))
}
