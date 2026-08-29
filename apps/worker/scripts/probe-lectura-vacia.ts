// ¿Los anunciantes que salieron con share 0 estaban bloqueados o de verdad no
// tienen anuncios legibles? Una lectura por anunciante, nada más.
import './bootstrap'
import { launchScraperContext } from '../lib/product-hunter/scraper'
import { openSsrSession, readConnection, advertiserUrl } from '../lib/product-hunter/ssr-fetch'

async function main() {
  const ids = process.argv.slice(2)
  const { browser, pages } = await launchScraperContext(1)
  const page = pages[0]
  await openSsrSession(page)
  // Las dos lecturas que hace leerAnunciante: la global (de donde sale el share
  // y los clusters) y la del país (de donde sale el rango). Si difieren, el
  // problema está en una de las dos y no en el anunciante.
  for (const id of ids) {
    for (const pais of ['ALL', 'CO', 'MX']) {
      const r = await readConnection(page, advertiserUrl(id, pais))
      console.log(`${id} [${pais}] → ${r ? `count=${r.count} ads=${r.ads.length}` : 'NULL (no se pudo leer)'}`)
      if (r?.ads.length) console.log(`   primero: ${(r.ads[0].title ?? r.ads[0].body ?? '').slice(0, 60)}`)
      await new Promise((s) => setTimeout(s, 2500))
    }
  }
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
