// Pipeline entrelazado scrape+análisis — corre en GitHub Actions (path --all).
//   npx tsx scripts/pipeline.ts --all
//   npx tsx scripts/pipeline.ts --niche rodilla     (debug de un nicho)
//
// Por qué existe: el flujo secuencial (scrapear TODOS los nichos → un batch de
// análisis) hace que el primer resultado utilizable tarde horas en una siembra
// masiva. La Batches API es asíncrona: aquí, al terminar el scrape de cada
// nicho se ENVÍA su batch sin esperar y se sigue scrapeando el siguiente; los
// batches completados se cosechan entre nichos. El primer nicho queda `ready`
// en ~15-20 min en vez de ~3h.
//
// ⚠️ COSTO: misma Batches API (50% descuento) y mismo gate score IS NULL que
// analyze.ts — solo cambia el orden, no el volumen de llamadas.
import './bootstrap' // env + polyfill WebSocket — debe ir primero
import { scrapeNiche } from '../lib/product-hunter/scraper'
import { getNichesToRefresh } from '../lib/product-hunter/db'
import { ALL_NICHES } from '../lib/product-hunter/keywords'
import { resolveKeywords, resolveCountries } from './resolve'
import {
  submitAnalysisBatch,
  waitForBatch,
  isBatchDone,
} from '../lib/product-hunter/anthropic'
import { collectNiche, analyzeDirect, persistBatchResults } from '../lib/product-hunter/analysis-runner'

const NO_BATCH = process.env.PH_NO_BATCH === '1'

interface PendingBatch {
  batchId: string
  niche: string
  names: Map<string, string>
}

// Cosecha los batches ya terminados. block=true espera a TODOS (drenaje final).
async function harvest(pending: PendingBatch[], block = false): Promise<PendingBatch[]> {
  const remaining: PendingBatch[] = []
  for (const b of pending) {
    try {
      if (block) await waitForBatch(b.batchId)
      else if (!(await isBatchDone(b.batchId))) {
        remaining.push(b)
        continue
      }
      console.log(`\n─── Cosechando análisis de [${b.niche}] (batch ${b.batchId}) ───`)
      const { ok, failed } = await persistBatchResults(b.batchId, b.names)
      console.log(`[${b.niche}] análisis listo: ${ok} guardados, ${failed} fallidos`)
    } catch (e) {
      console.error(`✗ batch [${b.niche}] ${b.batchId}: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    }
  }
  return remaining
}

async function main() {
  const args = process.argv.slice(2)
  const nicheIdx = args.indexOf('--niche')

  let niches: string[]
  if (nicheIdx !== -1 && args[nicheIdx + 1]) {
    niches = [args[nicheIdx + 1]]
  } else if (args.includes('--all')) {
    const toRefresh = await getNichesToRefresh()
    niches = toRefresh.length ? toRefresh.map((n) => n.id) : ALL_NICHES
  } else {
    console.error('Uso: tsx scripts/pipeline.ts --niche <nombre> | --all')
    process.exit(1)
  }

  let pending: PendingBatch[] = []
  let ok = 0
  let failed = 0

  for (const niche of niches) {
    try {
      // Cosecha no-bloqueante: persistir lo que ya terminó mientras scrapeábamos
      pending = await harvest(pending)

      const keywords = await resolveKeywords(niche)
      const countries = await resolveCountries(niche)
      await scrapeNiche(niche, { keywords, countries })

      const { entries, names } = await collectNiche(niche)
      if (entries.length) {
        if (NO_BATCH || entries.length <= 2) {
          console.log(`[${niche}] ${entries.length} productos → análisis directo`)
          await analyzeDirect(entries, names)
        } else {
          const batchId = await submitAnalysisBatch(entries)
          pending.push({ batchId, niche, names })
          console.log(`[${niche}] batch ${batchId} enviado (${entries.length} productos) — sigo con el próximo nicho`)
        }
      }
      ok++
    } catch (e) {
      failed++
      console.error(`✗ [${niche}]: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    }
  }

  // Drenaje final: esperar los batches que sigan en vuelo
  if (pending.length) {
    console.log(`\n─── Drenando ${pending.length} batches pendientes ───`)
    await harvest(pending, true)
  }

  console.log(`\n═══ Pipeline: ${ok} nichos OK · ${failed} fallidos ═══`)
}

main().catch((e) => { console.error(e); process.exit(1) })
