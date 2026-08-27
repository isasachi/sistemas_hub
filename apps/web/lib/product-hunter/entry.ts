import { diasCorriendo, type RawProductRow, type RawClusterRow, type RawProductEntry } from '@ph/shared'

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

const esCluster = (r: RawProductRow | RawClusterRow): r is RawClusterRow =>
  'cluster_key' in r

/**
 * Nombre del producto cuando el título no sirve.
 *
 * ⚠️ El 42% de los clusters NO trae texto de producto en el título — plantillas
 * sin renderizar, el canvas de Facebook, "+5.500 VENDIDOS" — y encima el título
 * suele ser el reclamo del anunciante: medido, "paga al recibir" es el título
 * de 10 productos distintos de la misma página. El slug de la landing SÍ
 * identifica el artículo: es la misma señal con la que `productKey` agrupa.
 */
function nombreDeCluster(r: RawClusterRow): string | null {
  try {
    const p = decodeURIComponent(new URL(r.url ?? '').pathname)
    const s = p.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ').trim()
    return s && s.length >= 3 ? s : null
  } catch {
    return null
  }
}

function adsUrl(pageId: string): string {
  return `https://www.facebook.com/ads/library/?${new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: 'ALL',
    is_targeted_country: 'false', media_type: 'all', search_type: 'page',
    'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
    view_all_page_id: pageId,
  })}`
}

/**
 * Fila → lo que ve el front. Acepta las DOS formas mientras dure la migración:
 * la del ANUNCIANTE (`ph_raw_products`) y la del PRODUCTO (`ph_raw_clusters`).
 * Cuál llega lo decide `TABLA_SERVING` en @ph/shared, no esta función.
 */
export function toEntry(r: RawProductRow | RawClusterRow): RawProductEntry {
  if (esCluster(r)) {
    return {
      // El cluster_key va en el id: sin él dos productos de la misma página
      // colisionarían y el front mostraría uno solo.
      id: `${r.niche}:${r.page_id}:${r.cluster_key}`,
      advertiser: r.name ?? 'Anunciante',
      productName: stripAdVars(r.product_name) ?? stripAdVars(r.titulo) ?? nombreDeCluster(r),
      title: stripAdVars(r.titulo),
      body: stripAdVars(r.cuerpo),
      country: r.country ?? null,
      // ⚠️ Los anuncios del PRODUCTO, no los de la página. Es el cambio entero.
      adCount: r.ad_count,
      adsUrl: adsUrl(r.page_id),
      verificado: r.status === 'monoproducto',
      // Qué parte de la pauta del anunciante es este producto — NO "qué tan
      // monoproducto es la página". Ver el comentario de `share` en types.ts.
      share: r.muestra_tot ? Number((r.muestra_n / r.muestra_tot).toFixed(2)) : null,
      porProducto: true,
      senal: r.senal_nicho ?? null,
      diasCorriendo: diasCorriendo(r.ad_start_date),
    }
  }
  return {
    id: `${r.niche}:${r.page_id}`,
    advertiser: r.name ?? 'Anunciante',
    productName: stripAdVars(r.product_name),
    title: stripAdVars(r.raw_data?.title),
    body: stripAdVars(r.raw_data?.body),
    country: r.country,
    adCount: r.ad_count,
    adsUrl: adsUrl(r.page_id),
    // Solo scan-nicho.ts aprueba con evidencia (share medido + cita textual
    // respaldada). Las filas 'pendiente' del inventario viejo se siguen
    // sirviendo, pero sin sello.
    verificado: r.status === 'monoproducto',
    share: typeof r.share === 'number' ? r.share : null,
    senal: r.senal_nicho ?? null,
    diasCorriendo: diasCorriendo(r.ad_start_date),
  }
}
