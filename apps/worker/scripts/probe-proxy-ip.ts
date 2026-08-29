// ¿El proxy rota la IP ENTRE requests de la misma page?
//
// Importa porque el pipeline depende de una sesión: `openSsrSession` navega una
// vez y establece cookies, y después todas las lecturas son fetches
// same-origin. Si cada request sale por una IP distinta, esas cookies viajan
// desde una IP que no las obtuvo — que es una señal clásica para un anti-bot.
import './bootstrap'
import { launchScraperContext } from '../lib/product-hunter/scraper'

const ipDe = (p: import('playwright').Page) => p.evaluate(
  `fetch('https://api.ipify.org?format=json').then(r => r.json()).then(j => j.ip).catch(e => 'error')`,
) as Promise<string>

async function main() {
  const conc = Number(process.argv[2] ?? 3)
  const { browser, pages } = await launchScraperContext(conc)
  await Promise.all(pages.map((p) => p.goto('https://api.ipify.org?format=json', { timeout: 30_000 }).catch(() => {})))

  // 1. ¿Cada PAGE sale por una IP distinta? Es lo que decide si la concurrencia
  //    reparte la carga entre domicilios o la concentra en uno.
  const porPage = await Promise.all(pages.map(ipDe))
  console.log(`IP de cada page (conc ${conc}):`)
  porPage.forEach((ip, i) => console.log(`  page ${i + 1}: ${ip}`))
  console.log(`  → ${new Set(porPage).size} IPs distintas de ${porPage.length}`)

  // 2. ¿La IP de UNA page se mantiene entre requests? Tiene que ser estable:
  //    las cookies de la sesión las estableció esa IP.
  const repetidos: string[] = []
  for (let i = 0; i < 3; i++) { repetidos.push(await ipDe(pages[0])); await new Promise((s) => setTimeout(s, 1000)) }
  console.log(`\n3 requests de la page 1: ${new Set(repetidos).size === 1 ? `estable (${repetidos[0]})` : `ROTA — ${repetidos.join(', ')}`}`)
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
