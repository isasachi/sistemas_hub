// CLI del análisis Anthropic — corre en GitHub Actions DESPUÉS del scrape.
//   npx tsx scripts/analyze.ts --niche espalda
//   npx tsx scripts/analyze.ts --all
//
// ⚠️ COSTO: este es el ÚNICO punto donde se llama a Anthropic. Procesa en batch
// solo los productos sin analizar (score IS NULL). El resultado queda cacheado en
// DB y las rutas de Vercel solo lo LEEN. Así el costo no escala con usuarios.
//
// Usa la Message Batches API (50% de descuento). Los servicios (clínicas/fisios)
// se descartan ANTES del batch, sin gastar LLM. PH_NO_BATCH=1 fuerza el path
// secuencial (debug); lotes de ≤2 también van directos (no vale el overhead).
import './bootstrap' // env + polyfill WebSocket — debe ir primero
import {
  getProductsToAnalyze,
  getPeCompetitors,
  saveProductAnalysis,
  getActiveNiches,
} from '../lib/product-hunter/db'
import {
  analyzeProduct,
  submitAnalysisBatch,
  waitForBatch,
  batchAnalysisResults,
  type BatchEntry,
} from '../lib/product-hunter/anthropic'
import { isLikelyService, matchPeCompetitors } from '../lib/product-hunter/competitors'
import { ALL_NICHES } from '../lib/product-hunter/keywords'
import type { ProductAnalysis, ProductRow } from '../lib/product-hunter/types'

const BATCH_LIMIT = Number(process.env.PH_ANALYZE_LIMIT ?? 50)
const NO_BATCH = process.env.PH_NO_BATCH === '1'

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

// Recolecta los candidatos a analizar de un nicho: descarta servicios gratis y
// devuelve las entradas listas para el batch.
async function collectNiche(niche: string): Promise<{ entries: BatchEntry[]; names: Map<string, string> }> {
  const entries: BatchEntry[] = []
  const names = new Map<string, string>()

  const pending = await getProductsToAnalyze(niche, BATCH_LIMIT)
  if (!pending.length) {
    console.log(`[${niche}] nada por analizar`)
    return { entries, names }
  }

  const pePool = await getPeCompetitors(niche)
  let skippedServices = 0

  for (const candidate of pending) {
    const name = candidate.name ?? candidate.raw_data.advertiser_name
    if (isLikelyService(name, candidate.raw_data.page_categories ?? [])) {
      const analysis = serviceDiscard(candidate)
      await saveProductAnalysis(candidate.id, analysis.score, analysis)
      skippedServices++
      console.log(`  ⊘ ${name} → servicio, descartado sin LLM`)
      continue
    }
    const peMatch = matchPeCompetitors(candidate, pePool)
    entries.push({ customId: candidate.id, input: { candidate, peMatch } })
    names.set(candidate.id, name)
  }

  console.log(`[${niche}] ${entries.length} candidatos al batch · ${skippedServices} servicios descartados gratis (pool PE: ${pePool.length})`)
  return { entries, names }
}

async function main() {
  const args = process.argv.slice(2)
  const nicheIdx = args.indexOf('--niche')
  // Sin --niche: todos los nichos activos del DB (incluye los creados por
  // usuarios, que el mapa estático ALL_NICHES no conoce).
  const niches =
    nicheIdx !== -1 && args[nicheIdx + 1]
      ? [args[nicheIdx + 1]]
      : await getActiveNiches().then((rows) => (rows.length ? rows.map((n) => n.id) : ALL_NICHES))

  // Un solo batch para todos los nichos de la corrida (menos overhead de polling)
  const entries: BatchEntry[] = []
  const names = new Map<string, string>()
  for (const niche of niches) {
    const res = await collectNiche(niche)
    entries.push(...res.entries)
    for (const [k, v] of res.names) names.set(k, v)
  }

  if (!entries.length) {
    console.log('Nada que enviar a Anthropic.')
    return
  }

  // Lotes chicos o debug → path directo sin Batches API
  if (NO_BATCH || entries.length <= 2) {
    console.log(`Analizando ${entries.length} productos (path directo, sin batch)`)
    for (const e of entries) {
      try {
        const analysis = await analyzeProduct(e.input)
        await saveProductAnalysis(e.customId, analysis.score, analysis)
        console.log(`  ✓ ${names.get(e.customId)} → score ${analysis.score} · ${analysis.priority}`)
      } catch (err) {
        console.error(`  ✗ ${names.get(e.customId)}: ${err instanceof Error ? err.message : err}`)
      }
    }
    return
  }

  console.log(`Enviando batch de ${entries.length} productos a Anthropic (50% descuento)...`)
  const batchId = await submitAnalysisBatch(entries)
  console.log(`Batch ${batchId} enviado. Esperando resultados...`)
  await waitForBatch(batchId)

  let ok = 0
  let failed = 0
  for await (const r of batchAnalysisResults(batchId)) {
    const name = names.get(r.customId) ?? r.customId
    if (r.analysis) {
      await saveProductAnalysis(r.customId, r.analysis.score, r.analysis)
      ok++
      console.log(`  ✓ ${name} → score ${r.analysis.score} · ${r.analysis.priority}`)
    } else {
      failed++
      console.error(`  ✗ ${name}: ${r.error}`)
    }
  }
  console.log(`Batch listo — ${ok} guardados, ${failed} fallidos (se reintentan en la próxima corrida).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
