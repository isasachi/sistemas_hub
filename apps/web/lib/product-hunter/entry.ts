import type { RawProductRow, RawProductEntry } from '@ph/shared'

// Fila de ph_raw_products → lo que ve el front. Lo comparten `search` y
// `top-picks` para que una card sea idéntica en los dos lados.
export function toEntry(r: RawProductRow): RawProductEntry {
  return {
    id: `${r.niche}:${r.page_id}`,
    advertiser: r.name ?? 'Anunciante',
    productName: r.product_name ?? null,
    title: r.raw_data?.title ?? null,
    body: r.raw_data?.body ?? null,
    country: r.country,
    adCount: r.ad_count,
    adsUrl: `https://www.facebook.com/ads/library/?${new URLSearchParams({
      active_status: 'active', ad_type: 'all', country: 'ALL',
      is_targeted_country: 'false', media_type: 'all', search_type: 'page',
      'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
      view_all_page_id: r.page_id,
    })}`,
  }
}
