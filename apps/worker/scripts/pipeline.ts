// Pipeline entrelazado scrape+análisis+validación-PE — corre como BLOQUE en el
// daemon del VPS (worker-loop.sh lo llama repetidamente con proceso fresco).
//   npx tsx scripts/pipeline.ts --all                (un bloque de PH_NICHE_BATCH)
//   npx tsx scripts/pipeline.ts --niche rodilla      (debug de un nicho)
//
// Por qué existe: el flujo secuencial (scrapear TODOS los nichos → un batch de
// análisis) hace que el primer resultado utilizable tarde horas en una siembra
// masiva. La Batches API es asíncrona: aquí, al terminar el scrape de cada
// nicho se ENVÍA su batch sin esperar y se sigue scrapeando el siguiente; los
// batches completados se cosechan entre nichos. El primer nicho queda `ready`
// en ~15-20 min en vez de ~3h.
//
// Modelo de BLOQUE (daemon): cada invocación toma los primeros PH_NICHE_BATCH
// (15) de la cola, los scrapea+analiza entrelazado, y al cerrar el bloque
// (drenados los batches) valida la competencia PE de esos 15 con el browser
// caliente. Imprime PH_QUEUE_EMPTY cuando no queda nada por refrescar — el loop
// del daemon usa ese centinela para dormir. Proceso fresco por bloque = browser
// reseteado (evita la degradación de un Chromium de larga vida).
//
// ⚠️ COSTO: misma Batches API (50% descuento) y mismo gate score IS NULL que
// analyze.ts — solo cambia el orden, no el volumen de llamadas.
import './bootstrap' // env + polyfill WebSocket — debe ir primero
import { scrapeNiche, launchScraperContext, CONCURRENCY } from '../lib/product-hunter/scraper'
import { getNichesToRefresh, getActiveNiches, ALL_NICHES, upsertNiche } from '@ph/shared'
import { resolveKeywords, resolveCountries } from './resolve'
import {
  submitAnalysisBatch,
  waitForBatch,
  isBatchDone,
} from '../lib/product-hunter/anthropic'
import { collectNiche, analyzeDirect, persistBatchResults } from '../lib/product-hunter/analysis-runner'
import { validateNiche } from '../lib/product-hunter/pe-validation'

const NO_BATCH = process.env.PH_NO_BATCH === '1'
// Tope de nichos por invocación (= tamaño del bloque del daemon). Proceso fresco
// por bloque mantiene el browser sano en estado estable.
const NICHE_BATCH = Math.max(1, Number(process.env.PH_NICHE_BATCH ?? 15))
// Saltar la validación PE del bloque (debug).
const NO_PE = process.env.PH_NO_PE === '1'

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
    if (toRefresh.length) {
      // Bloque: solo los primeros N. El resto lo toma la próxima invocación
      // (proceso fresco) del daemon.
      niches = toRefresh.slice(0, NICHE_BATCH).map((n) => n.id)
    } else {
      // Cola vacía. ¿DB genuinamente vacía (bootstrap) o todo al día?
      const active = await getActiveNiches()
      if (active.length === 0) {
        // Sin nichos en DB: arrancar desde el mapa estático (un bloque).
        niches = ALL_NICHES.slice(0, NICHE_BATCH)
      } else {
        // Todo fresco: centinela para que el daemon duerma.
        console.log('PH_QUEUE_EMPTY')
        return
      }
    }
  } else {
    console.error('Uso: tsx scripts/pipeline.ts --niche <nombre> | --all')
    process.exit(1)
  }

  let pending: PendingBatch[] = []
  const processed: string[] = []
  const blockedNiches = new Set<string>()  // P2: runs block-comprometidos
  let ok = 0
  let failed = 0

  for (const niche of niches) {
    try {
      // Cosecha no-bloqueante: persistir lo que ya terminó mientras scrapeábamos
      pending = await harvest(pending)

      const keywords = await resolveKeywords(niche)
      const countries = await resolveCountries(niche)
      const { blocked } = await scrapeNiche(niche, { keywords, countries })
      if (blocked) blockedNiches.add(niche)

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
      processed.push(niche)
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

  // Backstop P2: los runs block-comprometidos NO se validan en PE (un probe
  // bloqueado fabricaría escenario A falso — viola la regla de oro "no pautado en
  // PE" sin verificar). Se re-encolan para un re-scrape limpio; sus productos
  // quedan sin peValidation → la validate-pe del tail los retoma en un run sano.
  const toValidate = processed.filter((n) => !blockedNiches.has(n))
  if (blockedNiches.size) {
    console.warn(`\n⚠ ${blockedNiches.size} nicho(s) block-comprometido(s): ${[...blockedNiches].join(', ')} — sin validación PE, re-encolados`)
    for (const niche of blockedNiches) await upsertNiche(niche, 'pending')
  }

  // Validación PE del bloque: con los analizados/persistidos, validar la
  // competencia en vivo reusando UN browser caliente ($0 LLM). Gate PH_NO_PE.
  if (!NO_PE && toValidate.length) {
    console.log(`\n─── Validación PE del bloque (${toValidate.length} nichos) ───`)
    const { browser, pages } = await launchScraperContext(CONCURRENCY)
    try {
      for (const niche of toValidate) await validateNiche(pages, niche)
    } catch (e) {
      console.error(`✗ validación PE del bloque: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    } finally {
      await browser.close()
    }
  }

  console.log(`\n═══ Pipeline: ${ok} nichos OK · ${failed} fallidos ═══`)
}

main().catch((e) => { console.error(e); process.exit(1) })
