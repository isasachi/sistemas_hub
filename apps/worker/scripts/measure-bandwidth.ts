// Mide los BYTES REALES en el cable por navegación contra Meta Ads Library,
// con y sin media-blocking. Convierte la cuota del proxy (Webshare static = 250
// GB/mes) en un presupuesto: cuántas navegaciones / nichos / mes entran.
//
// Usa CDP Network.loadingFinished.encodedDataLength = bytes transferidos reales
// (comprimidos, lo que el proxy mide). $0 LLM, cero escritura a DB.
//
// USO:
//   PH_PROXY="host:port:user:pass" npx tsx scripts/measure-bandwidth.ts
import './bootstrap'
import { chromium, type Page, type BrowserContext } from 'playwright'
import { navigateAndCapture, scanAdNodes, searchUrl } from '../lib/product-hunter/scraper'

function parseProxy() {
  const raw = (process.env.PH_PROXY ?? '').trim()
  if (raw.includes('://')) {
    const u = new URL(raw)
    return { server: `${u.protocol}//${u.host}`, username: u.username || undefined, password: u.password || undefined }
  }
  if (raw) {
    const [host, port, user, pass] = raw.split(':')
    return { server: `http://${host}:${port}`, username: user, password: pass }
  }
  if (process.env.PROXY_SERVER) return { server: process.env.PROXY_SERVER, username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD }
  return null
}

const MEDIA = new Set(['image', 'font', 'media', 'stylesheet'])

async function launch(proxy: NonNullable<ReturnType<typeof parseProxy>>, blockMedia: boolean) {
  const browser = await chromium.launch({
    headless: true,
    proxy,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const context: BrowserContext = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'es-419', timezoneId: 'America/Lima', viewport: { width: 1366, height: 768 },
  })
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }))
  if (blockMedia) {
    await context.route('**/*', (route) => {
      if (MEDIA.has(route.request().resourceType())) return route.abort()
      return route.continue()
    })
  }
  const page = await context.newPage()
  // CDP: bytes transferidos reales (encodedDataLength incluye headers+compresión).
  const client = await context.newCDPSession(page)
  await client.send('Network.enable')
  let bytes = 0
  client.on('Network.loadingFinished', (e: { encodedDataLength: number }) => { bytes += e.encodedDataLength })
  client.on('Network.dataReceived', (e: { encodedDataLength: number }) => { /* cubierto por loadingFinished */ void e })
  return { browser, page, getBytes: () => bytes, reset: () => { bytes = 0 } }
}

async function runMode(proxy: NonNullable<ReturnType<typeof parseProxy>>, blockMedia: boolean, probes: Array<{ kw: string; country: string }>) {
  const { browser, page, getBytes, reset } = await launch(proxy, blockMedia)
  const perNav: number[] = []
  let totalNodes = 0
  try {
    // Warmup: la 1ra navegación carga el JS bundle (se cachea en el context).
    // La medimos aparte para separar "costo de arranque" de "costo por búsqueda".
    reset()
    const warm = await navigateAndCapture(page, searchUrl(probes[0].kw, probes[0].country))
    totalNodes += warm.flatMap((r) => scanAdNodes(r)).length
    const warmupBytes = getBytes()
    for (let i = 1; i < probes.length; i++) {
      reset()
      const res = await navigateAndCapture(page, searchUrl(probes[i].kw, probes[i].country))
      totalNodes += res.flatMap((r) => scanAdNodes(r)).length
      perNav.push(getBytes())
    }
    return { warmupBytes, perNav, totalNodes }
  } finally {
    await browser.close()
  }
}

const PROBES = [
  { kw: 'fascitis plantar', country: 'MX' },
  { kw: 'dolor cuello', country: 'CO' },
  { kw: 'corrector postura', country: 'CL' },
  { kw: 'faja lumbar', country: 'AR' },
  { kw: 'dolor rodilla', country: 'EC' },
]

const MB = 1024 * 1024
const GB = MB * 1024
const fmt = (b: number) => `${(b / MB).toFixed(2)} MB`
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length

async function main() {
  const proxy = parseProxy()
  if (!proxy) { console.error('✗ Falta PH_PROXY'); process.exit(1) }
  console.log('════ Medición de bandwidth por navegación (Meta Ads Library) ════\n')

  // Sin media-blocking primero (más pesado) con MENOS probes para cuidar el free tier.
  console.log('─── Modo A: SIN media-blocking (baseline) ───')
  const a = await runMode(proxy, false, PROBES.slice(0, 3))
  console.log(`  warmup (1ra nav, carga JS): ${fmt(a.warmupBytes)}`)
  console.log(`  por búsqueda (post-warmup): ${a.perNav.map(fmt).join(', ')} → prom ${fmt(avg(a.perNav))}`)

  console.log('\n─── Modo B: CON media-blocking (image/font/media/css abortados) ───')
  const b = await runMode(proxy, true, PROBES)
  console.log(`  warmup (1ra nav, carga JS): ${fmt(b.warmupBytes)}`)
  console.log(`  por búsqueda (post-warmup): ${b.perNav.map(fmt).join(', ')} → prom ${fmt(avg(b.perNav))}`)
  console.log(`  nodos traídos (sanity): ${b.totalNodes} (media-block NO debe romper GraphQL)`)

  // ── Presupuesto sobre 250 GB/mes ──
  const perNavB = avg(b.perNav)
  const perNavA = avg(a.perNav)
  console.log('\n════ PRESUPUESTO sobre 250 GB/mes (static residential) ════')
  console.log(`  Ahorro media-blocking: ${(100 * (1 - perNavB / perNavA)).toFixed(0)}% menos bytes/búsqueda\n`)
  const NAV_PER_NICHE = 130 // ~discovery + enrich + PE por nicho (estimado del run local)
  for (const [label, perNav] of [['SIN media-block', perNavA], ['CON media-block', perNavB]] as const) {
    const navsPerMonth = (250 * GB) / perNav
    const nichesPerMonth = navsPerMonth / NAV_PER_NICHE
    const navsPerDay = navsPerMonth / 30
    console.log(`  ${label}: ${fmt(perNav)}/búsqueda`)
    console.log(`     → ${Math.round(navsPerMonth).toLocaleString()} nav/mes · ~${Math.round(nichesPerMonth)} nichos/mes (a ${NAV_PER_NICHE} nav/nicho)`)
    console.log(`     → presupuesto diario: ${Math.round(navsPerDay).toLocaleString()} nav/día = ${fmt((navsPerDay * perNav))}/día\n`)
  }
  console.log(`  Nota: el warmup (~${fmt(b.warmupBytes)}) se paga 1 vez por PROCESO FRESCO`)
  console.log(`  (PH_NICHE_BATCH nichos comparten 1 warmup). Con batch 10 se amortiza bien.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
