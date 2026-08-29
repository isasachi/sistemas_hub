// ¿Cuántos bytes cuesta UNA lectura de anunciante? Es el número que decide si
// un free trial de proxy alcanza para el barrido, y no lo tenemos medido: la
// cifra que anda dando vueltas (40-50 MB por nicho) es del scraper VIEJO, que
// navegaba con Playwright; este camino lee por fetch SSR y debería ser otra
// cosa. Sin este dato no se puede elegir proveedor.
import './bootstrap'
import { launchScraperContext } from '../lib/product-hunter/scraper'
import { openSsrSession, advertiserUrl } from '../lib/product-hunter/ssr-fetch'

const KB = (n: number) => `${(n / 1024).toFixed(0)} KB`

async function main() {
  const ids = process.argv.slice(2)
  const { browser, pages } = await launchScraperContext(1)
  const page = pages[0]

  // La sesión se abre UNA vez por page y arrastra todos los assets de la SPA:
  // se amortiza entre miles de lecturas, pero hay que contarla.
  const t0 = Date.now()
  await openSsrSession(page)
  console.log(`sesión inicial: ${((Date.now() - t0) / 1000).toFixed(1)}s (una por page, se amortiza)`)

  for (const id of ids) {
    const js = `(async () => {
      var r = await fetch(${JSON.stringify(advertiserUrl(id))}, { credentials: 'include' })
      var t = await r.text()
      var m = t.indexOf('"search_results_connection":')
      return { bytes: t.length, tieneResultados: m >= 0 }
    })()`
    const out = await page.evaluate(js) as { bytes: number; tieneResultados: boolean }
    console.log(`anunciante ${id}: ${KB(out.bytes)} · con bloque de resultados: ${out.tieneResultados}`)
    await new Promise((s) => setTimeout(s, 2500))
  }
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
