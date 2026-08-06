// Refresco de vigencia — corre solo, cada 48h (systemd timer).
//   npx tsx scripts/refresh-active.ts [--limit N]
//
// Relee el conteo de anuncios EN VIVO de cada anunciante servido y con eso:
//   · 0 anuncios       → status='inactivo'. Deja de servirse (la RPC solo
//     devuelve 'monoproducto'), pero la fila NO se borra: si el anunciante
//     vuelve, se reactiva sin re-descubrir ni re-verificar.
//   · sigue pautando   → actualiza ad_count. Como el rango sale de ese número,
//     un producto que creció de 40 a 120 anuncios cambia de rango solo.
//   · inactivo que volvió → vuelve a 'monoproducto'.
//   · no se pudo leer  → no se toca el estado. Un fallo de red no es una baja.
//
// $0 de LLM: solo el conteo del SSR (~2s por anunciante). No re-verifica las
// reglas — si un anunciante cambió de producto, eso lo corrige el pipeline
// completo, no este refresco.
import './bootstrap'
import { launchScraperContext, runPool, isPersistentlyBlocked, noteNavResult, CONCURRENCY } from '../lib/product-hunter/scraper'
import { fetchAdCount } from '../lib/product-hunter/ad-count'
import { getProductsToRefresh, saveRefresh } from '@ph/shared'

async function main() {
  const args = process.argv.slice(2)
  const li = args.indexOf('--limit')
  const limit = li !== -1 ? Math.max(1, Number(args[li + 1])) : Number(process.env.PH_REFRESH_LIMIT ?? 400)

  const rows = await getProductsToRefresh(limit)
  if (!rows.length) { console.log('Nada que refrescar.'); return }
  console.log(`Refrescando ${rows.length} productos · conc ${CONCURRENCY}`)

  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  const tally = { baja: 0, alta: 0, sigue: 0, sin_dato: 0, error: 0 }
  let reRangeados = 0
  try {
    const settled = await runPool(rows, pages, async (row, page) => {
      const count = await fetchAdCount(page, row.page_id)
      noteNavResult(count === null ? 0 : 1)
      const outcome = await saveRefresh(row.niche, row.page_id, count, row.status === 'inactivo')
      return { row, count, outcome }
    })
    const rango = (n: number) => (n < 50 ? '0-50' : n < 100 ? '50-100' : '100+')
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i]
      if (s.status !== 'fulfilled') {
        tally.error++
        console.error(`✗ ${rows[i].name}: ${s.reason instanceof Error ? s.reason.message.split('\n')[0] : s.reason}`)
        continue
      }
      const { row, count, outcome } = s.value
      tally[outcome]++
      if (outcome === 'baja') console.log(`⊘ baja  ${row.niche.padEnd(18)} ${String(row.name).slice(0, 26).padEnd(28)} dejó de pautar`)
      else if (outcome === 'alta') console.log(`↑ alta  ${row.niche.padEnd(18)} ${String(row.name).slice(0, 26).padEnd(28)} volvió con ${count} anuncios`)
      else if (count !== null && rango(count) !== rango(row.ad_count)) {
        reRangeados++
        console.log(`→ rango ${row.niche.padEnd(17)} ${String(row.name).slice(0, 26).padEnd(28)} ${row.ad_count} → ${count} (${rango(row.ad_count)} → ${rango(count)})`)
      }
    }
  } finally {
    await browser.close()
  }

  console.log(
    `\n═══ ${tally.sigue} siguen · ${tally.baja} de baja · ${tally.alta} reactivados · ` +
    `${reRangeados} cambiaron de rango · ${tally.sin_dato} sin dato · ${tally.error} errores ═══`,
  )
  if (isPersistentlyBlocked()) console.log('PH_PERSISTENT_BLOCK')
}

main().catch((e) => { console.error(e); process.exit(1) })
