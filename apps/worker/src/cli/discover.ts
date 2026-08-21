// Motor de descubrimiento — Fases 1 a 4 del spec.
//
//   npx tsx src/cli/discover.ts --query "dolor de muela"
//   npx tsx src/cli/discover.ts --query "dolor de muela" --countries CO,CL,AR,EC,MX
//   npx tsx src/cli/discover.ts --query "dolor de muela" --dry-run   (no escribe)
//   npx tsx src/cli/discover.ts --query "dolor de muela" --plan      (solo la matriz)
//   npx tsx src/cli/discover.ts --list                               (diccionarios)
//
// ── Qué hace y qué NO ────────────────────────────────────────────────────────
// Adquisición pura: semilla → diccionario → queries → matriz × países →
// anuncios crudos normalizados y persistidos con su camino de descubrimiento.
//
// NO clasifica. Nada acá decide si un anuncio es un producto físico, si es
// ecommerce, si es relevante ni si el anunciante es monoproducto — esas son las
// Fases 5 a 10 y viven fuera de este pipeline a propósito (spec §14). Guardar
// crudo es lo que permite re-correr los filtros sin volver a pagarle a Meta.
//
// ⚠️ SIN LLM, en ninguna rama. Es el punto del spec §49: cada decisión de este
// motor es explicable y reproducible.
//
// ⚠️ Comparte el rate-control singleton de scraper.ts con el daemon viejo (misma
// IP). Por eso respeta el cool-down y alimenta `noteNavResult`: saltárselo
// calienta la IP de la que depende `buscador-productos.service`.
import '../../scripts/bootstrap'
import type { Page } from 'playwright'
import {
  launchScraperContext, runPool, noteNavResult, rateGateMs,
  isPersistentlyBlocked, PersistentBlockError, CONCURRENCY,
} from '../../lib/product-hunter/scraper'
import { openPool, type PaginationToken } from '../browser/session'
import { collectSearch, MAX_PAGES_PER_SEARCH } from '../meta/search'
import { buildMatrix, type SearchJob } from '../discovery/matrix'
import { expandKeyword, MAX_QUERIES_PER_SEED } from '../discovery/expand'
import { listDictionaries, loadDictionary } from '../discovery/dictionaries'
import { normalizeAd } from '../normalization/ad'
import { createRun, insertQueries, markQuery, saveDiscoveries, finishRun, runSummary } from '../db/discovery'

const DEFAULT_COUNTRIES = ['CO', 'CL', 'AR', 'EC', 'MX']
const JITTER_MS = Math.max(0, Number(process.env.PH_JITTER_MS ?? 500))

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Espera lo que pida el rate-control compartido antes de tocar la IP. */
async function esperarTurno(): Promise<void> {
  if (isPersistentlyBlocked()) throw new PersistentBlockError()
  const gate = rateGateMs()
  if (gate > 0) await sleep(gate)
  if (JITTER_MS) await sleep(Math.random() * JITTER_MS)
}

async function main() {
  const args = process.argv.slice(2)
  const val = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined }

  if (args.includes('--list')) {
    const d = listDictionaries()
    console.log(d.length ? `Diccionarios curados:\n  ${d.join('\n  ')}` : 'Sin diccionarios curados.')
    return
  }

  const seed = (val('--query') ?? '').trim()
  if (!seed) { console.error('Falta --query "<consulta>"'); process.exit(1) }

  const countries = (val('--countries') ?? DEFAULT_COUNTRIES.join(','))
    .split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
  const dryRun = args.includes('--dry-run')
  const planOnly = args.includes('--plan')

  // ── Fase 3: keyword engine ────────────────────────────────────────────────
  const queries = expandKeyword(seed)
  const jobs = buildMatrix(seed, countries)
  const curated = !!loadDictionary(seed)

  console.log(
    `Semilla "${seed}" · diccionario ${curated ? 'curado' : 'FALLBACK (sin archivo curado)'}\n` +
    `${queries.length} queries (tope ${MAX_QUERIES_PER_SEED}) × ${countries.length} países ` +
    `(${countries.join('/')}) = ${jobs.length} jobs · ≤${MAX_PAGES_PER_SEARCH} pág/búsqueda · ` +
    `conc ${CONCURRENCY}${dryRun ? ' · DRY-RUN' : ''}`,
  )
  if (planOnly) {
    console.log(`\nQueries:\n  ${queries.join('\n  ')}`)
    return
  }
  if (!jobs.length) { console.log('DISC_EMPTY_MATRIX'); return }

  // ── Fase 4: orquestador ───────────────────────────────────────────────────
  const runId = dryRun ? 'dry-run' : await createRun(seed, countries)
  const queryIds = dryRun ? new Map<string, string>() : await insertQueries(runId, jobs)

  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  let token: PaginationToken | null = null
  const stats = { ok: 0, vacias: 0, inconclusas: 0, errores: 0, truncadas: 0, ads: 0, paginas: 0 }
  const uniques = new Set<string>()

  try {
    // Una navegación por página del pool; el resto son fetches same-origin. De
    // paso cosecha el token de paginación (ver browser/session.ts).
    const opened = await openPool(pages, seed, countries[0])
    token = opened.token
    console.log(
      `Sesiones: ${pages.length} · token de paginación ` +
      `${token ? `sí (cosechado por ${opened.harvested}/${pages.length}, compartido)` : 'NO — solo 1ª página por búsqueda'}\n`,
    )

    const settled = await runPool(jobs, pages, async (job: SearchJob, page: Page) => {
      const qid = queryIds.get(`${job.query}|${job.country}`)
      await esperarTurno()
      const res = await collectSearch(page, job.query, job.country, token, esperarTurno)

      const normalized = res.ads.map(normalizeAd)
      for (const a of normalized) uniques.add(a.dedupeKey)

      if (!dryRun && qid) {
        if (normalized.length) await saveDiscoveries(normalized, qid, job.country)
        await markQuery(qid, {
          status: res.inconclusive ? 'inconclusive' : 'done',
          ads_found: normalized.length,
          pages_read: res.pagesRead,
        })
      }
      return { job, res, n: normalized.length }
    })

    for (const s of settled) {
      if (s.status !== 'fulfilled') {
        stats.errores++
        const msg = s.reason instanceof Error ? s.reason.message : String(s.reason)
        if (s.reason instanceof PersistentBlockError) continue
        console.error(`✗ ${msg.split('\n')[0].slice(0, 120)}`)
        continue
      }
      const { job, res, n } = s.value
      stats.ads += n
      stats.paginas += res.pagesRead
      if (res.inconclusive) stats.inconclusas++
      else if (n === 0) stats.vacias++
      else stats.ok++
      if (res.truncated) stats.truncadas++
      const flag = res.inconclusive ? '?' : n ? '·' : '∅'
      console.log(
        `${flag} ${job.country} ${job.query.slice(0, 34).padEnd(35)} ` +
        `${String(n).padStart(3)} ads · ${res.pagesRead}p` +
        `${res.count !== null ? ` · de ${res.count}` : ''}${res.truncated ? ' · +' : ''}`,
      )
    }

    if (!dryRun) await finishRun(runId)
  } finally {
    await browser.close()
  }

  console.log(
    `\n═══ ${stats.ok} búsquedas con resultados · ${stats.vacias} vacías · ` +
    `${stats.inconclusas} inconclusas · ${stats.errores} errores ═══\n` +
    `${stats.ads} anuncios recogidos · ${uniques.size} únicos · ` +
    `${stats.paginas} páginas leídas · ${stats.truncadas} búsquedas con más resultados sin leer`,
  )
  // Truncadas se reporta SIEMPRE (spec: no silent caps). Una corrida que corta
  // por el tope y no lo dice se lee como cobertura completa.
  if (stats.truncadas) {
    console.log(`   ↑ subí DISC_MAX_PAGES (hoy ${MAX_PAGES_PER_SEARCH}) para llegar más al fondo.`)
  }

  if (!dryRun) {
    const sum = await runSummary(runId).catch(() => null)
    if (sum) {
      console.log(
        `\nEn base: ${sum.queries} queries · ${sum.uniqueAds} anuncios únicos · ` +
        `${sum.discoveries} caminos de descubrimiento ` +
        `(${(sum.discoveries / Math.max(1, sum.uniqueAds)).toFixed(2)} por anuncio)`,
      )
      console.log(`run_id: ${runId}`)
    }
  }

  if (isPersistentlyBlocked()) {
    console.error('🛑 block persistente durante la corrida')
    console.log('PH_PERSISTENT_BLOCK')
    process.exitCode = 2
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
