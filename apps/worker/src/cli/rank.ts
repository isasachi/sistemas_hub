// Fases 7 a 10: advertiser analyzer → monoproducto → relevancia → ranking →
// export.
//
//   npx tsx src/cli/rank.ts --query "dolor de muela"
//   npx tsx src/cli/rank.ts --query "dolor de muela" --limit 40 --json salida.json
//
// `--query` es la semilla con la que se mide la relevancia (§39): sin ella no
// hay contra qué comparar. Se expande con el mismo diccionario de la Fase 3, así
// que el texto que se puntúa se mide contra las mismas keywords que se buscaron.
//
// ⚠️ SIN LLM y sin tocar `ph_*`.
import '../../scripts/bootstrap'
import { writeFileSync } from 'node:fs'
import type { Page } from 'playwright'
import {
  launchScraperContext, runPool, noteNavResult, rateGateMs,
  isPersistentlyBlocked, PersistentBlockError, CONCURRENCY,
} from '../../lib/product-hunter/scraper'
import { openSsrSession } from '../../lib/product-hunter/ssr-fetch'
import { profileAdvertiser } from '../advertisers/aggregate'
import { BUCKET_LABEL } from '../advertisers/bucket'
import { expandKeyword } from '../discovery/expand'
import { bm25, phraseCoverage } from '../scoring/relevance'
import { eligibility, opportunityScore, daysActive, type Candidate } from '../scoring/opportunity'
import { jaccard } from '../products/similarity'
import {
  acceptedAds, countriesByAd, saveAdvertiser, saveAdvertiserProducts,
  markRejected, markAccepted, productNameForAd, setRelevance, type AcceptedAd,
} from '../db/advertisers'

const JITTER_MS = Math.max(0, Number(process.env.PH_JITTER_MS ?? 500))
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function esperarTurno(): Promise<void> {
  if (isPersistentlyBlocked()) throw new PersistentBlockError()
  const gate = rateGateMs()
  if (gate > 0) await sleep(gate)
  if (JITTER_MS) await sleep(Math.random() * JITTER_MS)
}

async function main() {
  const args = process.argv.slice(2)
  const val = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined }
  const seed = (val('--query') ?? '').trim()
  if (!seed) { console.error('Falta --query "<semilla>"'); process.exit(1) }
  const limit = Math.max(1, Number(val('--limit') ?? 60))
  const country = (val('--country') ?? 'CO').toUpperCase()
  const jsonOut = val('--json')
  const dryRun = args.includes('--dry-run')

  const ads = await acceptedAds(limit)
  if (!ads.length) { console.log('No hay anuncios aceptados. Corré antes src/cli/analyze.ts. DISC_RANK_EMPTY'); return }

  // ── Fase 9a: relevancia (BM25 sobre el corpus de ESTA corrida) ────────────
  const terms = expandKeyword(seed)
  const docs = ads.map((a) => ({ id: a.id, text: `${a.headline ?? ''} ${a.primary_text ?? ''}` }))
  // Dos números con dos trabajos distintos, y mezclarlos ya costó una corrida:
  // `rel` (absoluto, por frase) decide el PASS/FAIL del §43; `orden` (BM25
  // normalizado contra el mejor de la tanda) solo ordena.
  const rel = phraseCoverage(docs, terms)
  const orden = bm25(docs, terms)
  if (!dryRun) await setRelevance(ads.map((a) => ({ id: a.id, relevance: rel.get(a.id) ?? 0 })))

  // ── Fase 7: deep crawl, SOLO de los anunciantes que sobrevivieron ─────────
  const byAdvertiser = new Map<string, AcceptedAd[]>()
  for (const a of ads) {
    if (!byAdvertiser.has(a.page_id)) byAdvertiser.set(a.page_id, [])
    byAdvertiser.get(a.page_id)!.push(a)
  }
  const pageIds = [...byAdvertiser.keys()]
  console.log(
    `${ads.length} anuncios aceptados · ${pageIds.length} anunciantes por perfilar · ` +
    `conc ${CONCURRENCY}${dryRun ? ' · DRY-RUN' : ''}\n`,
  )

  const geo = await countriesByAd(ads.map((a) => a.id))
  const nombres = await productNameForAd(ads.map((a) => a.id))
  // ⚠️ EL RANGO SE MIDE EN EL PAÍS DONDE SE ENCONTRÓ AL ANUNCIANTE, no en uno
  // global. Este repo ya tiene el fallo medido en el motor viejo: InvigorFate
  // tiene 685 anuncios en el mundo y 47 en México, así que preguntar por el país
  // equivocado lo mueve de tramo. Con `--country` fijo salían anunciantes con
  // `0 anuncios` en un país donde nunca pautaron, aunque su anuncio se había
  // descubierto en otro.
  const paisDe = new Map<string, string>()
  for (const [pageId, grupo] of byAdvertiser) {
    const paises = new Set<string>()
    for (const a of grupo) for (const c of geo.get(a.id) ?? []) paises.add(c)
    paisDe.set(pageId, [...paises][0] ?? country)
  }
  const { browser, pages } = await launchScraperContext(Math.min(CONCURRENCY, pageIds.length))
  const filas: Record<string, unknown>[] = []
  const inconclusos: string[] = []

  try {
    await Promise.all(pages.map((p) => openSsrSession(p, country).catch(() => {})))

    const settled = await runPool(pageIds, pages, async (pageId: string, page: Page) => {
      await esperarTurno()
      const prof = await profileAdvertiser(page, pageId, paisDe.get(pageId) ?? country)
      noteNavResult(prof ? prof.distribution.sample : 0)
      return { pageId, prof }
    })

    for (const s of settled) {
      if (s.status !== 'fulfilled') continue
      const { pageId, prof } = s.value
      const grupo = byAdvertiser.get(pageId) ?? []
      // null = inconcluso. NO se degrada a "anunciante chico": eso fabricaría un
      // rango bajo y un monoproducto perfecto de la nada.
      if (!prof) { inconclusos.push(pageId); continue }

      // ⚠️ El producto DOMINANTE del anunciante no es el producto del primer
      // anuncio que matcheó la búsqueda, y confundirlos escribe una clave
      // foránea falsa con un `ad_count` convincente al lado. Son cosas
      // distintas por construcción: el dominante sale del catálogo entero
      // (`tallyProducts`), mientras que los productos que resolvimos son solo
      // los de los anuncios que pasaron NUESTRO filtro temático — o sea una
      // muestra sesgada hacia la consulta. bnatural Store tiene 13 productos y
      // 23% de share: su dominante casi seguro no es la crema dental que
      // encontramos buscando "dolor de muela".
      //
      // Se empareja por nombre y, si no hay coincidencia clara, se guarda NULL.
      // Un nulo es honesto; una FK equivocada no.
      // Con UN solo producto en el catálogo no hay ambigüedad que proteger: el
      // producto que resolvimos ES el dominante. Exigir además que los nombres
      // se parezcan dejaba en NULL hasta a Oral-B (1 producto, share 100%),
      // porque el nombre del tally sale del TÍTULO DEL ANUNCIO y el resuelto de
      // la LANDING — dos textos distintos del mismo producto.
      const dominantName = prof.distribution.dominant?.name ?? null
      let productId: string | null = null
      if (!dryRun) {
        const resueltos = grupo.map((ad) => nombres.get(ad.id)).filter((r) => !!r)
        if (prof.distribution.distinct === 1) {
          productId = resueltos[0]?.productId ?? null
        } else if (dominantName) {
          productId = resueltos.find((r) => r!.name && jaccard(r!.name, dominantName) >= 0.6)?.productId ?? null
        }
      }
      let advertiserId: string | null = null
      if (!dryRun) {
        advertiserId = await saveAdvertiser(prof, paisDe.get(pageId) ?? country, productId)
        if (advertiserId && productId && prof.distribution.dominant) {
          await saveAdvertiserProducts(advertiserId, [{
            product_id: productId,
            ad_count: prof.distribution.dominant.count,
            share: prof.distribution.share,
          }])
        }
      }

      // ── Fases 8-9: elegibilidad y score, por anuncio del anunciante ───────
      for (const ad of grupo) {
        const cand: Candidate = {
          physicalProduct: true,     // ya lo garantizó la Fase 5
          ecommerce: true,
          relevance: rel.get(ad.id) ?? 0,
          // Confianza REAL de la Fase 6 (json-ld 0,95 · título 0,75 · copy del
          // anuncio 0,45), leída de `disc_ad_products`. Con una constante, el
          // gate `minProductConfidence` del §43 no evaluaba nada: todo pasaba
          // por construcción.
          productConfidence: nombres.get(ad.id)?.confidence ?? 0,
          productShare: prof.distribution.share,
          daysActive: daysActive(ad.start_date),
          ecommerceScore: ad.ecommerce_score ?? 0,
          advertiserAds: prof.activeAds ?? prof.distribution.sample,
          countries: geo.get(ad.id)?.size ?? 1,
        }
        const el = eligibility(cand)
        if (!el.eligible) {
          if (!dryRun) await markRejected([ad.id], el.reason!)
          continue
        }
        if (!dryRun) await markAccepted([ad.id])
        const sc = opportunityScore(cand)
        filas.push({
          // El nombre sale de la Fase 6 (leído de la LANDING) y no del título
          // del anuncio: el título es copy publicitario y da cosas como "Pago
          // Contraentrega 🚚" como si fuera el nombre del producto.
          product: nombres.get(ad.id)?.name ?? prof.distribution.dominant?.name ?? ad.headline,
          countries: [...(geo.get(ad.id) ?? [country])],
          advertiser: prof.pageName ?? ad.page_name,
          advertiser_ads: prof.activeAds,
          bucket: prof.bucket,
          product_ads: prof.distribution.dominant?.count ?? 0,
          product_share: prof.distribution.share,
          monoproduct: prof.distribution.monoproduct,
          days_active: cand.daysActive,
          relevance: cand.relevance,
          rank_bm25: orden.get(ad.id) ?? 0,
          landing: ad.landing_url,
          score: sc.opportunity,
        })
      }
    }
  } finally {
    await browser.close()
  }

  // ⚠️ LA UNIDAD DE SALIDA ES (ANUNCIANTE, PRODUCTO), NO EL ANUNCIO. Es el §0
  // del spec — "la unidad final de análisis no es el anuncio: es Advertiser →
  // Product → Ads". Sin esto, un producto con cuatro anuncios ocupa cuatro
  // filas del ranking y desplaza a productos distintos.
  const porProducto = new Map<string, Record<string, unknown>>()
  for (const f of filas) {
    const k = `${f.advertiser ?? ''}|${f.product ?? ''}`
    const prev = porProducto.get(k)
    if (!prev) { porProducto.set(k, { ...f, accepted_ads: 1 }); continue }
    // `accepted_ads`, no "matched": es cuántos anuncios ACEPTADOS colapsaron en
    // esta fila. `product_ads` es otra cosa — los anuncios del producto en todo
    // el catálogo del anunciante — y nombrar a los dos "matched" hacía que uno
    // de los dos números pareciera roto.
    prev.accepted_ads = (prev.accepted_ads as number) + 1
    // Se conserva el mejor de sus anuncios: el más viejo y el más relevante.
    if ((f.score as number) > (prev.score as number)) {
      Object.assign(prev, f, { accepted_ads: prev.accepted_ads })
    }
    prev.countries = [...new Set([...(prev.countries as string[]), ...(f.countries as string[])])]
  }
  const salida = [...porProducto.values()].sort((a, b) => (b.score as number) - (a.score as number))

  // ── Fase 10: salida ───────────────────────────────────────────────────────
  console.log(`═══ ${salida.length} productos elegibles (de ${filas.length} anuncios) ═══\n`)
  for (const f of salida.slice(0, 25)) {
    console.log(
      `${String(f.score).padStart(5)}  ${String(f.product ?? '').slice(0, 44).padEnd(45)} ` +
      `${String(f.advertiser ?? '').slice(0, 22).padEnd(23)} ` +
      `${String(f.advertiser_ads ?? '?').padStart(5)} ads ` +
      `${String(BUCKET_LABEL[f.bucket as keyof typeof BUCKET_LABEL] ?? '?').padEnd(7)} ` +
      `share ${String(Math.round((f.product_share as number) * 100)).padStart(3)}%${f.monoproduct ? ' ✓mono' : ''} ` +
      `· ${f.days_active}d`,
    )
  }
  if (inconclusos.length) {
    console.log(`\n⚠️  ${inconclusos.length} anunciantes inconclusos (no se pudo leer su catálogo): NO se clasificaron.`)
  }
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(salida, null, 2))
    console.log(`\nJSON → ${jsonOut}`)
  }
  if (isPersistentlyBlocked()) { console.log('PH_PERSISTENT_BLOCK'); process.exitCode = 2 }
}

main().catch((e) => { console.error(e); process.exit(1) })
