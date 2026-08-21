// Fases 5 y 6: landing analyzer + product resolver.
//
//   npx tsx src/cli/analyze.ts                 (hasta --limit anuncios sin analizar)
//   npx tsx src/cli/analyze.ts --limit 100
//   npx tsx src/cli/analyze.ts --dry-run       (no escribe)
//
// Corre sobre lo que ya está en `disc_ads`: NO vuelve a pedirle nada a Meta.
// Esa separación es el §17 del spec — guardar crudo primero es lo que permite
// re-correr los filtros gratis cuando una regla cambia.
//
// ⚠️ SIN LLM. Cada veredicto se explica con la señal que lo disparó.
import '../../scripts/bootstrap'
import { fetchLanding } from '../landing/fetch'
import { parseLanding, type LandingSignals } from '../landing/parse'
import { scoreEcommerce } from '../landing/ecommerce'
import { classifyPhysical, isSocialDestination } from '../landing/physical'
import { extractProduct, fingerprint } from '../products/extract'
import {
  pendingAds, getCachedLandings, saveLanding, upsertProducts, linkAdProducts,
  saveVerdicts, funnel, type PendingAd, type AdVerdict,
} from '../db/analysis'

// Pool PROPIO, sin relación con el de Meta: son tiendas distintas, así que la
// concurrencia alta no concentra carga en un solo host y no hay block que evitar.
const CONCURRENCY = Math.max(1, Number(process.env.DISC_LANDING_CONCURRENCY ?? 8))

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      out[i] = await fn(items[i])
    }
  }))
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const val = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined }
  const limit = Math.max(1, Number(val('--limit') ?? 200))
  const dryRun = args.includes('--dry-run')

  const ads = await pendingAds(limit)
  if (!ads.length) { console.log('Nada pendiente de analizar. DISC_ANALYZE_EMPTY'); return }

  // Una landing se lee UNA vez aunque la compartan 20 anuncios (spec §35).
  const urls = [...new Set(ads.map((a) => a.landing_url).filter((u): u is string => !!u))]
  const cached = await getCachedLandings(urls)
  const toFetch = urls.filter((u) => !cached.has(u))

  console.log(
    `${ads.length} anuncios sin analizar · ${urls.length} landings únicas ` +
    `(${cached.size} en caché, ${toFetch.length} por leer) · conc ${CONCURRENCY}` +
    `${dryRun ? ' · DRY-RUN' : ''}\n`,
  )

  const signals = new Map<string, LandingSignals | null>()
  for (const [url, c] of cached) signals.set(url, c.signals)

  let ok = 0, fallos = 0
  await pool(toFetch, CONCURRENCY, async (url) => {
    const page = await fetchLanding(url)
    let s: LandingSignals | null = null
    if (page.html) {
      try { s = parseLanding(page.html, page.finalUrl || url) } catch { s = null }
    }
    signals.set(url, s)
    if (s) ok++; else fallos++
    if (!dryRun) {
      await saveLanding({
        url, status_code: page.statusCode, content_type: page.contentType,
        signals: s, error: page.error,
      }).catch(() => {})
    }
  })
  console.log(`Landings leídas: ${ok} ok · ${fallos} sin leer\n`)

  // ── Veredicto por anuncio ─────────────────────────────────────────────────
  const verdicts: AdVerdict[] = []
  const prodItems: { fp: string; p: ReturnType<typeof extractProduct>; ad: PendingAd }[] = []

  for (const ad of ads) {
    const s = ad.landing_url ? signals.get(ad.landing_url) ?? null : null
    const adText = `${ad.headline ?? ''} ${ad.primary_text ?? ''}`.trim()

    if (!ad.landing_url) {
      verdicts.push({ id: ad.id, accepted: false, rejection_reason: 'NO_LANDING_PAGE', physical_product: false, ecommerce: false, ecommerce_score: 0 })
      continue
    }
    // Un anuncio que manda a WhatsApp o a un perfil de Instagram no tiene ficha
    // que analizar. Se separa del resto para no ensuciar el embudo: es "no se
    // pudo evaluar", no "se evaluó y no es un producto".
    if (isSocialDestination(ad.landing_domain)) {
      verdicts.push({ id: ad.id, accepted: false, rejection_reason: 'SOCIAL_LANDING', physical_product: false, ecommerce: false, ecommerce_score: 0 })
      continue
    }

    const eco = s ? scoreEcommerce(s) : { score: 0, ecommerce: false, reasons: [] }
    const phy = classifyPhysical(s, ad.page_name ?? undefined, adText)

    // Orden del §0: físico primero, después vendible por ecommerce. El motivo
    // que se guarda es el PRIMERO que falla, así el embudo del §38 no atribuye
    // el mismo anuncio a dos causas.
    let reason: string | null = null
    if (!phy.physical) reason = 'NOT_PHYSICAL'
    else if (!eco.ecommerce) reason = 'NOT_ECOMMERCE'

    const prod = extractProduct({ headline: ad.headline, landingUrl: ad.landing_url }, s)
    if (!reason && !prod.canonicalName) reason = 'NO_PRODUCT'

    verdicts.push({
      id: ad.id, accepted: !reason, rejection_reason: reason,
      physical_product: phy.physical, ecommerce: eco.ecommerce, ecommerce_score: eco.score,
    })

    const fp = fingerprint(prod)
    if (!reason && fp) prodItems.push({ fp, p: prod, ad })
  }

  if (!dryRun) {
    await saveVerdicts(verdicts)
    const ids = await upsertProducts(prodItems.map(({ fp, p }) => ({ fp, p })))
    await linkAdProducts(prodItems.flatMap(({ fp, p, ad }) => {
      const pid = ids.get(fp)
      return pid ? [{ ad_id: ad.id, product_id: pid, match_method: p.source, confidence: p.confidence }] : []
    }))
  }

  // ── Embudo (spec §38) ─────────────────────────────────────────────────────
  const aceptados = verdicts.filter((v) => v.accepted).length
  const porMotivo: Record<string, number> = {}
  for (const v of verdicts) if (!v.accepted) porMotivo[v.rejection_reason!] = (porMotivo[v.rejection_reason!] ?? 0) + 1

  console.log(`═══ ${aceptados}/${verdicts.length} aceptados ═══`)
  for (const [k, n] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${k}`)
  }
  console.log(`\n${prodItems.length} productos resueltos · ${new Set(prodItems.map((p) => p.fp)).size} distintos`)
  const porFuente: Record<string, number> = {}
  for (const { p } of prodItems) porFuente[p.source] = (porFuente[p.source] ?? 0) + 1
  for (const [k, n] of Object.entries(porFuente).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  nombre desde ${k}`)
  }

  if (!dryRun) {
    const f = await funnel().catch(() => null)
    if (f) console.log(`\nAcumulado en base: ${f.accepted}/${f.total} aceptados`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
