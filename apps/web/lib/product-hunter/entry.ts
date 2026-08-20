import type { RawProductRow, RawProductEntry } from '@ph/shared'

// Los anuncios dinámicos de catálogo de Meta llegan con los placeholders sin
// resolver ("{{product.name}}", "{{product.brand}}"): sin esto la card muestra
// la plantilla como si fuera el nombre del producto. Si al sacarlos no queda
// texto real, devuelve null y la card cae al siguiente campo.
export function stripAdVars(t?: string | null): string | null {
  const s = (t ?? '')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—·:,|]+/, '')
    .trim()
  return s.length >= 3 ? s : null
}

// Fila de ph_raw_products → lo que ve el front.
export function toEntry(r: RawProductRow): RawProductEntry {
  return {
    id: `${r.niche}:${r.page_id}`,
    advertiser: r.name ?? 'Anunciante',
    productName: stripAdVars(r.product_name),
    title: stripAdVars(r.raw_data?.title),
    body: stripAdVars(r.raw_data?.body),
    country: r.country,
    adCount: r.ad_count,
    adsUrl: `https://www.facebook.com/ads/library/?${new URLSearchParams({
      active_status: 'active', ad_type: 'all', country: 'ALL',
      is_targeted_country: 'false', media_type: 'all', search_type: 'page',
      'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
      view_all_page_id: r.page_id,
    })}`,
    // Solo scan-nicho.ts aprueba con evidencia (share medido + cita textual
    // respaldada). Las filas 'pendiente' del inventario viejo se siguen
    // sirviendo, pero sin sello.
    verificado: r.status === 'monoproducto',
    share: typeof r.share === 'number' ? r.share : null,
    senal: r.senal_nicho ?? null,
  }
}
