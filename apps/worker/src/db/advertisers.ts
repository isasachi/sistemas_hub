import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AdvertiserProfile } from '../advertisers/aggregate'

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

export interface AcceptedAd {
  id: string
  page_id: string
  page_name: string | null
  headline: string | null
  primary_text: string | null
  landing_url: string | null
  landing_domain: string | null
  start_date: string | null
  ecommerce_score: number | null
}

/**
 * Los anuncios que sobrevivieron a las Fases 5-6.
 *
 * ⚠️ El deep crawl SOLO ve supervivientes, y eso es lo que lo hace pagable: una
 * clínica dental nunca cuesta una lectura de catálogo porque ya se cayó antes
 * (spec: correr las fases en orden y que la cara vea poco).
 *
 * ⚠️ Se filtra por `physical_product`/`ecommerce` y NO por `accepted`. Son el
 * veredicto de las Fases 5-6 y esta fase no los toca; `accepted` sí lo pisa el
 * ranking al rechazar por relevancia o por share. Filtrando por `accepted`, la
 * segunda corrida de este script no encontraba NADA —sus propios rechazos del
 * intento anterior— y no había forma de re-evaluar sin resetear la tabla a mano.
 * Así es idempotente: se vuelve a correr las veces que haga falta.
 */
/**
 * Ids de anuncios descubiertos por una corrida. Se pagina por el tope de 1000.
 */
export async function adIdsOfRun(runId: string): Promise<string[]> {
  const { data: qs } = await db().from('disc_search_queries').select('id').eq('run_id', runId)
  const qIds = (qs ?? []).map((q) => (q as { id: string }).id)
  const ids = new Set<string>()
  for (let i = 0; i < qIds.length; i += 100) {
    const chunk = qIds.slice(i, i + 100)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db().from('disc_ad_discoveries')
        .select('ad_id').in('query_id', chunk).range(from, from + 999)
      if (error) break
      const rows = (data ?? []) as { ad_id: string }[]
      for (const r of rows) ids.add(r.ad_id)
      if (rows.length < 1000) break
    }
  }
  return [...ids]
}

export async function acceptedAds(limit: number, onlyIds?: string[]): Promise<AcceptedAd[]> {
  // Paginado por el tope silencioso de 1000 filas de PostgREST.
  const cols = 'id,page_id,page_name,headline,primary_text,landing_url,landing_domain,start_date,ecommerce_score'
  const out: AcceptedAd[] = []
  const PAGE = 1000
  // ⚠️ Acotar a UNA corrida importa para la relevancia: el IDF y la cobertura se
  // calculan sobre el corpus que se le pasa, así que mezclar dos nichos mide los
  // anuncios de uno contra las keywords del otro y los tira a todos por
  // LOW_RELEVANCE.
  if (onlyIds) {
    for (let i = 0; i < onlyIds.length && out.length < limit; i += 200) {
      const { data, error } = await db().from('disc_ads')
        .select(cols).eq('physical_product', true).eq('ecommerce', true)
        .in('id', onlyIds.slice(i, i + 200))
      if (error) throw new Error(`acceptedAds: ${error.message}`)
      out.push(...((data ?? []) as AcceptedAd[]))
    }
    return out.slice(0, limit)
  }
  for (let from = 0; out.length < limit; from += PAGE) {
    const take = Math.min(PAGE, limit - out.length)
    const { data, error } = await db().from('disc_ads')
      .select(cols).eq('physical_product', true).eq('ecommerce', true)
      .range(from, from + take - 1)
    if (error) throw new Error(`acceptedAds: ${error.message}`)
    const rows = (data ?? []) as AcceptedAd[]
    out.push(...rows)
    if (rows.length < take) break
  }
  return out
}

/** Países en los que se descubrió cada anuncio (para `geographicSpread`). */
export async function countriesByAd(adIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  // Chunks de 200 ids y además paginado: un anuncio puede tener varios caminos,
  // así que 200 ids pueden pasar de 1000 filas.
  for (let i = 0; i < adIds.length; i += 200) {
    const chunk = adIds.slice(i, i + 200)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db().from('disc_ad_discoveries')
        .select('ad_id,country').in('ad_id', chunk).range(from, from + 999)
      if (error) break
      const rows = (data ?? []) as { ad_id: string; country: string }[]
      for (const r of rows) {
        if (!out.has(r.ad_id)) out.set(r.ad_id, new Set())
        out.get(r.ad_id)!.add(r.country)
      }
      if (rows.length < 1000) break
    }
  }
  return out
}

/**
 * Id derivado del `page_id`, no sorteado.
 *
 * ⚠️ Con `randomUUID()` cada corrida generaba un id nuevo y el upsert por
 * `page_id` intentaba PISAR la PK de la fila existente — que es justo la que
 * apunta `disc_advertiser_products`. Postgres lo rechazaba con una violación de
 * clave foránea y la segunda corrida moría entera. Derivándolo, el id de un
 * anunciante es siempre el mismo y re-correr es inofensivo.
 */
export function advertiserId(pageId: string): string {
  const h = createHash('sha256').update(`advertiser|${pageId}`).digest('hex')
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20), h.slice(20, 32)].join('-')
}

export async function saveAdvertiser(
  p: AdvertiserProfile,
  country: string,
  dominantProductId: string | null,
): Promise<string> {
  const row = {
    id: advertiserId(p.pageId),
    page_id: p.pageId,
    page_name: p.pageName,
    country,
    active_ads_count: p.activeAds,
    bucket: p.bucket,
    sample_size: p.distribution.sample,
    dominant_product_id: dominantProductId,
    product_share: p.distribution.share,
    monoproduct: p.distribution.monoproduct,
    distinct_products: p.distribution.distinct,
    scraped_at: new Date().toISOString(),
  }
  const { error } = await db().from('disc_advertisers').upsert(row, { onConflict: 'page_id' })
  if (error) throw new Error(`disc_advertisers: ${error.message}`)
  return row.id
}

export async function saveAdvertiserProducts(
  advertiserId: string,
  rows: { product_id: string; ad_count: number; share: number }[],
): Promise<void> {
  if (!rows.length) return
  const { error } = await db().from('disc_advertiser_products')
    .upsert(rows.map((r) => ({ advertiser_id: advertiserId, ...r })), {
      onConflict: 'advertiser_id,product_id', ignoreDuplicates: false,
    })
  if (error) throw new Error(`disc_advertiser_products: ${error.message}`)
}

export interface ResolvedProduct {
  productId: string
  name: string | null
  confidence: number
}

/** Producto que resolvió la Fase 6, por anuncio, CON su confianza real. */
export async function productNameForAd(adIds: string[]): Promise<Map<string, ResolvedProduct>> {
  const out = new Map<string, ResolvedProduct>()
  for (let i = 0; i < adIds.length; i += 200) {
    const { data } = await db().from('disc_ad_products')
      .select('ad_id, confidence, product_id, disc_products(canonical_name)')
      .in('ad_id', adIds.slice(i, i + 200))
    // El embed de PostgREST tipa la relación como array aunque acá sea 1-a-1.
    for (const r of (data ?? []) as unknown as {
      ad_id: string
      confidence: number | string | null
      product_id: string
      disc_products: { canonical_name: string | null } | { canonical_name: string | null }[] | null
    }[]) {
      const rel = Array.isArray(r.disc_products) ? r.disc_products[0] : r.disc_products
      out.set(r.ad_id, {
        productId: r.product_id,
        name: rel?.canonical_name ?? null,
        // numeric de Postgres vuelve como string por el driver.
        confidence: Number(r.confidence ?? 0),
      })
    }
  }
  return out
}



/**
 * ⚠️ El veredicto se escribe SIEMPRE, también cuando pasa. Antes solo se
 * marcaba el rechazo, así que un anuncio que fallaba en una corrida y pasaba en
 * la siguiente conservaba el `rejection_reason` viejo: la base mostraba
 * `relevance = 1.000` junto a `LOW_RELEVANCE` en la misma fila, y el embudo del
 * §38 contaba rechazos que ya no existían. Un estado viejo que nadie limpia es
 * peor que no guardarlo.
 */
export async function markAccepted(adIds: string[]): Promise<void> {
  for (let i = 0; i < adIds.length; i += 100) {
    const { error } = await db().from('disc_ads')
      .update({ accepted: true, rejection_reason: null })
      .in('id', adIds.slice(i, i + 100))
    if (error) throw new Error(`markAccepted: ${error.message}`)
  }
}

export async function markRejected(adIds: string[], reason: string): Promise<void> {
  for (let i = 0; i < adIds.length; i += 100) {
    const { error } = await db().from('disc_ads')
      .update({ accepted: false, rejection_reason: reason })
      .in('id', adIds.slice(i, i + 100))
    if (error) throw new Error(`markRejected: ${error.message}`)
  }
}

export async function setRelevance(rows: { id: string; relevance: number }[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 25) {
    await Promise.all(rows.slice(i, i + 25).map(async (r) => {
      await db().from('disc_ads').update({ relevance: r.relevance }).eq('id', r.id)
    }))
  }
}
