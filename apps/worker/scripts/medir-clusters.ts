// Mide los CLUSTERS de cada anunciante — no un veredicto, una medición.
//
//   npx tsx scripts/medir-clusters.ts [--pendiente 120] [--descartado 60]
//                                     [--monoproducto 60] [--conc 5]
//
// Responde tres preguntas que hoy no tienen dato, y ninguna cuesta LLM:
//   1. ¿Cuántos productos distintos hay dentro de una página? (`distintos`)
//   2. ¿Cuánto cambia el tramo al contar por cluster en vez de por página?
//   3. ¿Cuánto margen dejan los embeddings sobre el agrupado por URL?
//
// ⚠️ UNA sola lectura por anunciante (la global, que es la que tiene muestra
// para el share). El rango sale del `ad_count` YA guardado, que se midió en el
// país del producto — volver a pedirlo duplicaría los requests sobre la IP que
// ya bloquea, y no cambia lo que se está midiendo.
//
// ⚠️ VUELCA EL CORPUS a un .json. Es el punto: la pregunta del umbral de
// embeddings se contesta offline sobre ese archivo, sin volver a scrapear.
import './bootstrap'
import { createClient } from '@supabase/supabase-js'
import type { Page } from 'playwright'
import { launchScraperContext, runPool } from '../lib/product-hunter/scraper'
import { openSsrSession, readConnection, advertiserUrl, type SsrAd } from '../lib/product-hunter/ssr-fetch'
import { esperarTurno } from '../lib/product-hunter/scan-verify'
import { productKey } from '../lib/product-hunter/product-key'
import { writeFileSync, readFileSync } from 'node:fs'

const arg = (n: string, d: number) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? Number(process.argv[i + 1]) : d
}

// Mismo par de variables que `db.ts` de @ph/shared: en el worker la URL vive en
// NEXT_PUBLIC_SUPABASE_URL y SUPABASE_URL es el respaldo.
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

interface Fila { niche: string; page_id: string; ad_count: number; status: string; name: string | null }
interface Cluster { key: string; n: number; titulo: string | null; url: string | null }
interface Salida extends Fila { muestra: number; distintos: number; clusters: Cluster[] }

// Estratificado a propósito: `pendiente` es la población sin medir (el punto),
// y las otras dos son los CONTROLES ETIQUETADOS — un umbral de fusión tiene que
// respetar las dos a la vez, así que hay que muestrear de los dos lados.
// ⚠️ SIN `--ids`, ESTO NO ES UNA MUESTRA ALEATORIA. PostgREST devuelve el slice
// que le da el planner, así que el `.limit()` toma un arbitrario, no un azar.
// Sirve para tantear; para un número que se vaya a citar, pasá `--ids` con
// page_ids sacados de un `order by random()`.
async function muestra(status: string, n: number, ids?: string[]): Promise<Fila[]> {
  let q = db.from('ph_raw_products').select('niche,page_id,ad_count,status,name').eq('status', status)
  q = ids ? q.in('page_id', ids) : q.gte('ad_count', 40).limit(n * 4)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const vistos = new Set<string>()
  const out: Fila[] = []
  for (const f of (data ?? []) as Fila[]) {
    if (vistos.has(f.page_id)) continue   // un anunciante está en muchos nichos
    vistos.add(f.page_id)
    out.push(f)
    if (out.length >= n) break
  }
  return out
}

function clustersDe(ads: SsrAd[]): Cluster[] {
  const t = new Map<string, { n: number; a: SsrAd }>()
  for (const ad of ads) {
    const k = productKey(ad)
    if (!k) continue
    const prev = t.get(k)
    if (prev) prev.n++
    else t.set(k, { n: 1, a: ad })
  }
  return [...t.entries()]
    .map(([key, v]) => ({ key, n: v.n, titulo: v.a.title, url: v.a.link_url }))
    .sort((a, b) => b.n - a.n)
}

async function main() {
  const plan: Array<[string, number]> = [
    ['pendiente', arg('pendiente', 120)],
    ['descartado', arg('descartado', 60)],
    ['monoproducto', arg('monoproducto', 60)],
  ]
  const idsArg = process.argv.indexOf('--ids')
  const ids = idsArg >= 0
    ? readFileSync(process.argv[idsArg + 1], 'utf8').split(',').map((s) => s.trim()).filter(Boolean)
    : undefined
  const filas: Fila[] = []
  for (const [s, n] of plan) if (n > 0) filas.push(...(await muestra(s, n, ids)))
  console.log(`[medir] ${filas.length} anunciantes: ` +
    plan.map(([s, n]) => `${s} ${filas.filter((f) => f.status === s).length}/${n}`).join(' · '))

  const conc = arg('conc', 3)
  const { browser, pages } = await launchScraperContext(conc)
  // ⚠️ Abrir N sesiones seguidas es la ráfaga más agresiva de toda la corrida y
  // Meta la corta: medido, con conc 5 una de las 5 se pasó de los 60 s y mató
  // el proceso entero antes de leer un solo anunciante. Un fallo acá deja la
  // page fuera del pool en vez de abortar — con una sola sesión viva se mide
  // igual, solo que más lento.
  const vivas: Page[] = []
  for (const p of pages) {
    try { await openSsrSession(p); vivas.push(p) }
    catch (e) { console.log(`[medir] sesión descartada: ${(e as Error).message.split('\n')[0]}`) }
  }
  if (!vivas.length) throw new Error('ninguna sesión pudo abrirse — la IP está bloqueada')
  console.log(`[medir] sesiones vivas: ${vivas.length}/${pages.length}`)

  let nulos = 0, hechos = 0
  const t0 = Date.now()
  const res = await runPool(filas, vivas, async (f: Fila, page: Page): Promise<Salida | null> => {
    if (nulos >= 12) return null            // corta ante un bloqueo, no lo empeora
    await esperarTurno()
    const r = await readConnection(page, advertiserUrl(f.page_id))
    if (!r || !r.ads.length) { nulos++; return null }
    nulos = 0
    if (++hechos % 25 === 0) {
      console.log(`[medir] ${hechos}/${filas.length} · ${((Date.now() - t0) / 60000).toFixed(1)} min`)
    }
    const clusters = clustersDe(r.ads)
    return { ...f, muestra: r.ads.length, distintos: clusters.length, clusters }
  })

  await browser.close()

  const ok = res.flatMap((x) => (x.status === 'fulfilled' && x.value ? [x.value] : []))
  const out = `medicion-clusters-${new Date().toISOString().slice(0, 10)}.json`
  writeFileSync(out, JSON.stringify(ok, null, 2))
  console.log(`\n[medir] leídos ${ok.length}/${filas.length} · ${out}`)

  const tramo = (n: number) => (n < 50 ? '0-50' : n < 100 ? '50-100' : '100+')
  for (const [s] of plan) {
    const g = ok.filter((r) => r.status === s)
    if (!g.length) continue
    const cambian = g.filter((r) => {
      const top = r.clusters[0]?.n ?? 0
      return tramo(r.ad_count) !== tramo(Math.round((top / r.muestra) * r.ad_count))
    }).length
    const med = [...g].sort((a, b) => a.distintos - b.distintos)[Math.floor(g.length / 2)]
    console.log(
      `[${s}] n=${g.length} · productos por página: mediana ${med.distintos}, ` +
      `máx ${Math.max(...g.map((r) => r.distintos))} · ` +
      `muestra media ${(g.reduce((a, r) => a + r.muestra, 0) / g.length).toFixed(0)} ads · ` +
      `share top medio ${(g.reduce((a, r) => a + (r.clusters[0]?.n ?? 0) / r.muestra, 0) / g.length).toFixed(2)} · ` +
      `cambian de tramo ${cambian}/${g.length}`,
    )
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
