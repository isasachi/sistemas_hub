// SPIKE: ¿el Web Scraper API de Oxylabs nos sirve para reemplazar el Playwright+proxy?
//
// La pregunta decisiva: ¿el HTML renderizado que devuelve el API contiene el JSON
// inline de Relay de Meta (ad_archive_id / search_results_connection) que NUESTRO
// extractor ya parsea? Si sí → migración viable (per-request ~5-8× más barato +
// sin gestión de block). Si no → data degradada, no conviene.
//
// Uso (con las creds del TRIAL de Oxylabs):
//   OXYLABS_USER=xxx OXYLABS_PASS=yyy npx tsx scripts/spike-scraper-api.ts "dolor rodilla" MX
//
// Reusa searchUrl + scanAdNodes del scraper real → el test es 1:1 con producción.
import { scanAdNodes, searchUrl } from '../lib/product-hunter/scraper'
import { writeFileSync } from 'node:fs'

const USER = process.env.OXYLABS_USER
const PASS = process.env.OXYLABS_PASS
const GEO  = process.env.OXYLABS_GEO  // opcional: país del proxy de salida (ej. "MX")
const keyword = process.argv[2] ?? 'dolor rodilla'
const country = process.argv[3] ?? 'MX'
const OUT = '/tmp/oxylabs-spike.html'

// Replica de readInlineAdData (scraper.ts) pero sobre un string HTML en vez de
// un page.evaluate: extrae los <script type="application/json"> con data de ads.
function extractInlineJson(html: string): unknown[] {
  const out: unknown[] = []
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const t = m[1]
    if (!t.includes('"ad_archive_id"') && !t.includes('"search_results_connection"')) continue
    try { out.push(JSON.parse(t)) } catch { /* script no-JSON */ }
  }
  return out
}

// Busca el primer OBJETO que tenga `key` como propiedad directa (= un nodo de ad).
function findFirst(root: unknown, key: string): Record<string, unknown> | null {
  const stack: unknown[] = [root]
  while (stack.length) {
    const v = stack.pop()
    if (v && typeof v === 'object') {
      if (!Array.isArray(v) && key in (v as Record<string, unknown>)) return v as Record<string, unknown>
      stack.push(...Object.values(v as Record<string, unknown>))
    }
  }
  return null
}
// Busca el primer VALOR de `key` en cualquier nivel (para sondear campos anidados).
function deepFind(root: unknown, key: string): unknown {
  const stack: unknown[] = [root]
  while (stack.length) {
    const v = stack.pop()
    if (v && typeof v === 'object') {
      if (!Array.isArray(v) && key in (v as Record<string, unknown>)) return (v as Record<string, unknown>)[key]
      stack.push(...Object.values(v as Record<string, unknown>))
    }
  }
  return undefined
}

;(async () => {
  if (!USER || !PASS) {
    console.error('Faltan OXYLABS_USER / OXYLABS_PASS (creds del trial de Oxylabs).')
    process.exit(1)
  }
  const target = searchUrl(keyword, country)
  console.log(`▶ keyword="${keyword}" país=${country}`)
  console.log(`  target: ${target}\n`)

  const body: Record<string, unknown> = { source: 'universal', url: target, render: 'html' }
  if (GEO) body.geo_location = GEO

  const t0 = Date.now()
  const res = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64'),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error(`✗ API HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`)
    process.exit(1)
  }
  const data = (await res.json()) as { results?: Array<{ content?: string; status_code?: number }> }
  const r0 = data.results?.[0]
  const html = r0?.content ?? ''
  console.log(`✓ respuesta en ${((Date.now() - t0) / 1000).toFixed(1)}s · status target=${r0?.status_code ?? '?'} · HTML=${(html.length / 1024).toFixed(0)} KB`)
  writeFileSync(OUT, html)
  console.log(`  HTML guardado en ${OUT}\n`)

  // 1) ¿aparecen los marcadores de la data rica?
  console.log('── Marcadores en el HTML ──')
  for (const mk of ['ad_archive_id', 'search_results_connection', 'collated_results', 'page_name', 'snapshot']) {
    console.log(`  ${mk.padEnd(28)} ${(html.match(new RegExp(mk, 'g')) ?? []).length} ocurrencias`)
  }
  const rm = html.match(/~?([\d,]+)\s*results?/i)
  console.log(`  ${'"~X results" (DOM)'.padEnd(28)} ${rm ? rm[0] : 'NO presente'}`)

  // 2) Lo decisivo: ¿NUESTRO extractor saca nodos del inline?
  console.log('\n── Extracción con el parser real (scanAdNodes) ──')
  const payloads = extractInlineJson(html)
  const nodes = payloads.flatMap((p) => scanAdNodes(p))
  console.log(`  payloads inline con data: ${payloads.length} · nodos de anuncio extraídos: ${nodes.length}`)

  // 2b) ¿Qué campos RICOS trae el SSR de verdad? (decide si los datos están y
  //     solo hay que re-mapear, o si genuinamente faltan y hace falta enrich).
  console.log('\n── Campos crudos del SSR (¿ad_count / fechas / creativos?) ──')
  const rawAd = findFirst(payloads, 'ad_archive_id')
  if (rawAd) {
    console.log('  keys del nodo:', Object.keys(rawAd).join(', '))
    const probe = (k: string) => { const v = deepFind(rawAd, k); return v === undefined ? '∅' : JSON.stringify(v).slice(0, 80) }
    for (const k of ['collation_count', 'collation_id', 'is_active', 'start_date', 'end_date',
                     'total_active_time', 'snapshot', 'cards', 'body', 'page_id', 'page_name',
                     'impressions', 'reach_estimate', 'spend']) {
      console.log(`    ${k.padEnd(20)} ${probe(k)}`)
    }
  } else {
    console.log('  (no se halló un nodo con ad_archive_id en el inline)')
  }
  if (nodes.length) {
    const s = nodes[0] as { pageID?: string; pageName?: string; collationCount?: number | null; creatives?: unknown[] }
    console.log('  muestra nodo[0]:', JSON.stringify({
      pageID: s.pageID, pageName: s.pageName, collationCount: s.collationCount, creatives: s.creatives?.length ?? 0,
    }))
  }

  console.log('\n══ VEREDICTO ══')
  if (nodes.length > 0) {
    console.log(`✅ VIABLE — el API devuelve el inline de Relay y nuestro extractor saca ${nodes.length} nodos.`)
    console.log('   Migrar la capa de fetch a este API (per-request, ~5-8× más barato, sin gestión de block).')
    console.log('   Nota: es la 1ª página (sin scroll). Verificar si esos nodos alcanzan vs el scroll actual.')
  } else if (rm) {
    console.log('⚠ PARCIAL — hay marcador DOM ("~X results") pero el inline no trae nodos parseables.')
    console.log('   Solo serviría la vía DOM degradada (sin creativos/fechas exactas). Mal fit para reglas de oro.')
  } else {
    console.log('❌ NO VIABLE por esta vía — el API no devolvió ni inline ni marcador (¿render? ¿block? revisar /tmp/oxylabs-spike.html).')
  }
})().catch((e) => { console.error('✗', e instanceof Error ? e.message : e); process.exit(1) })
