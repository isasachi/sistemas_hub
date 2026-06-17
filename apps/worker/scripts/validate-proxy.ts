// Test de validación de un proxy (ISP / static-residential) contra Meta Ads Library.
//
// PREGUNTA QUE RESPONDE: ¿una IP de proxy (ej. Webshare static-residential) pasa
// la detección de Meta como lo hace una IP residencial nativa, o cae bloqueada
// como las de datacenter? Reusa la MISMA maquinaria del scraper real
// (navigateAndCapture + scanAdNodes + searchUrl + marcador "~X results"), pero
// ruteada por el proxy. Cero escritura a DB, $0 LLM.
//
// USO:
//   PH_PROXY="host:port:user:pass" npx tsx scripts/validate-proxy.ts
//   # o por variables separadas:
//   PROXY_SERVER=http://host:port PROXY_USERNAME=u PROXY_PASSWORD=p npx tsx scripts/validate-proxy.ts
//   # stress concurrente (simula la carga sostenida real a PH_CONCURRENCY):
//   PH_PROXY="..." npx tsx scripts/validate-proxy.ts --stress
//
// Formato Webshare: el "Download (ip:port:user:pass)" de la lista se pega tal cual
// en PH_PROXY. También acepta "http://user:pass@host:port".
import './bootstrap'
import { chromium, type Page, type BrowserContext } from 'playwright'
import {
  navigateAndCapture,
  scanAdNodes,
  searchUrl,
  runPool,
} from '../lib/product-hunter/scraper'

// ─── Config del proxy ────────────────────────────────────────────────────────
interface ProxyCfg { server: string; username?: string; password?: string }

function parseProxy(): ProxyCfg | null {
  const raw = (process.env.PH_PROXY ?? '').trim()
  if (raw) {
    // "http://user:pass@host:port"
    if (raw.includes('://')) {
      const u = new URL(raw)
      return {
        server: `${u.protocol}//${u.host}`,
        username: u.username ? decodeURIComponent(u.username) : undefined,
        password: u.password ? decodeURIComponent(u.password) : undefined,
      }
    }
    // Webshare list: "host:port:user:pass"  (o "host:port")
    const parts = raw.split(':')
    if (parts.length >= 2) {
      const [host, port, user, pass] = parts
      return { server: `http://${host}:${port}`, username: user, password: pass }
    }
  }
  if (process.env.PROXY_SERVER) {
    return {
      server: process.env.PROXY_SERVER,
      username: process.env.PROXY_USERNAME,
      password: process.env.PROXY_PASSWORD,
    }
  }
  return null
}

// ─── Browser context con proxy (espejo de launchScraperContext) ──────────────
async function launchProxied(proxy: ProxyCfg, pageCount: number) {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: proxy.server, username: proxy.username, password: proxy.password },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const context: BrowserContext = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'es-419',
    timezoneId: 'America/Lima',
    viewport: { width: 1366, height: 768 },
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  const pages: Page[] = []
  for (let i = 0; i < Math.max(1, pageCount); i++) pages.push(await context.newPage())
  return { browser, pages }
}

// Marcador "~X results" — replica de pe-validation.readResultsMarker (no exportada).
// Presente = la SPA cargó (búsqueda genuinamente vacía); ausente con 0 nodos = block.
async function readResultsMarker(page: Page): Promise<number | null> {
  try {
    return await page.evaluate(() => {
      const m = document.body.innerText.match(/~?([\d,]+)\s*results?/i)
      return m ? Number(m[1].replace(/,/g, '')) : null
    })
  } catch { return null }
}

// ─── Fase 0: conectividad + identidad de la IP de salida ─────────────────────
async function checkIdentity(page: Page) {
  console.log('\n─── Fase 0: identidad de la IP de salida ───')
  try {
    await page.goto('https://ipinfo.io/json', { timeout: 30_000, waitUntil: 'domcontentloaded' })
    const txt = await page.evaluate(() => document.body.innerText)
    const info = JSON.parse(txt) as Record<string, string>
    console.log(`  IP:    ${info.ip}`)
    console.log(`  Ubic:  ${info.city ?? '?'}, ${info.region ?? '?'}, ${info.country ?? '?'}`)
    console.log(`  ASN:   ${info.org ?? '?'}`)
    const org = (info.org ?? '').toLowerCase()
    const dcHints = ['amazon', 'aws', 'google', 'microsoft', 'azure', 'digitalocean', 'hetzner', 'ovh', 'contabo', 'linode', 'vultr', 'm247', 'cloud']
    const looksDc = dcHints.some((h) => org.includes(h))
    console.log(`  Tipo:  ${looksDc ? '⚠ parece DATACENTER/hosting (riesgo de bloqueo)' : 'parece ISP/residencial ✓'}`)
    return true
  } catch (e) {
    console.log(`  ✗ no se pudo conectar por el proxy: ${e instanceof Error ? e.message : e}`)
    console.log('    → revisá host/puerto/credenciales del proxy.')
    return false
  }
}

// ─── Clasificación de una búsqueda ───────────────────────────────────────────
type Verdict = 'healthy' | 'empty-valid' | 'blocked' | 'error'
async function probeSearch(page: Page, keyword: string, country: string): Promise<{ v: Verdict; nodes: number; marker: number | null }> {
  try {
    const responses = await navigateAndCapture(page, searchUrl(keyword, country))
    const nodes = responses.flatMap((r) => scanAdNodes(r)).length
    if (nodes > 0) return { v: 'healthy', nodes, marker: null }
    // 0 nodos: el marcador discrimina vacío-genuino vs bloqueo (guard P0).
    const marker = await readResultsMarker(page)
    return { v: marker !== null ? 'empty-valid' : 'blocked', nodes: 0, marker }
  } catch (e) {
    console.log(`    (error nav: ${e instanceof Error ? e.message.split('\n')[0] : e})`)
    return { v: 'error', nodes: 0, marker: null }
  }
}

// Keywords de partes del cuerpo que en IP residencial nativa traen 40-60 nodos
// consistentes (baseline conocido del run local). Si acá dan 0, es la IP.
const PROBES: Array<{ kw: string; country: string }> = [
  { kw: 'fascitis plantar', country: 'MX' },
  { kw: 'dolor cuello', country: 'CO' },
  { kw: 'corrector postura', country: 'CL' },
  { kw: 'faja lumbar', country: 'AR' },
  { kw: 'dolor rodilla', country: 'EC' },
  { kw: 'masajeador cuello', country: 'MX' },
  { kw: 'plantillas ortopedicas', country: 'CO' },
  { kw: 'corrector postura', country: 'PE' },
]

function tally(results: Array<{ v: Verdict; nodes: number }>) {
  const c = { healthy: 0, 'empty-valid': 0, blocked: 0, error: 0 } as Record<Verdict, number>
  let totalNodes = 0
  for (const r of results) { c[r.v]++; totalNodes += r.nodes }
  return { c, totalNodes }
}

async function main() {
  const proxy = parseProxy()
  if (!proxy) {
    console.error('✗ Falta el proxy. Pasá PH_PROXY="host:port:user:pass" o PROXY_SERVER/PROXY_USERNAME/PROXY_PASSWORD.')
    process.exit(1)
  }
  const stress = process.argv.includes('--stress')
  console.log('════ Validación de proxy contra Meta Ads Library ════')
  console.log(`  Proxy: ${proxy.server}${proxy.username ? ` (auth ${proxy.username})` : ''}`)

  const { browser, pages } = await launchProxied(proxy, stress ? Math.max(1, Number(process.env.PH_CONCURRENCY ?? 8)) : 1)
  try {
    const ok = await checkIdentity(pages[0])
    if (!ok) { await browser.close(); process.exit(2) }

    // ── Fase 1: búsquedas secuenciales (¿la IP trae nodos?) ──
    console.log('\n─── Fase 1: búsquedas Meta secuenciales ───')
    const seq: Array<{ v: Verdict; nodes: number }> = []
    for (const { kw, country } of PROBES) {
      const r = await probeSearch(pages[0], kw, country)
      const tag = { healthy: '✓ nodos', 'empty-valid': '· vacío-válido', blocked: '✗ BLOQUEADO', error: '✗ error' }[r.v]
      console.log(`  [${country}] "${kw}" → ${tag} (${r.nodes} nodos${r.marker !== null ? `, marker ~${r.marker}` : ''})`)
      seq.push(r)
    }
    const s = tally(seq)
    console.log(`\n  Fase 1: ${s.c.healthy} con nodos · ${s.c['empty-valid']} vacío-válido · ${s.c.blocked} bloqueado · ${s.c.error} error · ${s.totalNodes} nodos totales`)

    // ── Fase 2 (opcional): stress concurrente a PH_CONCURRENCY ──
    let stressTally: ReturnType<typeof tally> | null = null
    if (stress) {
      const conc = pages.length
      console.log(`\n─── Fase 2: stress concurrente (${conc} pages en paralelo, 2 rondas) ───`)
      const tasks = [...PROBES, ...PROBES]
      const settled = await runPool(tasks, pages, async (t, page) => {
        const r = await probeSearch(page, t.kw, t.country)
        console.log(`  [${t.country}] "${t.kw}" → ${r.v} (${r.nodes})`)
        return r
      })
      const res = settled.map((s) =>
        s.status === 'fulfilled' ? s.value : { v: 'error' as Verdict, nodes: 0, marker: null },
      )
      stressTally = tally(res)
      console.log(`\n  Fase 2: ${stressTally.c.healthy} con nodos · ${stressTally.c['empty-valid']} vacío-válido · ${stressTally.c.blocked} bloqueado · ${stressTally.c.error} error`)
    }

    // ── Veredicto ──
    console.log('\n════ VEREDICTO ════')
    const blockedRate = (s.c.blocked + s.c.error) / seq.length
    if (s.c.healthy >= seq.length * 0.6) {
      console.log('🟢 PROXY VIABLE — la IP trae nodos de Meta como una residencial nativa.')
      console.log('   Siguiente paso: provisionar el VPS y rutear el daemon por este proxy.')
      if (stress && stressTally && stressTally.c.blocked + stressTally.c.error > stressTally.c.healthy)
        console.log('   ⚠ Pero bajo carga concurrente empezó a bloquear → considerá 2-3 IPs o conc más baja.')
    } else if (blockedRate >= 0.5) {
      console.log('🔴 PROXY NO VIABLE — Meta bloquea esta IP (0 nodos sin marcador).')
      console.log('   Las ISP no pasan la detección para tu caso. Opciones: residencial nativa por-GB u Oxylabs Web Scraper API.')
    } else {
      console.log('🟡 AMBIGUO — mezcla de vacíos-válidos y nodos. Repetí el test o probá otras keywords/países.')
    }
  } finally {
    await browser.close()
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
