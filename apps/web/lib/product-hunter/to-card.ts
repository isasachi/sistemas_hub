import type { ProductRow, ProductCard } from '@ph/shared'

// ⚠️ REGLAS DE ORO — capa de serving (defensa en profundidad). Única definición:
// antes estaba duplicada en search/route.ts y quota.ts y YA habían divergido
// (la copia de quota omitía el filtro offTopic). Un solo lugar testeado evita que
// una frontera se rompa en silencio. Las tres reglas: ≥40 ads · ≥10 días activos
// (desconocido = fuera) · no pautado en Perú. Más: sin analizar y offTopic no se muestran.
export function toCard(row: ProductRow): ProductCard | null {
  if (!row.analysis || row.score == null) return null // aún sin analizar → no se muestra
  const a = row.analysis
  if (a.offTopic) return null // fuera del nicho buscado → no se muestra ni como relleno
  const r = row.raw_data
  if (r.found_country === 'PE') return null
  if (r.ad_count < 40) return null
  if (r.days_running === null || r.days_running < 10) return null
  const pageParams = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: 'ALL',
    is_targeted_country: 'false', media_type: 'all', search_type: 'page',
    'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
    view_all_page_id: r.page_id,
  })
  return {
    id: row.id,
    advertiserName: row.name ?? r.advertiser_name,
    productName: a.productName,
    whatIs: a.whatItIs,
    problemSolved: a.problemSolved,
    adCount: r.ad_count,
    daysRunning: r.days_running,
    foundCountry: r.found_country,
    attributes: a.attributes,
    peScenario: a.peScenario,
    peCompetitors: a.peCompetitors,
    priority: a.priority,
    score: row.score,
    adUrl: `https://www.facebook.com/ads/library/?id=${r.ad_id}`,
    pageUrl: `https://www.facebook.com/ads/library/?${pageParams}`,
  }
}
