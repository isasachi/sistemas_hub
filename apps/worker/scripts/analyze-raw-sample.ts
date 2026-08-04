// EXPERIMENTO (muestra, no toca la tool): valida la regla de pertenencia al rango.
//   npx tsx scripts/analyze-raw-sample.ts [--per-bucket N] [--dry-run]
//
// La regla que se prueba: un producto solo pertenece a su rango (0-50 / 50-100 /
// 100+) si ESE producto — no el catálogo entero del anunciante — tiene ese
// volumen de anuncios. O sea: entre los anuncios activos del anunciante, tiene
// que haber varios que sean del mismo producto/tema.
//
// Por qué hace falta un LLM: Meta NO deja filtrar los anuncios de un anunciante
// por keyword (probado 2026-08-03: `q=` con search_type page/keyword_unordered/
// keyword_exact_phrase devuelve 0 siempre). Así que se leen los anuncios reales
// de su página y el modelo decide cuáles comparten producto/tema con la entrada.
//
// Estimación (honesta, no exacta): la página del anunciante rinde una MUESTRA de
// sus anuncios (los que cargan en 3 scrolls), no los cientos que puede tener. El
// modelo marca cuántos de esa muestra son del mismo producto → esa proporción se
// extrapola al total para estimar los anuncios DEL PRODUCTO.
//
// ⚠️ COSTO: Anthropic solo en el worker (Haiku, 1 llamada por producto de la
// muestra). Nunca en Vercel. Corre con el daemon detenido (comparte IP).
import './bootstrap'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import fs from 'fs'
import type { Page } from 'playwright'
import {
  launchScraperContext,
  navigateAndCapture,
  scanAdNodes,
  pageUrl,
  runPool,
  noteNavResult,
  CONCURRENCY,
} from '../lib/product-hunter/scraper'
import { isOffTopic } from '../lib/product-hunter/offtopic'
import { getRawProducts, cleanJsonText, RAW_BUCKETS, bucketRange, type RawBucket, type RawProductRow } from '@ph/shared'

const MODEL = process.env.PH_SAMPLE_MODEL ?? 'claude-haiku-4-5'
// Anuncios del anunciante que se le muestran al modelo. 60 y no 25 (medido
// 2026-08-03): una página que pagina rinde ~59 textos únicos con 3 scrolls, así
// que el tope viejo tiraba anuncios YA capturados. Solo cuesta tokens (~3.5k).
const MAX_ADS_SHOWN = Math.max(5, Number(process.env.PH_SAMPLE_MAX_ADS ?? 60))
// "algo en común con al menos otros N": mínimo de OTROS anuncios del mismo tema.
const MIN_SHARED = Math.max(1, Number(process.env.PH_SAMPLE_MIN_SHARED ?? 2))
// (1) Pre-filtro $0: por encima de este total, el anunciante es un marketplace o
// una app, no un producto. Se descarta ANTES de navegar y de llamar al modelo.
const MAX_TOTAL = Math.max(0, Number(process.env.PH_SAMPLE_MAX_TOTAL ?? 2000))
// (2) Con cobertura baja la muestra no puede resolver un CONTEO (en 100+ leemos
// ~1.7% y el IC mide ~1400 anuncios), pero sí una PROPORCIÓN. Debajo de este
// umbral de cobertura se cambia la pregunta: ¿el producto DOMINA la página?
// 0.6 = MIN_PRODUCT_RATIO, el mismo anti-catálogo del buscador de producción.
const MIN_COVERAGE_FOR_COUNT = Number(process.env.PH_SAMPLE_MIN_COVERAGE ?? 0.3)
const DOMINANCE = Number(process.env.PH_SAMPLE_DOMINANCE ?? 0.6)
// Barra mínima de evidencia: por debajo de esto ningún filtro puede declarar
// 'fuera'. Con 2 anuncios leídos, "ninguno menciona el nicho" y "no domina" son
// afirmaciones sobre la carga de la página, no sobre el anunciante.
const MIN_ADS_FOR_VERDICT = Math.max(1, Number(process.env.PH_SAMPLE_MIN_ADS ?? 5))
// Scrolls de la 2ª pasada sobre los casos sin resolver. Medido: en las páginas
// que paginan, 12 pasadas rinden ~40% más anuncios que 3; en las cortas, ninguno.
const DEEP_SCROLLS = Math.max(1, Number(process.env.PH_SAMPLE_DEEP_SCROLLS ?? 12))
const PER_BUCKET_PER_NICHE = 1

const NICHES = [
  'rodilla', 'espalda', 'cuello', 'hombro', 'varices', 'hemorroides', 'insomnio',
  'acne', 'celulitis', 'caida del cabello', 'comida para perros', 'cama para perros',
  'collar antipulgas', 'arena para gatos', 'cepillo para perro',
]

const SYSTEM = `Analizas anuncios de Meta Ads Library para decidir si un anunciante realmente PAUTA UN PRODUCTO concreto, o si ese producto es solo uno más de un catálogo variado.

Recibes:
- El nicho buscado.
- La ENTRADA: el anunciante y el texto del anuncio con el que apareció.
- Una lista numerada de anuncios activos de ese mismo anunciante.

Tu tarea: marcar qué anuncios de la lista son del MISMO producto o de la misma línea/tema que la entrada (un serum para acné y otro tratamiento para acné del mismo anunciante SÍ comparten tema; un serum para acné y una licuadora NO).

Criterio: mismo problema resuelto y misma categoría de producto. Sé estricto con los catálogos genéricos (marketplaces que venden de todo): ahí casi ningún anuncio comparte tema con otro.

Devuelve también la keyword que mejor identifica al producto (una o dos palabras).`

const ResultSchema = z.object({
  productKeyword: z.string(),
  matchedIndices: z.array(z.number().int()),
  reason: z.string(),
})

const TOOL: Anthropic.Tool = {
  name: 'registrar_analisis',
  description: 'Registra qué anuncios del anunciante comparten producto/tema con la entrada.',
  input_schema: z.toJSONSchema(ResultSchema) as Anthropic.Tool.InputSchema,
}

// Página del anunciante SIN `sort_data`. pageUrl() (producción) ordena por
// total_impressions desc, lo que hace que las primeras N tarjetas sean las más
// gastadas del anunciante — justo donde el producto estrella está
// sobrerrepresentado, y eso sesga la proporción hacia arriba. Acá se toma el
// orden por defecto de Meta. NO se cambia pageUrl(): la usan el enrich del
// daemon y la validación PE.
function advertiserUrlUnsorted(pageId: string): string {
  const p = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: 'ALL',
    is_targeted_country: 'false', media_type: 'all', search_type: 'page',
    view_all_page_id: pageId,
  })
  return `https://www.facebook.com/ads/library/?${p}`
}

// (3) Intervalo de Wilson para la proporción: el rango solo se asigna si TODO
// el intervalo cae en el mismo rango. Si lo cruza, el veredicto es
// 'sin verificar' en vez de fabricar precisión que la muestra no tiene.
// `population`: total de anuncios del anunciante. Con él se aplica la corrección
// por población finita — leer 25 de 40 no deja la misma incertidumbre que leer 25
// de 6.000, y en el censo (n ≥ N) no queda ninguna: se sabe la proporción exacta.
// Sin el parámetro se comporta como el Wilson clásico (población infinita).
export function wilson(k: number, n: number, z = 1.96, population?: number): [number, number] {
  if (n === 0) return [0, 1]
  const p = k / n
  if (population && n >= population) return [p, p] // censo: no hay incertidumbre
  const den = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / den
  let half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den
  if (population && population > 1) half *= Math.sqrt((population - n) / (population - 1))
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

function bucketOf(adCount: number): RawBucket {
  return RAW_BUCKETS.find((b) => {
    const { min, max } = bucketRange(b)
    return adCount >= min && (max === null || adCount < max)
  })!
}

interface Sample extends RawProductRow { bucket: RawBucket }

// Muestra estratificada: 1 producto por (nicho × rango). El offset se rota por
// nicho para no quedarse siempre con el tope del rango (los anunciantes gigantes).
async function buildSample(perBucket: number): Promise<Sample[]> {
  const out: Sample[] = []
  for (let i = 0; i < NICHES.length; i++) {
    for (const bucket of RAW_BUCKETS) {
      const offset = [0, 5, 12][i % 3]
      const rows = await getRawProducts(NICHES[i], bucket, perBucket, offset)
      for (const r of rows.slice(0, perBucket)) out.push({ ...r, bucket })
    }
  }
  return out
}

// Grupo de collation: Meta agrupa los anuncios que comparten creativo y reporta
// cuántos son (`collation_count`). scanAdNodes NO lo lee — Meta lo pone en el
// mismo objeto que ad_archive_id y la rama hoja solo mira ancestros — así que
// acá se extrae directo. Sin esto se muestrea "creativos" y se pierde el volumen
// real: NuvoraOficial rinde 58 grupos que colapsan a 8 textos distintos.
interface Collation { id: string; count: number; text: string }

function scanCollations(obj: unknown, pageId: string, out = new Map<string, Collation>(), depth = 0): Map<string, Collation> {
  if (!obj || typeof obj !== 'object' || depth > 25) return out
  const o = obj as Record<string, unknown>
  const adId = o.ad_archive_id ?? o.adArchiveID
  const pid = String(o.page_id ?? o.pageID ?? '')
  if (adId && pid === pageId) {
    const id = String(o.collation_id ?? o.collationID ?? `ad:${adId}`)
    if (!out.has(id)) {
      const snap = (o.snapshot ?? {}) as Record<string, unknown>
      const body = (snap.body ?? {}) as Record<string, unknown>
      const raw = [snap.title, body.text].filter((x) => typeof x === 'string').join(' — ')
      out.set(id, {
        id,
        count: typeof o.collation_count === 'number' && o.collation_count > 0 ? o.collation_count : 1,
        text: cleanJsonText(raw.slice(0, 220)),
      })
    }
    return out
  }
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) v.forEach((x) => scanCollations(x, pageId, out, depth + 1))
    else if (v && typeof v === 'object') scanCollations(v, pageId, out, depth + 1)
  }
  return out
}

interface Analysis {
  s: Sample
  ads: number          // textos distintos mostrados al modelo
  matched: number      // textos marcados como del producto
  weightTotal: number  // anuncios representados por esos textos (suma de collation)
  weightMatched: number
  estimated: number | null
  keyword: string | null
  reason: string
  // Motivo de descarte previo a navegar (pre-filtros $0), si aplica.
  prefilter?: 'marketplace' | 'offtopic'
}

async function analyzeOne(page: Page, s: Sample, ai: Anthropic, scrollPasses?: number): Promise<Analysis> {
  // (1) Pre-filtro $0 por volumen absurdo: ni navegación ni LLM. Un anunciante
  // con miles de anuncios activos es un catálogo; además el ad_count satura
  // (Meta reporta 50001 = "50.000+"), así que arriba ni siquiera es un número.
  if (MAX_TOTAL && s.ad_count > MAX_TOTAL) {
    return { s, ads: 0, matched: 0, weightTotal: 0, weightMatched: 0, estimated: null, keyword: null,
      prefilter: 'marketplace', reason: `${s.ad_count} anuncios activos: marketplace/app, no un producto` }
  }
  const payloads = await navigateAndCapture(page, advertiserUrlUnsorted(s.page_id), { scrollPasses })
  const groups = [...scanCollations(payloads, s.page_id).values()]
  noteNavResult(groups.length)

  // Un texto puede venir en VARIOS grupos (mismo copy, distinto creativo). Al
  // modelo se le manda una sola vez (tokens), pero el peso es la suma de los
  // anuncios de todos sus grupos: es lo que convierte "8 creativos" en
  // "101 anuncios observados".
  const porTexto = new Map<string, number>()
  for (const g of groups) {
    if (!g.text) continue
    porTexto.set(g.text, (porTexto.get(g.text) ?? 0) + g.count)
  }
  const entries = [...porTexto.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_ADS_SHOWN)
  const ads = entries.map(([t]) => t)
  const pesos = entries.map(([, w]) => w)
  const weightTotal = pesos.reduce((a, b) => a + b, 0)

  if (ads.length === 0) {
    return { s, ads: 0, matched: 0, weightTotal: 0, weightMatched: 0, estimated: null, keyword: null,
      reason: 'sin anuncios legibles' }
  }

  const entryRaw = cleanJsonText([s.raw_data?.title, s.raw_data?.body].filter(Boolean).join(' — ').slice(0, 300))

  // (4) Pertenencia al nicho sobre TODO el texto leído (no sobre una card
  // suelta), tras borrar los placeholders sin renderizar de los anuncios
  // dinámicos ({{product.name}}): son texto vacío disfrazado de contenido.
  const strip = (t: string) => t.replace(/\{\{[^}]*\}\}/g, ' ').replace(/\s+/g, ' ').trim()
  const textoUtil = [entryRaw, ...ads].map(strip).filter((t) => t.length >= 12)
  if (textoUtil.length === 0) {
    return { s, ads: ads.length, matched: 0, weightTotal, weightMatched: 0, estimated: null, keyword: null,
      reason: 'anuncios sin texto real (placeholders sin renderizar)' }
  }
  const creativesForTopic = textoUtil.map((t) => ({ title: null, body: t, cta: null, link: null }))
  if (textoUtil.length >= MIN_ADS_FOR_VERDICT
      && isOffTopic(s.name ?? '', creativesForTopic, s.niche, (s.raw_data?.keyword as string) ?? '')) {
    return { s, ads: ads.length, matched: 0, weightTotal, weightMatched: 0, estimated: null, keyword: null,
      prefilter: 'offtopic', reason: `ninguno de los ${textoUtil.length} anuncios legibles menciona nada del nicho` }
  }

  const res = await ai.messages.create({
    model: MODEL,
    max_tokens: 800,
    temperature: 0,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{
      role: 'user',
      content:
        `Nicho: "${s.niche}"\n` +
        `ENTRADA — anunciante "${s.name}": ${entryRaw || '(sin texto)'}\n\n` +
        `Anuncios activos del anunciante:\n` +
        ads.map((a, i) => `${i}. ${a}`).join('\n') +
        `\n\nLlama a registrar_analisis con los índices que comparten producto/tema con la ENTRADA.`,
    }],
  })
  const toolUse = res.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('sin tool_use')
  const parsed = ResultSchema.parse(toolUse.input)
  const idx = new Set(parsed.matchedIndices.filter((i) => i >= 0 && i < ads.length))
  const matched = idx.size
  const weightMatched = [...idx].reduce((a, i) => a + pesos[i], 0)
  // Proporción PONDERADA POR ANUNCIOS (no por creativos) y extrapolada al total.
  const estimated = weightTotal ? Math.round((weightMatched / weightTotal) * s.ad_count) : null
  return { s, ads: ads.length, matched, weightTotal, weightMatched, estimated,
    keyword: parsed.productKeyword, reason: parsed.reason }
}

type Verdict = 'mantiene' | 'domina' | 'mueve' | 'fuera' | 'catalogo' | 'offtopic' | 'sinverificar' | 'inconcluso'

// Árbol de decisión, puro. `sinverificar`/`inconcluso` = la evidencia no alcanza,
// que NO es lo mismo que incumplir la regla.
function decide(r: Analysis): { verdict: Verdict; newBucket: RawBucket | null } {
  const s = r.s
  if (r.prefilter === 'marketplace') return { verdict: 'catalogo', newBucket: null }
  if (r.prefilter === 'offtopic') return { verdict: 'offtopic', newBucket: null }
  if (r.ads === 0 || r.estimated === null || r.weightTotal < MIN_ADS_FOR_VERDICT) {
    return { verdict: 'inconcluso', newBucket: null }
  }
  if (r.matched <= MIN_SHARED) return { verdict: 'fuera', newBucket: null }
  // La muestra efectiva son los ANUNCIOS observados (suma de collation), no los
  // creativos distintos. Cobertura >1 (Meta reporta el total por lo bajo) = censo.
  const n = Math.min(r.weightTotal, s.ad_count)
  const k = Math.round((r.weightMatched / r.weightTotal) * n)
  const [lo, hi] = wilson(k, n, 1.96, s.ad_count)
  if (n / s.ad_count >= MIN_COVERAGE_FOR_COUNT) {
    const bLo = bucketOf(Math.round(lo * s.ad_count))
    const bHi = bucketOf(Math.round(hi * s.ad_count))
    if (bLo !== bHi) return { verdict: 'sinverificar', newBucket: null }
    return { verdict: bLo === s.bucket ? 'mantiene' : 'mueve', newBucket: bLo }
  }
  if (lo >= DOMINANCE) return { verdict: 'domina', newBucket: s.bucket }
  if (hi < DOMINANCE) return { verdict: 'fuera', newBucket: null }
  return { verdict: 'sinverificar', newBucket: null }
}

const CHIP: Record<Verdict, string> = {
  mantiene: 'mantiene', domina: 'mantiene (domina)', mueve: 'cambia', fuera: 'FUERA',
  catalogo: 'FUERA (catálogo)', offtopic: 'FUERA (off-topic)',
  sinverificar: 'sin verificar', inconcluso: 'inconcluso',
}

async function main() {
  const args = process.argv.slice(2)
  const perIdx = args.indexOf('--per-bucket')
  const perBucket = perIdx !== -1 ? Math.max(1, Number(args[perIdx + 1])) : PER_BUCKET_PER_NICHE

  const sample = await buildSample(perBucket)
  console.log(`Muestra: ${sample.length} productos (${NICHES.length} nichos × ${RAW_BUCKETS.length} rangos × ${perBucket})`)
  if (args.includes('--dry-run')) {
    for (const s of sample) console.log(`  [${s.bucket}] ${s.niche} · ${s.name} · ${s.ad_count} ads`)
    return
  }

  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const { browser, pages } = await launchScraperContext(CONCURRENCY)
  let results: Analysis[] = []
  try {
    const run = async (items: Sample[], scrollPasses?: number) => {
      const settled = await runPool(items, pages, (s, page) => analyzeOne(page, s, ai, scrollPasses))
      const ok: Analysis[] = []
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i]
        if (r.status === 'fulfilled') ok.push(r.value)
        else console.error(`✗ ${items[i].name}: ${r.reason instanceof Error ? r.reason.message.split('\n')[0] : r.reason}`)
      }
      return ok
    }

    results = await run(sample)

    // ── Segunda pasada sobre lo no resuelto ──────────────────────────────────
    // Un 'sin verificar' suele ser falta de muestra, no un empate real: la página
    // rindió 7-8 anuncios en 3 scrolls y el intervalo quedó ancho. Se re-leen SOLO
    // esos con DEEP_SCROLLS. Los que siguen sin resolver están genuinamente sobre
    // la línea — ahí ninguna lectura alcanza y el veredicto honesto es no darlo.
    const pendientes = results.filter((r) => {
      const v = decide(r).verdict
      return v === 'sinverificar' || v === 'inconcluso'
    })
    if (pendientes.length) {
      console.log(`\n─── 2ª pasada: ${pendientes.length} sin resolver, releyendo con ${DEEP_SCROLLS} scrolls ───`)
      const reintentos = await run(pendientes.map((r) => r.s), DEEP_SCROLLS)
      const key = (a: Analysis) => `${a.s.niche}:${a.s.page_id}`
      const porPagina = new Map(reintentos.map((r) => [key(r), r]))
      results = results.map((r) => {
        const nuevo = porPagina.get(key(r))
        // Se queda el que leyó MÁS anuncios: si la 2ª pasada rindió menos (página
        // caprichosa), la primera sigue siendo la mejor evidencia disponible.
        return nuevo && nuevo.ads > r.ads ? nuevo : r
      })
      const resueltos = pendientes.filter((p) => {
        const f = results.find((r) => key(r) === key(p))!
        const v = decide(f).verdict
        return v !== 'sinverificar' && v !== 'inconcluso'
      })
      console.log(`  ${resueltos.length} de ${pendientes.length} resueltos al leer más`)
    }
  } finally {
    await browser.close()
  }

  // ── Veredictos ────────────────────────────────────────────────────────────
  const tally: Record<Verdict, number> = {
    mantiene: 0, domina: 0, mueve: 0, fuera: 0, catalogo: 0, offtopic: 0, sinverificar: 0, inconcluso: 0,
  }
  const rows: string[] = []
  const decided = new Map<string, ReturnType<typeof decide>>()
  const rowKey = (a: Analysis) => `${a.s.niche}:${a.s.page_id}`
  for (const r of results) {
    const d = decide(r)
    decided.set(rowKey(r), d)
    tally[d.verdict]++
    const texto = d.verdict === 'mueve' ? `→ ${d.newBucket}` : CHIP[d.verdict]
    rows.push(
      `${r.s.bucket.padEnd(7)} ${r.s.niche.padEnd(20)} ${String(r.s.name).slice(0, 26).padEnd(27)} ` +
      `${String(r.s.ad_count).padStart(6)} ads · textos ${String(r.matched).padStart(2)}/${String(r.ads).padStart(2)} ` +
      `· ads ${String(r.weightMatched).padStart(3)}/${String(r.weightTotal).padStart(3)} ` +
      `· est. ${String(r.estimated ?? '-').padStart(6)} · ${texto}   [${r.keyword ?? '-'}]`,
    )
  }
  console.log(`\n${'RANGO'.padEnd(7)} ${'NICHO'.padEnd(20)} ${'ANUNCIANTE'.padEnd(27)} ${'TOTAL'.padStart(6)}         MATCH        ESTIM   VEREDICTO`)
  rows.sort().forEach((r) => console.log(r))
  console.log(
    `\n═══ ${results.length} analizados · ${tally.mantiene + tally.domina} mantienen · ${tally.mueve} cambian de rango · ` +
    `${tally.fuera} fuera por la regla · ${tally.catalogo + tally.offtopic} fuera por pre-filtro ($0) · ` +
    `${tally.sinverificar} sin verificar · ${tally.inconcluso} inconclusos ═══`,
  )

  const out = '/tmp/analyze-raw-sample.json'
  fs.writeFileSync(out, JSON.stringify(results.map((r) => ({
    niche: r.s.niche, advertiser: r.s.name, pageId: r.s.page_id, bucket: r.s.bucket,
    adCount: r.s.ad_count, adsShown: r.ads, matched: r.matched, estimated: r.estimated,
    weightTotal: r.weightTotal, weightMatched: r.weightMatched,
    keyword: r.keyword, reason: r.reason, country: r.s.country, prefilter: r.prefilter ?? null,
    verdict: decided.get(rowKey(r))?.verdict ?? null,
    coverage: r.s.ad_count ? r.ads / r.s.ad_count : 0,
    adsUrl: pageUrl(r.s.page_id),
    entry: [r.s.raw_data?.title, r.s.raw_data?.body].filter(Boolean).join(' — ').slice(0, 200),
  })), null, 2))
  console.log(`detalle → ${out}`)
}

// Bajo Vitest el módulo se importa solo para testear `wilson`; no debe correr.
if (!process.env.VITEST) main().catch((e) => { console.error(e); process.exit(1) })
