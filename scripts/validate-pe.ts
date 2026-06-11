// Validación PE en vivo (Fase 4) — corre en GitHub Actions DESPUÉS del análisis.
//   npx tsx scripts/validate-pe.ts --niche rodilla
//   npx tsx scripts/validate-pe.ts            (todos los nichos)
//
// Replica el "paso 4" del agente original: para los candidatos prometedores
// (prioridad alta/media), busca sus peSearchTerms en Meta Ads Library filtrando
// por Perú y registra qué competidores REALES existen hoy. Reclasifica el
// escenario A/B/C/D con datos en vivo, de forma determinista.
//
// ⚠️ COSTO: $0 LLM — solo Playwright en el runner self-hosted. El volumen se
// acota con PH_VALIDATE_LIMIT (candidatos/nicho) y MAX_TERMS (búsquedas c/u).
import './bootstrap'
import {
  launchScraperBrowser,
  navigateAndCapture,
  scanAdNodes,
  searchUrl,
} from '../lib/product-hunter/scraper'
import { isLikelyService } from '../lib/product-hunter/competitors'
import { getProductsToValidatePe, saveProductAnalysis } from '../lib/product-hunter/db'
import { ALL_NICHES } from '../lib/product-hunter/keywords'
import type { PeCompetitor, PeValidation, ProductRow } from '../lib/product-hunter/types'
import type { Page } from 'playwright'

const VALIDATE_LIMIT = Number(process.env.PH_VALIDATE_LIMIT ?? 15)
const MAX_TERMS = 4

// Busca un término en PE y devuelve los anunciantes-vendedores (sin servicios).
async function searchPeAdvertisers(page: Page, term: string): Promise<Map<string, PeCompetitor>> {
  const responses = await navigateAndCapture(page, searchUrl(term, 'PE'))
  const nodes = responses.flatMap((r) => scanAdNodes(r))
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
  return out
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
    case 'D': return { score: Math.min(oldScore, 25), priority: 'descartado' as const }
  }
}

// Términos a buscar: los del análisis o, si faltan, derivados del productName.
function termsFor(product: ProductRow): string[] {
  const fromAnalysis = (product.analysis?.peSearchTerms ?? []).filter(Boolean)
  if (fromAnalysis.length) return fromAnalysis.slice(0, MAX_TERMS)
  const name = product.analysis?.productName ?? product.raw_data.found_keyword
  return name ? [name.toLowerCase().split(/\s+/).slice(0, 3).join(' ')] : []
}

async function validateNiche(page: Page, niche: string) {
  const products = await getProductsToValidatePe(niche, VALIDATE_LIMIT)
  if (!products.length) {
    console.log(`[${niche}] nada por validar en PE`)
    return
  }
  console.log(`[${niche}] validando ${products.length} candidatos alta/media en PE (en vivo)`)

  for (const product of products) {
    const analysis = product.analysis
    if (!analysis) continue
    const terms = termsFor(product)
    if (!terms.length) continue

    try {
      const seen = new Map<string, PeCompetitor>()
      const perTerm: PeValidation['terms'] = []
      for (const term of terms) {
        const found = await searchPeAdvertisers(page, term)
        perTerm.push({ term, competitors: [...found.values()] })
        for (const [pageId, comp] of found) {
          const prev = seen.get(pageId)
          if (!prev || comp.adCount > prev.adCount) seen.set(pageId, comp)
        }
      }

      const competitors = [...seen.values()].sort((a, b) => b.adCount - a.adCount)
      const maxAds = competitors[0]?.adCount ?? 0
      const scenario = classify(competitors.length, maxAds)
      const { score, priority } = rescore(product.score ?? 0, scenario)

      const updated = {
        ...analysis,
        score,
        priority,
        peScenario: scenario,
        peCompetitors: competitors.slice(0, 10),
        peValidation: {
          validated_at: new Date().toISOString(),
          terms: perTerm,
          scenario,
        },
      }
      await saveProductAnalysis(product.id, score, updated)
      console.log(
        `  ✓ ${analysis.productName} — ${terms.length} búsquedas → ${competitors.length} competidores ` +
        `→ escenario ${scenario} · score ${product.score} → ${score} · ${priority}`
      )
    } catch (e) {
      console.error(`  ✗ ${analysis.productName}: ${e instanceof Error ? e.message : e}`)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const nicheIdx = args.indexOf('--niche')
  const niches = nicheIdx !== -1 && args[nicheIdx + 1] ? [args[nicheIdx + 1]] : ALL_NICHES

  const { browser, page } = await launchScraperBrowser()
  try {
    for (const niche of niches) await validateNiche(page, niche)
  } finally {
    await browser.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
