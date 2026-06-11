// CLI del análisis Anthropic — corre en GitHub Actions DESPUÉS del scrape.
//   npx tsx scripts/analyze.ts --niche espalda
//   npx tsx scripts/analyze.ts            (todos los nichos activos)
//
// ⚠️ COSTO: Anthropic solo corre aquí y en scripts/pipeline.ts (CI). Procesa en
// batch solo los productos sin analizar (score IS NULL). El resultado queda
// cacheado en DB y las rutas de Vercel solo lo LEEN.
//
// Usa la Message Batches API (50% de descuento). Los servicios se descartan
// ANTES del batch, sin gastar LLM. PH_NO_BATCH=1 fuerza el path secuencial
// (debug); lotes de ≤2 también van directos (no vale el overhead).
// La lógica compartida vive en lib/product-hunter/analysis-runner.ts.
import './bootstrap' // env + polyfill WebSocket — debe ir primero
import { getActiveNiches } from '../lib/product-hunter/db'
import { submitAnalysisBatch, waitForBatch, type BatchEntry } from '../lib/product-hunter/anthropic'
import { collectNiche, analyzeDirect, persistBatchResults } from '../lib/product-hunter/analysis-runner'
import { ALL_NICHES } from '../lib/product-hunter/keywords'

const NO_BATCH = process.env.PH_NO_BATCH === '1'

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
    await analyzeDirect(entries, names)
    return
  }

  console.log(`Enviando batch de ${entries.length} productos a Anthropic (50% descuento)...`)
  const batchId = await submitAnalysisBatch(entries)
  console.log(`Batch ${batchId} enviado. Esperando resultados...`)
  await waitForBatch(batchId)

  const { ok, failed } = await persistBatchResults(batchId, names)
  console.log(`Batch listo — ${ok} guardados, ${failed} fallidos (se reintentan en la próxima corrida).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
