import { createHash } from 'node:crypto'
import { db } from './client'
import type { AdvertiserProfile } from '../advertisers/aggregate'
import type { CrawlTier } from '../scheduler/tiers'


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
 * Perfiles YA medidos, para no volver a navegar lo que se midió ayer.
 *
 * ⚠️ Es lo que hace re-rankeable una corrida sin pagar el deep crawl otra vez.
 * Leer el catálogo de un anunciante son dos navegaciones a Meta, y volver a
 * hacerlas por datos que están en `disc_advertisers` es la forma más cara de
 * conseguir el mismo número — además de calentar la IP (medido: 11 anunciantes
 * bastaron para disparar el soft-block).
 *
 * `maxDias` es la ventana de frescura: por encima de eso el catálogo pudo
 * cambiar y se vuelve a leer. Devuelve un `AdvertiserProfile` reconstruido, con
 * `ads`/`top` vacíos — el ranking no los usa — y el `dominantProductId` que la
 * corrida anterior ya resolvió (re-emparejarlo por nombre podría dar otro).
 */
export interface StoredProfile {
  profile: AdvertiserProfile
  dominantProductId: string | null
}

export async function storedProfiles(
  pageIds: string[],
  maxDias: number,
): Promise<Map<string, StoredProfile>> {
  const out = new Map<string, StoredProfile>()
  if (!pageIds.length || maxDias <= 0) return out
  const corte = new Date(Date.now() - maxDias * 86_400_000).toISOString()
  for (let i = 0; i < pageIds.length; i += 200) {
    // ⚠️ El embed va con la FK EXPLÍCITA. `disc_products` cuelga de
    // `disc_advertisers` por dos caminos (el dominante y la tabla puente), así
    // que sin nombrar cuál PostgREST devuelve PGRST201 y `data` viene null.
    // Y el error se LANZA: tragárselo devolvía "0 perfiles guardados", que se
    // lee igual que "no hay caché" — y el costo de esa confusión es volver a
    // navegar Meta hasta el soft-block. Medido, en esta misma sesión.
    const { data, error } = await db().from('disc_advertisers')
      .select('id, page_id, page_name, active_ads_count, bucket, sample_size, distinct_products, ' +
        'product_share, monoproduct, dominant_product_id, ' +
        'disc_products!disc_advertisers_dominant_product_id_fkey(canonical_name)')
      .gte('scraped_at', corte)
      // Defensa en profundidad contra el mismo fallo: una fila con muestra 0 no
      // es un perfil, es una lectura bloqueada que alguien guardó. Reusarla
      // serviría `share 0%` para siempre sin volver a mirar.
      .gt('sample_size', 0)
      .in('page_id', pageIds.slice(i, i + 200))
    if (error) throw new Error(`storedProfiles: ${error.message}`)
    for (const r of (data ?? []) as unknown as {
      id: string
      page_id: string
      page_name: string | null
      active_ads_count: number | null
      bucket: string | null
      sample_size: number | null
      distinct_products: number | null
      product_share: number | string | null
      monoproduct: boolean | null
      dominant_product_id: string | null
      disc_products: { canonical_name: string | null } | { canonical_name: string | null }[] | null
    }[]) {
      const rel = Array.isArray(r.disc_products) ? r.disc_products[0] : r.disc_products
      const share = Number(r.product_share ?? 0)
      const sample = r.sample_size ?? 0
      out.set(r.page_id, {
        dominantProductId: r.dominant_product_id,
        profile: {
          pageId: r.page_id,
          pageName: r.page_name,
          activeAds: r.active_ads_count,
          bucket: (r.bucket as AdvertiserProfile['bucket']) ?? null,
          distribution: {
            sample,
            distinct: r.distinct_products ?? 0,
            // `count` se reconstruye del share y la muestra: es la cuenta con la
            // que se calculó, no una estimación nueva.
            dominant: rel?.canonical_name
              ? { name: rel.canonical_name, count: Math.round(share * sample), key: '' }
              : null,
            share,
            monoproduct: r.monoproduct ?? false,
            strong: false,
            top: [],
          },
          ads: [],
        },
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

/**
 * Estado de recrawl de un anunciante, para decidir su siguiente tier.
 *
 * `adCount` es el que tenía la última vez: `nextTier` lo compara contra el de
 * ahora y de esa diferencia sale todo (crece → hot/warm, quieto → baja, pierde
 * → cold).
 */
export interface EstadoRecrawl {
  tier: CrawlTier
  adCount: number | null
  consecutiveMisses: number
  dominantProductId: string | null
}

export async function estadoRecrawl(pageId: string): Promise<EstadoRecrawl | null> {
  const { data, error } = await db().from('disc_advertisers')
    .select('crawl_tier,active_ads_count,consecutive_misses,dominant_product_id')
    .eq('page_id', pageId).maybeSingle()
  if (error) throw new Error(`estadoRecrawl: ${error.message}`)
  if (!data) return null
  const r = data as {
    crawl_tier: string | null
    active_ads_count: number | null
    consecutive_misses: number | null
    dominant_product_id: string | null
  }
  return {
    tier: (r.crawl_tier as CrawlTier) ?? 'warm',
    adCount: r.active_ads_count,
    consecutiveMisses: r.consecutive_misses ?? 0,
    dominantProductId: r.dominant_product_id,
  }
}

/**
 * Cierra una auditoría: tier nuevo, fallos consecutivos y la fecha.
 *
 * ⚠️ `last_audited_at` SOLO se escribe acá, o sea solo cuando la lectura
 * concluyó. Estamparlo en una lectura bloqueada haría que el anunciante no
 * volviera a vencer hasta el próximo intervalo, con el dato viejo dado por
 * bueno.
 */
export async function guardarAuditoria(
  pageId: string,
  t: { tier: CrawlTier; consecutiveMisses: number },
): Promise<void> {
  const { error } = await db().from('disc_advertisers').update({
    crawl_tier: t.tier,
    consecutive_misses: t.consecutiveMisses,
    last_audited_at: new Date().toISOString(),
    // Una auditoría que cierra bien borra la racha de inconclusos: el problema
    // era de la IP, no del anunciante, y ya se resolvió.
    inconclusive_streak: 0,
    last_inconclusive_at: null,
  }).eq('page_id', pageId)
  if (error) throw new Error(`guardarAuditoria: ${error.message}`)
}

/**
 * Registra que NO se pudo leer el catálogo de este anunciante.
 *
 * ⚠️ NO ES UNA AUDITORÍA Y NO DEBE PARECERLO: no toca `crawl_tier`,
 * `active_ads_count` ni `last_audited_at`. Escribir "auditado hoy, 0 anuncios"
 * sobre un bloqueo manda a cuarentena a un anunciante sano — el fallo que dejó
 * 19 perfiles en ceros. Lo único que se anota es que la lectura falló.
 *
 * Existe porque sin esto el anunciante quedaba permanentemente vencido para
 * `disc_enqueue_recrawls` y volvía a la cola cada ventana, encima AL FRENTE por
 * el `NULLS FIRST`. La racha alimenta el backoff exponencial de esa función:
 * dejamos de preguntar tan seguido, sin concluir nada sobre él.
 */
export async function marcarInconcluso(pageId: string): Promise<number> {
  const { data, error } = await db().from('disc_advertisers')
    .select('inconclusive_streak').eq('page_id', pageId).maybeSingle()
  if (error) throw new Error(`marcarInconcluso: ${error.message}`)
  const racha = ((data as { inconclusive_streak: number | null } | null)?.inconclusive_streak ?? 0) + 1

  const { error: e2 } = await db().from('disc_advertisers').update({
    inconclusive_streak: racha,
    last_inconclusive_at: new Date().toISOString(),
  }).eq('page_id', pageId)
  if (e2) throw new Error(`marcarInconcluso: ${e2.message}`)
  return racha
}
