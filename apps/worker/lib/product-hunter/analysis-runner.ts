// Piezas reutilizables del análisis — compartidas por scripts/analyze.ts (CLI)
// y scripts/pipeline.ts (orquestador entrelazado).
//
// ⚠️ COSTO: importa anthropic.ts, así que este módulo SOLO se importa desde
// scripts de CI (GitHub Actions). Ninguna ruta de Next/Vercel debe importarlo.
import {
  getProductsToAnalyze,
  getPeCompetitors,
  saveProductAnalysis,
  saveProductAnalysisIfUnscored,
} from '@ph/shared'
import {
  analyzeProduct,
  batchAnalysisResults,
  listRecentEndedBatches,
  type BatchEntry,
} from './anthropic'
import { isLikelyService, matchPeCompetitors } from './competitors'
import { isOffTopic } from './offtopic'
import type { ProductAnalysis, ProductRow } from '@ph/shared'

export const BATCH_LIMIT = Number(process.env.PH_ANALYZE_LIMIT ?? 50)

// Descarte determinista para servicios (clínicas, fisios, médicos): no gastamos
// una llamada a Anthropic en algo que el filtro detecta gratis.
export function serviceDiscard(candidate: ProductRow): ProductAnalysis {
  return {
    score: 5,
    productName: candidate.name ?? candidate.raw_data.advertiser_name,
    whatItIs: 'Servicio local (clínica/consultorio/terapia), no un producto físico.',
    problemSolved: '—',
    attributes: [],
    peScenario: 'D',
    peCompetitors: [],
    priority: 'baja',
    reasoning:
      'Descartado sin análisis LLM: el nombre o las categorías de la página en Meta ' +
      'indican que es un servicio local, no un producto importable para dropshipping.',
    peSearchTerms: [],
  }
}

export interface NicheCollection {
  entries: BatchEntry[]
  names: Map<string, string>
}

// Recolecta los candidatos a analizar de un nicho: descarta servicios gratis y
// devuelve las entradas listas para el batch.
export async function collectNiche(niche: string): Promise<NicheCollection> {
  const entries: BatchEntry[] = []
  const names = new Map<string, string>()

  const pending = await getProductsToAnalyze(niche, BATCH_LIMIT)
  if (!pending.length) {
    console.log(`[${niche}] nada por analizar`)
    return { entries, names }
  }

  const pePool = await getPeCompetitors(niche)
  let skippedServices = 0

  let skippedOffTopic = 0
  for (const candidate of pending) {
    const name = candidate.name ?? candidate.raw_data.advertiser_name
    if (isLikelyService(name, candidate.raw_data.page_categories ?? [])) {
      const analysis = serviceDiscard(candidate)
      await saveProductAnalysis(candidate.id, analysis.score, analysis)
      skippedServices++
      console.log(`  ⊘ ${name} → servicio, descartado sin LLM`)
      continue
    }
    const creatives = (candidate.raw_data.creatives ?? []) as Array<{ body: string | null; title: string | null; cta: string | null; link: string | null }>
    if (isOffTopic(name, creatives, niche, candidate.raw_data.found_keyword)) {
      const analysis: ProductAnalysis = {
        score: 5,
        productName: name,
        whatItIs: 'Producto fuera de la categoría buscada.',
        problemSolved: '—',
        attributes: [],
        peScenario: 'D',
        peCompetitors: [],
        priority: 'baja',
        offTopic: true,
        reasoning: 'Descartado sin análisis LLM: el nombre y los creativos no tienen solapamiento léxico con el nicho buscado.',
        peSearchTerms: [],
      }
      await saveProductAnalysis(candidate.id, analysis.score, analysis)
      skippedOffTopic++
      console.log(`  ⊘ ${name} → off-topic, descartado sin LLM`)
      continue
    }
    const peMatch = matchPeCompetitors(candidate, pePool)
    entries.push({ customId: candidate.id, input: { candidate, peMatch } })
    names.set(candidate.id, name)
  }

  console.log(`[${niche}] ${entries.length} candidatos al batch · ${skippedServices} servicios · ${skippedOffTopic} off-topic descartados gratis (pool PE: ${pePool.length})`)
  return { entries, names }
}

// Path directo (sin Batches API) — lotes chicos o debug con PH_NO_BATCH=1.
export async function analyzeDirect(entries: BatchEntry[], names: Map<string, string>): Promise<void> {
  for (const e of entries) {
    try {
      const analysis = await analyzeProduct(e.input)
      await saveProductAnalysis(e.customId, analysis.score, analysis)
      console.log(`  ✓ ${names.get(e.customId)} → score ${analysis.score} · ${analysis.priority}`)
    } catch (err) {
      console.error(`  ✗ ${names.get(e.customId)}: ${err instanceof Error ? err.message : err}`)
    }
  }
}

// Reconcilia batches HUÉRFANOS al arrancar (antes de scrapear): cosecha los
// terminados recientes y rescata SOLO los productos que siguen score NULL
// (additive-only vía saveProductAnalysisIfUnscored — nunca clobbea un re-análisis
// fresco). Cierra el agujero de costo: sin esto, un batch enviado y luego matado a
// media tanda dejaba productos NULL que el próximo ciclo re-enviaba = doble cobro.
//
// ponytail: sin estado propio (custom_id = product id; el guard score-null evita
// re-escribir). Techo: re-lee batches ya cosechados dentro de la ventana (red, no
// LLM). Upgrade si pesa: persistir los batchId cosechados. Ventana vía PH_RECONCILE_WINDOW_HOURS.
export async function reconcileOrphanBatches(): Promise<number> {
  const windowHours = Number(process.env.PH_RECONCILE_WINDOW_HOURS ?? 6)
  const batchIds = await listRecentEndedBatches(windowHours)
  if (!batchIds.length) return 0
  let rescued = 0
  for (const batchId of batchIds) {
    try {
      for await (const r of batchAnalysisResults(batchId)) {
        if (r.analysis && (await saveProductAnalysisIfUnscored(r.customId, r.analysis.score, r.analysis))) rescued++
      }
    } catch (e) {
      console.error(`✗ reconcile batch ${batchId}: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    }
  }
  if (rescued) console.log(`♻ reconciliación de batches huérfanos: ${rescued} productos rescatados (evita re-análisis)`)
  return rescued
}

// Persiste los resultados de un batch terminado. Los fallidos quedan con score
// NULL y se reintentan en la próxima corrida.
export async function persistBatchResults(
  batchId: string,
  names: Map<string, string>
): Promise<{ ok: number; failed: number }> {
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
  return { ok, failed }
}
