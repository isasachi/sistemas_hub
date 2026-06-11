// CLI del análisis Anthropic — corre en GitHub Actions DESPUÉS del scrape.
//   npx tsx scripts/analyze.ts --niche espalda
//   npx tsx scripts/analyze.ts --all
//
// ⚠️ COSTO: este es el ÚNICO punto donde se llama a Anthropic. Procesa en batch
// solo los productos sin analizar (score IS NULL). El resultado queda cacheado en
// DB y las rutas de Vercel solo lo LEEN. Así el costo no escala con usuarios.
import './bootstrap' // env + polyfill WebSocket — debe ir primero
import {
  getProductsToAnalyze,
  getPeCompetitors,
  saveProductAnalysis,
} from '../lib/product-hunter/db'
import { analyzeProduct } from '../lib/product-hunter/anthropic'
import { isLikelyService, matchPeCompetitors } from '../lib/product-hunter/competitors'
import { ALL_NICHES } from '../lib/product-hunter/keywords'
import type { ProductAnalysis, ProductRow } from '../lib/product-hunter/types'

const BATCH_LIMIT = Number(process.env.PH_ANALYZE_LIMIT ?? 50)

// Descarte determinista para servicios (clínicas, fisios, médicos): no gastamos
// una llamada a Anthropic en algo que el filtro detecta gratis.
function serviceDiscard(candidate: ProductRow): ProductAnalysis {
  return {
    score: 5,
    productName: candidate.name ?? candidate.raw_data.advertiser_name,
    whatItIs: 'Servicio local (clínica/consultorio/terapia), no un producto físico.',
    problemSolved: '—',
    attributes: [],
    peScenario: 'D',
    peCompetitors: [],
    priority: 'descartado',
    reasoning:
      'Descartado sin análisis LLM: el nombre o las categorías de la página en Meta ' +
      'indican que es un servicio local, no un producto importable para dropshipping.',
    peSearchTerms: [],
  }
}

async function analyzeNiche(niche: string) {
  const pending = await getProductsToAnalyze(niche, BATCH_LIMIT)
  if (!pending.length) {
    console.log(`[${niche}] nada por analizar`)
    return
  }

  // Pool PE del nicho (una sola query; el matching por producto es por candidato)
  const pePool = await getPeCompetitors(niche)

  console.log(`[${niche}] analizando ${pending.length} productos (pool PE: ${pePool.length})`)
  let llmCalls = 0
  let skippedServices = 0
  for (const candidate of pending) {
    try {
      // Servicios: descarte gratis, sin LLM
      if (isLikelyService(candidate.name ?? candidate.raw_data.advertiser_name, candidate.raw_data.page_categories ?? [])) {
        const analysis = serviceDiscard(candidate)
        await saveProductAnalysis(candidate.id, analysis.score, analysis)
        skippedServices++
        console.log(`  ⊘ ${candidate.name} → servicio, descartado sin LLM`)
        continue
      }

      const peMatch = matchPeCompetitors(candidate, pePool)
      const analysis = await analyzeProduct({ candidate, peMatch })
      llmCalls++
      await saveProductAnalysis(candidate.id, analysis.score, analysis)
      console.log(`  ✓ ${candidate.name} → score ${analysis.score} · ${analysis.priority} · PE match: ${peMatch.competitors.length}`)
    } catch (e) {
      console.error(`  ✗ ${candidate.name}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`[${niche}] listo — ${llmCalls} llamadas LLM, ${skippedServices} servicios descartados gratis`)
}

async function main() {
  const args = process.argv.slice(2)
  const nicheIdx = args.indexOf('--niche')
  const niches = nicheIdx !== -1 && args[nicheIdx + 1] ? [args[nicheIdx + 1]] : ALL_NICHES
  for (const niche of niches) await analyzeNiche(niche)
}

main().catch((e) => { console.error(e); process.exit(1) })
