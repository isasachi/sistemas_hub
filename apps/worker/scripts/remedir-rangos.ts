// Re-mide el RANGO de filas ya verificadas, ahora en el país donde apareció el
// producto en vez de en todos los mercados.
//
//   npx tsx scripts/remedir-rangos.ts                 (todas las verificadas)
//   npx tsx scripts/remedir-rangos.ts --solo-aprobados
//   npx tsx scripts/remedir-rangos.ts --dry-run
//
// ⚠️ NO GASTA LLM y NO toca los veredictos. El juicio sobre el producto (físico,
// del nicho, monoproducto) no cambia porque se mida en otro mercado: lo único
// que cambia es CUÁNTOS anuncios tiene ahí, o sea el rango.
//
// Existe porque el rango se medía con country=ALL y eso contaba volumen
// mundial: InvigorFate figuraba con 685 anuncios cuando en México tiene 47, así
// que aparecía en "100 a más" siendo un "0-50" en su mercado.
import './bootstrap'
import type { Page } from 'playwright'
import {
  launchScraperContext, runPool, isPersistentlyBlocked, PersistentBlockError, CONCURRENCY,
} from '../lib/product-hunter/scraper'
import { openSsrSession, readConnection, advertiserUrl } from '../lib/product-hunter/ssr-fetch'
import { esperarTurno } from '../lib/product-hunter/scan-verify'
import { getRawVerificadas, updateRawAdCount } from '@ph/shared'

const rango = (n: number) => (n < 50 ? '0-50' : n < 100 ? '50-100' : '100+')

async function main() {
  const args = process.argv.slice(2)
  const soloAprobados = args.includes('--solo-aprobados')
  const dryRun = args.includes('--dry-run')

  const filas = (await getRawVerificadas(soloAprobados)) as Array<Record<string, any>>
  console.log(`Re-midiendo ${filas.length} filas por país · conc ${CONCURRENCY}${dryRun ? ' · DRY-RUN' : ''}`)

  // Un anunciante en un país se lee una sola vez, aunque esté en varios nichos.
  const cache = new Map<string, Promise<number | null>>()
  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  const tally = { igual: 0, cambio: 0, inconcluso: 0, bajaron: 0, subieron: 0 }

  try {
    await Promise.all(pages.map((p) => openSsrSession(p)))

    const settled = await runPool(filas, pages, async (row, page: Page) => {
      const clave = `${row.page_id}|${row.country}`
      let pend = cache.get(clave)
      if (!pend) {
        pend = (async () => {
          await esperarTurno()
          const res = await readConnection(page, advertiserUrl(row.page_id, row.country))
          return res && typeof res.count === 'number' ? res.count : null
        })()
        cache.set(clave, pend)
      }
      const local = await pend
      // Inconcluso: se deja la fila como está. Inventar un rango con el global
      // sería repetir el defecto que este script viene a corregir.
      if (local === null) { cache.delete(clave); return { row, estado: 'inconcluso' as const } }

      const antes = rango(row.ad_count)
      const ahora = rango(local)
      if (!dryRun && local !== row.ad_count) await updateRawAdCount(row.niche, row.page_id, local)
      return { row, estado: 'ok' as const, antes, ahora, local }
    })

    for (const s of settled) {
      if (s.status !== 'fulfilled') { tally.inconcluso++; continue }
      const r = s.value
      if (r.estado === 'inconcluso') { tally.inconcluso++; continue }
      if (r.antes === r.ahora) { tally.igual++; continue }
      tally.cambio++
      if (r.local! < r.row.ad_count) tally.bajaron++; else tally.subieron++
      console.log(
        `~ ${String(r.row.name ?? '').slice(0, 26).padEnd(27)} ${r.row.country} · ` +
        `${String(r.row.ad_count).padStart(5)} → ${String(r.local).padStart(5)} · ${r.antes} → ${r.ahora}`,
      )
    }
  } finally {
    await browser.close()
  }

  console.log(
    `\n═══ ${tally.igual} sin cambio de rango · ${tally.cambio} cambiaron ` +
    `(${tally.bajaron} bajaron, ${tally.subieron} subieron) · ${tally.inconcluso} inconclusos ═══`,
  )
  if (isPersistentlyBlocked()) console.log('PH_PERSISTENT_BLOCK')
}

main().catch((e) => { console.error(e); process.exit(1) })
