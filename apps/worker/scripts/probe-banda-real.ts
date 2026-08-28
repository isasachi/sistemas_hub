// Bytes EN EL CABLE por lectura de anunciante — que es lo que factura un proxy.
//
//   npx tsx scripts/probe-banda-real.ts <page_id> [page_id...]
//
// ⚠️ La medición anterior (`probe-banda.ts`) contaba el HTML DECODIFICADO. Un
// proxy cobra el tráfico comprimido, y el HTML de Meta comprime mucho, así que
// aquel número sobreestima. Acá se usa `request.sizes()`, que devuelve el
// tamaño encodeado real.
//
// ⚠️ Y mide los DOS caminos por separado, porque cuestan distinto: el `fetch`
// same-origin trae solo el documento; la NAVEGACIÓN (el fallback) arrastra
// además los assets de la SPA. Si el fetch queda bloqueado, se paga el segundo.
import './bootstrap'
import type { Page } from 'playwright'
import { launchScraperContext } from '../lib/product-hunter/scraper'
import { openSsrSession, advertiserUrl } from '../lib/product-hunter/ssr-fetch'

const MB = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`
const KB = (n: number) => `${(n / 1024).toFixed(0)} KB`

/** Suma los bytes encodeados de todo lo que baje mientras corre `fn`. */
async function medir(page: Page, fn: () => Promise<unknown>): Promise<number> {
  let bytes = 0
  const pend: Promise<void>[] = []
  const on = (r: import('playwright').Response) => {
    pend.push(
      r.request().sizes()
        .then((s) => { bytes += s.responseBodySize + s.responseHeadersSize })
        .catch(() => {}),
    )
  }
  page.on('response', on)
  await fn()
  await new Promise((s) => setTimeout(s, 1500))   // deja asentar las pendientes
  await Promise.all(pend)
  page.off('response', on)
  return bytes
}

async function main() {
  const ids = process.argv.slice(2)
  const { browser, pages } = await launchScraperContext(1)
  const page = pages[0]

  const sesion = await medir(page, () => openSsrSession(page))
  console.log(`sesión inicial: ${MB(sesion)} (UNA vez por page, se amortiza)\n`)

  let totFetch = 0, totNav = 0, n = 0
  for (const id of ids) {
    const url = advertiserUrl(id)
    const bFetch = await medir(page, async () => {
      await page.evaluate(`fetch(${JSON.stringify(url)}, { credentials: 'include' }).then(r => r.text()).catch(() => '')`)
    })
    const bNav = await medir(page, async () => {
      await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(2_500)
    })
    totFetch += bFetch; totNav += bNav; n++
    console.log(`${id} · fetch ${KB(bFetch)} · navegación ${KB(bNav)}`)
  }

  if (n) {
    const mf = totFetch / n, mn = totNav / n
    console.log(`\nmedia por anunciante: fetch ${KB(mf)} · navegación ${KB(mn)}`)
    for (const [nombre, cuantos] of [['824 (>=100 ads)', 824], ['8.088 (>=40 ads)', 8088], ['28.158 (cola entera)', 28158]] as const) {
      console.log(`  ${nombre}: ${MB(mf * cuantos)} por fetch · ${MB(mn * cuantos)} navegando`)
    }
  }
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
