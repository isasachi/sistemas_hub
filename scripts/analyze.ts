// CLI del análisis Anthropic — corre en GitHub Actions DESPUÉS del scrape.
//   npx tsx scripts/analyze.ts --niche espalda
//   npx tsx scripts/analyze.ts --all
//
// ⚠️ COSTO: este es el ÚNICO punto donde se llama a Anthropic. Procesa en batch
// solo los productos sin analizar (score IS NULL). El resultado queda cacheado en
// DB y las rutas de Vercel solo lo LEEN. Así el costo no escala con usuarios.
import 'dotenv/config'
import {
  getProductsToAnalyze,
  getPeCompetitors,
  saveProductAnalysis,
} from '../lib/product-hunter/db'
import { analyzeProduct } from '../lib/product-hunter/anthropic'
import { ALL_NICHES } from '../lib/product-hunter/keywords'

const BATCH_LIMIT = Number(process.env.PH_ANALYZE_LIMIT ?? 50)

async function analyzeNiche(niche: string) {
  const pending = await getProductsToAnalyze(niche, BATCH_LIMIT)
  if (!pending.length) {
    console.log(`[${niche}] nada por analizar`)
    return
  }

  // Competencia PE del nicho (se carga una vez, se reusa para todos los candidatos)
  const peRows = await getPeCompetitors(niche)
  const peCompetitors = peRows.map((r) => ({
    name: r.name ?? r.raw_data.advertiser_name,
    adCount: r.raw_data.ad_count,
  }))

  console.log(`[${niche}] analizando ${pending.length} productos (competencia PE: ${peCompetitors.length})`)
  for (const candidate of pending) {
    try {
      const analysis = await analyzeProduct({ candidate, peCompetitors })
      await saveProductAnalysis(candidate.id, analysis.score, analysis)
      console.log(`  ✓ ${candidate.name} → score ${analysis.score} · ${analysis.priority}`)
    } catch (e) {
      console.error(`  ✗ ${candidate.name}: ${e instanceof Error ? e.message : e}`)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const nicheIdx = args.indexOf('--niche')
  const niches = nicheIdx !== -1 && args[nicheIdx + 1] ? [args[nicheIdx + 1]] : ALL_NICHES
  for (const niche of niches) await analyzeNiche(niche)
}

main().catch((e) => { console.error(e); process.exit(1) })
