import type { DiscoveryRow, RawProductEntry } from '@ph/shared'
import { stripAdVars } from './entry'

// Fila de `disc_ranked` → lo que ve el front.
//
// ⚠️ NO se pasa por `toEntry`. Ese adaptador es la defensa en profundidad de las
// reglas de oro del motor VIEJO (≥40 anuncios, ≥10 días); el motor nuevo demota
// el rango a etiqueta descriptiva a propósito (CONTEXT §2, regla 2), así que
// reusarlo tiraría filas que este diseño quiere conservar.
export function toDiscoveryEntry(r: DiscoveryRow): RawProductEntry {
  return {
    id: r.dedupe_key,
    advertiser: r.advertiser ?? 'Anunciante',
    productName: stripAdVars(r.product_name),
    title: stripAdVars(r.headline),
    body: stripAdVars(r.body),
    // Se descubre en varios países; la card muestra uno solo, así que van
    // separados por coma en vez de perder los demás.
    country: r.countries?.length ? r.countries.join(', ') : null,
    // El número que la card llama "anuncios" es el del ANUNCIANTE, igual que en
    // el motor viejo — es lo que define el rango.
    adCount: r.advertiser_ads ?? r.product_ads ?? 0,
    adsUrl: `https://www.facebook.com/ads/library/?${new URLSearchParams({
      active_status: 'active', ad_type: 'all', country: 'ALL',
      is_targeted_country: 'false', media_type: 'all', search_type: 'page',
      'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
      view_all_page_id: r.page_id,
    })}`,
    // Toda fila de `disc_ranked` pasó el embudo entero (landing leída, producto
    // resuelto, catálogo del anunciante contado): el share es medido, no
    // estimado. Por eso el sello va siempre.
    verificado: true,
    share: typeof r.product_share === 'number' ? r.product_share : null,
    // `senal` es del verificador viejo (dónde apareció el término del nicho).
    // Este pipeline no lo produce: null en vez de inventar una confianza.
    senal: null,
    diasCorriendo: r.days_active ?? null,
  }
}
