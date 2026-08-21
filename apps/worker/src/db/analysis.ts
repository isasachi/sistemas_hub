// Persistencia de las Fases 5-8.
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { LandingSignals } from '../landing/parse'
import type { ProductCandidate } from '../products/extract'

let _db: SupabaseClient | null = null
function db(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return _db
}

export interface PendingAd {
  id: string
  page_id: string
  page_name: string | null
  headline: string | null
  primary_text: string | null
  landing_url: string | null
  landing_domain: string | null
  start_date: string | null
}

/** Anuncios sin analizar. `accepted IS NULL` es el estado "todavía no se evaluó". */
export async function pendingAds(limit: number, runId?: string): Promise<PendingAd[]> {
  let q = db().from('disc_ads')
    .select('id,page_id,page_name,headline,primary_text,landing_url,landing_domain,start_date')
    .is('accepted', null)
    .limit(limit)
  if (runId) {
    const { data: qs } = await db().from('disc_search_queries').select('id').eq('run_id', runId)
    const ids = (qs ?? []).map((r) => (r as { id: string }).id)
    const { data: ds } = await db().from('disc_ad_discoveries').select('ad_id').in('query_id', ids.slice(0, 100))
    const adIds = [...new Set((ds ?? []).map((r) => (r as { ad_id: string }).ad_id))]
    if (!adIds.length) return []
    q = db().from('disc_ads')
      .select('id,page_id,page_name,headline,primary_text,landing_url,landing_domain,start_date')
      .is('accepted', null).in('id', adIds).limit(limit)
  }
  const { data, error } = await q
  if (error) throw new Error(`pendingAds: ${error.message}`)
  return (data ?? []) as PendingAd[]
}

// ── Caché de landings (spec §35-36) ──────────────────────────────────────────
// TTL en horas. Una landing no cambia de "es una tienda" a "es una clínica" de
// un día para el otro, así que 24h es holgado y ahorra casi todos los fetches
// entre corridas.
const TTL_HOURS = Math.max(1, Number(process.env.DISC_LANDING_TTL_HOURS ?? 24))

export interface CachedLanding {
  url: string
  status_code: number | null
  signals: LandingSignals | null
  error: string | null
}

export async function getCachedLandings(urls: string[]): Promise<Map<string, CachedLanding>> {
  const out = new Map<string, CachedLanding>()
  if (!urls.length) return out
  const cutoff = new Date(Date.now() - TTL_HOURS * 3600_000).toISOString()
  for (let i = 0; i < urls.length; i += 200) {
    const { data } = await db().from('disc_landing_pages')
      .select('url,status_code,signals,error')
      .in('url', urls.slice(i, i + 200))
      .gte('fetched_at', cutoff)
    for (const r of (data ?? []) as CachedLanding[]) out.set(r.url, r)
  }
  return out
}

export async function saveLanding(row: {
  url: string; status_code: number | null; content_type: string | null
  signals: LandingSignals | null; error: string | null
}): Promise<void> {
  const { error } = await db().from('disc_landing_pages').upsert({
    ...row,
    signals: row.signals as unknown as Record<string, unknown> | null,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'url' })
  if (error) throw new Error(`disc_landing_pages: ${error.message}`)
}

// ── Productos ────────────────────────────────────────────────────────────────
/**
 * Upsert por `fingerprint` y devuelve el id. Se lee de vuelta por el mismo
 * motivo que en disc_ads: con DO NOTHING el uuid que generamos acá no llega a la
 * base si la fila ya existía.
 */
export async function upsertProducts(
  items: { fp: string; p: ProductCandidate }[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  if (!items.length) return ids

  const byFp = new Map<string, ProductCandidate>()
  for (const { fp, p } of items) if (!byFp.has(fp)) byFp.set(fp, p)

  const rows = [...byFp.entries()].map(([fp, p]) => ({
    id: randomUUID(), fingerprint: fp,
    canonical_name: p.canonicalName, normalized_name: p.normalizedName,
    product_type: p.productType, brand: p.brand, sku: p.sku,
    price: p.price, currency: p.currency,
    canonical_url: p.canonicalUrl, domain: p.domain,
  }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db().from('disc_products')
      .upsert(rows.slice(i, i + 200), { onConflict: 'fingerprint', ignoreDuplicates: true })
    if (error) throw new Error(`disc_products: ${error.message}`)
  }

  const fps = [...byFp.keys()]
  for (let i = 0; i < fps.length; i += 200) {
    const { data } = await db().from('disc_products')
      .select('id,fingerprint').in('fingerprint', fps.slice(i, i + 200))
    for (const r of (data ?? []) as { id: string; fingerprint: string }[]) ids.set(r.fingerprint, r.id)
  }
  return ids
}

export async function linkAdProducts(
  links: { ad_id: string; product_id: string; match_method: string; confidence: number }[],
): Promise<void> {
  for (let i = 0; i < links.length; i += 200) {
    const { error } = await db().from('disc_ad_products')
      .upsert(links.slice(i, i + 200), { onConflict: 'ad_id,product_id', ignoreDuplicates: true })
    if (error) throw new Error(`disc_ad_products: ${error.message}`)
  }
}

// ── Veredicto por anuncio ────────────────────────────────────────────────────
export interface AdVerdict {
  id: string
  accepted: boolean
  rejection_reason: string | null
  physical_product: boolean
  ecommerce: boolean
  ecommerce_score: number
}

/**
 * ⚠️ Escribe TAMBIÉN los rechazados (spec §38). Guardar solo los aceptados haría
 * imposible responder "de 1000, cuántos se cayeron y por qué", que es lo que
 * permite corregir las reglas sin volver a scrapear.
 */
export async function saveVerdicts(verdicts: AdVerdict[]): Promise<void> {
  const now = new Date().toISOString()
  // Sin RPC ni bulk update: PostgREST no hace UPDATE multi-fila con valores
  // distintos por fila. En tandas de 25 en paralelo para que no sea serial.
  for (let i = 0; i < verdicts.length; i += 25) {
    await Promise.all(verdicts.slice(i, i + 25).map(async (v) => {
      const { error } = await db().from('disc_ads').update({
        accepted: v.accepted,
        rejection_reason: v.rejection_reason,
        physical_product: v.physical_product,
        ecommerce: v.ecommerce,
        ecommerce_score: v.ecommerce_score,
        analyzed_at: now,
      }).eq('id', v.id)
      if (error) throw new Error(`disc_ads verdict: ${error.message}`)
    }))
  }
}

/** El embudo del §38: cuántos se cayeron y por qué. */
export async function funnel(): Promise<{ total: number; accepted: number; byReason: Record<string, number> }> {
  const { count: total } = await db().from('disc_ads').select('*', { count: 'exact', head: true })
  const { count: accepted } = await db().from('disc_ads')
    .select('*', { count: 'exact', head: true }).eq('accepted', true)
  const byReason: Record<string, number> = {}
  const { data } = await db().from('disc_ads')
    .select('rejection_reason').eq('accepted', false).limit(5000)
  for (const r of (data ?? []) as { rejection_reason: string | null }[]) {
    const k = r.rejection_reason ?? 'sin motivo'
    byReason[k] = (byReason[k] ?? 0) + 1
  }
  return { total: total ?? 0, accepted: accepted ?? 0, byReason }
}
