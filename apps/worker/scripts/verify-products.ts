// Cola de verificación del buscador: aplica las tres reglas a los productos
// scrapeados que siguen en 'pendiente'.
//   npx tsx scripts/verify-products.ts [--limit N]
//
// Reglas (en orden): producto físico → rango por nº de anuncios → mayoría de la
// página del anunciante dedicada al mismo producto. Ver lib/verify-product.ts.
//
// ⚠️ COSTO: Anthropic solo acá (Haiku). Vercel solo lee.
import './bootstrap'
import Anthropic from '@anthropic-ai/sdk'
import { launchScraperContext, runPool, isPersistentlyBlocked, CONCURRENCY } from '../lib/product-hunter/scraper'
import { verifyProduct } from '../lib/product-hunter/verify-product'
import { getRawProductsToVerify, countRawPending, saveRawVerdict } from '@ph/shared'

const LIMIT = Math.max(1, Number(process.env.PH_VERIFY_LIMIT ?? 60))

async function main() {
  const args = process.argv.slice(2)
  const li = args.indexOf('--limit')
  const limit = li !== -1 ? Math.max(1, Number(args[li + 1])) : LIMIT

  const rows = await getRawProductsToVerify(limit)
  if (!rows.length) {
    console.log('PH_VERIFY_EMPTY')
    return
  }
  const pendientes = await countRawPending()
  console.log(`Verificando ${rows.length} productos (${pendientes} pendientes en total) · conc ${CONCURRENCY}`)

  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const tally = { monoproducto: 0, sin_verificar: 0, descartado: 0, error: 0 }
  try {
    const settled = await runPool(rows, pages, async (row, page) => {
      const r = await verifyProduct(page, row, ai)
      await saveRawVerdict({
        niche: row.niche, page_id: row.page_id, status: r.verdict.status, kind: r.kind,
        share: r.verdict.share, product_name: r.productName, verdict_note: r.note,
      })
      return r
    })
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i]
      if (s.status !== 'fulfilled') {
        // Sin estado terminal la fila sigue 'pendiente' y, como la cola ordena
        // por antigüedad, vuelve a encabezar la tanda siguiente: una sola fila
        // que siempre falla congela la cola entera (2026-08-06: 45 tandas
        // girando sobre 14 filas). Se marca 'sin_verificar' — no se sirve, no se
        // pierde, y se reintenta reseteando esas filas a 'pendiente'.
        tally.error++
        const msg = s.reason instanceof Error ? s.reason.message.split('\n')[0] : String(s.reason)
        console.error(`✗ ${rows[i].name}: ${msg}`)
        await saveRawVerdict({
          niche: rows[i].niche, page_id: rows[i].page_id, status: 'sin_verificar',
          kind: 'indeterminado', share: null, product_name: null,
          verdict_note: `error de verificación: ${msg}`,
        }).catch(() => {})
        continue
      }
      const r = s.value
      tally[r.verdict.status]++
      const icon = { monoproducto: '✓', sin_verificar: '?', descartado: '✗' }[r.verdict.status]
      console.log(
        `${icon} ${rows[i].niche.padEnd(18)} ${String(rows[i].name).slice(0, 24).padEnd(25)} ` +
        `${String(rows[i].ad_count).padStart(6)} ads · ${r.kind.padEnd(13)} ` +
        `${r.verdict.share === null ? '' : `${Math.round(r.verdict.share * 100)}% del producto`}`,
      )
    }
  } finally {
    await browser.close()
  }

  console.log(
    `\n═══ ${tally.monoproducto} aprobados · ${tally.sin_verificar} sin verificar · ` +
    `${tally.descartado} descartados · ${tally.error} errores ═══`,
  )
  if (isPersistentlyBlocked()) {
    console.error('🛑 block persistente durante la verificación')
    console.log('PH_PERSISTENT_BLOCK')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
