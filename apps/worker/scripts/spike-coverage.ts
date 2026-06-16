// SPIKE #3 — Cobertura: ¿el first-page del Web Scraper API trae anunciantes
// DIVERSOS (incluidos los emergentes no-saturados = la propuesta de valor) o solo
// los grandes/saturados de la página 1?
//
// Corre el API sobre las keywords×países de un nicho, dedupe anunciantes, y compara
// el set + perfil de saturación contra lo que el daemon YA guardó (scrolleado) en
// ph_products. Si el set del API ≈ los mismos pocos grandes, o sesga alto, es un
// problema (perdemos los winners no-saturados que viven en el scroll profundo).
//
// Uso (con creds del trial; barato — cap de keywords/países):
//   OXYLABS_USER=x OXYLABS_PASS=y npx tsx scripts/spike-coverage.ts nariz
//   OXYLABS_USER=x OXYLABS_PASS=y npx tsx scripts/spike-coverage.ts nariz "MX,CO"
import './bootstrap'
import { searchUrl } from '../lib/product-hunter/scraper'
import { getNicheStatus } from '@ph/shared'
import { createClient } from '@supabase/supabase-js'

const USER = process.env.OXYLABS_USER, PASS = process.env.OXYLABS_PASS
const niche = process.argv[2] ?? 'nariz'
const countries = (process.argv[3] ?? 'MX,CO').split(',').map((s) => s.trim())
const KW_CAP = Number(process.env.SPIKE_KW_CAP ?? 12)  // tope de keywords (= credits)

type Ad = { pageId: string; pageName: string; collationCount: number; startDate: number }

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64') },
    body: JSON.stringify({ source: 'universal', url, render: 'html' }),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { results?: Array<{ content?: string }> }
  return data.results?.[0]?.content ?? ''
}

// Extrae TODOS los ad nodes del SSR con sus campos planos (prototipo del re-map).
function extractSsrAds(html: string): Ad[] {
  const out: Ad[] = []
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (!m[1].includes('"ad_archive_id"')) continue
    let json: unknown
    try { json = JSON.parse(m[1]) } catch { continue }
    const stack: unknown[] = [json]
    while (stack.length) {
      const v = stack.pop()
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      if (!Array.isArray(v) && 'ad_archive_id' in o && 'page_id' in o) {
        out.push({
          pageId: String(o.page_id ?? ''),
          pageName: String(o.page_name ?? ''),
          collationCount: Number(o.collation_count ?? 0),
          startDate: Number(o.start_date ?? 0),
        })
      }
      stack.push(...Object.values(o))
    }
  }
  return out
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

;(async () => {
  if (!USER || !PASS) { console.error('Faltan OXYLABS_USER / OXYLABS_PASS'); process.exit(1) }
  const row = await getNicheStatus(niche)
  const keywords = (row?.keywords ?? [niche]).slice(0, KW_CAP)
  console.log(`▶ nicho="${niche}" · ${keywords.length} keywords × ${countries.length} países = ${keywords.length * countries.length} llamadas API\n`)

  // 1) API first-page sobre keywords×países
  const byPage = new Map<string, Ad>()
  let calls = 0, emptyCalls = 0
  for (const kw of keywords) {
    for (const c of countries) {
      try {
        const ads = extractSsrAds(await fetchHtml(searchUrl(kw, c)))
        calls++
        if (!ads.length) emptyCalls++
        for (const a of ads) {
          if (!a.pageId) continue
          const prev = byPage.get(a.pageId)
          if (!prev || a.collationCount > prev.collationCount) byPage.set(a.pageId, a)
        }
        process.stdout.write(`  [${c}] "${kw}" → ${ads.length} ads\r`)
      } catch (e) { console.error(`\n  ✗ [${c}] "${kw}": ${e instanceof Error ? e.message : e}`) }
    }
  }
  const apiAds = [...byPage.values()]
  console.log(`\n\n── API (first-page) ──`)
  console.log(`  llamadas: ${calls} (vacías: ${emptyCalls}) · anunciantes únicos: ${apiAds.length}`)
  const cc = apiAds.map((a) => a.collationCount).sort((x, y) => x - y)
  const now = Math.floor(Date.now() / 1000)
  const ages = apiAds.map((a) => a.startDate ? Math.round((now - a.startDate) / 86400) : 0).sort((x, y) => x - y)
  const med = (arr: number[]) => arr.length ? arr[Math.floor(arr.length / 2)] : 0
  console.log(`  collation_count: min ${cc[0] ?? 0} · mediana ${med(cc)} · max ${cc[cc.length - 1] ?? 0}`)
  console.log(`  antigüedad (días): min ${ages[0] ?? 0} · mediana ${med(ages)} · max ${ages[ages.length - 1] ?? 0}`)

  // 2) Lo que el daemon YA guardó (scrolleado) para el nicho
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: stored } = await db.from('ph_products').select('raw_data').eq('niche', niche)
  const storedPages = new Set((stored ?? []).map((r) => String((r.raw_data as { page_id?: string })?.page_id ?? '')).filter(Boolean))
  console.log(`\n── Daemon (scrolleado, en ph_products) ──`)
  console.log(`  anunciantes únicos guardados: ${storedPages.size}`)

  // 3) Solape: ¿el API encuentra cosas nuevas o solo repite los grandes ya conocidos?
  const apiPages = new Set(apiAds.map((a) => a.pageId))
  const overlap = [...apiPages].filter((p) => storedPages.has(p)).length
  const apiNew = [...apiPages].filter((p) => !storedPages.has(p)).length
  const storedMissed = [...storedPages].filter((p) => !apiPages.has(p)).length
  console.log(`\n── COBERTURA (la pregunta make-or-break) ──`)
  console.log(`  anunciantes API ya conocidos por el daemon: ${overlap}/${apiPages.size} (${pct(overlap, apiPages.size)}%)`)
  console.log(`  anunciantes NUEVOS que el API aporta:        ${apiNew}`)
  console.log(`  anunciantes del daemon que el API NO ve:     ${storedMissed}/${storedPages.size} (${pct(storedMissed, storedPages.size)}%)`)
  console.log(`\n  Lectura: si el API NO ve un % alto de los del daemon (especialmente los`)
  console.log(`  no-saturados/emergentes), el first-page sesga a saturados → mal fit.`)
})().catch((e) => { console.error('✗', e instanceof Error ? e.message : e); process.exit(1) })
