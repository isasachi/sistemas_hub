// Lectura de la Ad Library por FETCH same-origin, no por navegación.
//
// Meta imprime los resultados en el HTML del servidor (`search_results_connection`),
// así que basta pedir la URL y leer el JSON: no hacen falta los 8s de espera ni
// los 3 scrolls de `navigateAndCapture`, que existen para juntar creativos.
// Medido en este repo: 2,3s una búsqueda y 1,9s la página de un anunciante,
// contra ~15s por navegación.
//
// ⚠️ EL FETCH TIENE QUE CORRER DENTRO DE UNA PÁGINA ABIERTA. Un fetch plano
// desde Node recibe 403 (ya está documentado en ad-count.ts): lo que lo hace
// pasar son las cookies y headers que el browser ya tiene. Por eso se navega UNA
// vez con `openSsrSession` y después todas las lecturas son fetches internos.
import type { Page } from 'playwright'
import { searchUrl } from './scraper'

// ⚠️ Fuente ÚNICA del extractor, como texto a propósito. Dos razones:
// 1. tsx/esbuild inyecta `__name` en las funciones que compila y el browser
//    revienta con "__name is not defined" al pasarlas a page.evaluate.
// 2. Así el test corre exactamente este código, sin una copia paralela que se
//    desincronice.
export const EXTRACTOR_JS = `function (html) {
  var key = '"search_results_connection":'
  var k = html.indexOf(key)
  if (k < 0) return null
  var i = html.indexOf('{', k), depth = 0, inStr = false, esc = false, conn = null
  for (var j = i; j < html.length; j++) {
    var c = html[j]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try { conn = JSON.parse(html.slice(i, j + 1)) } catch (e) { return null }
        break
      }
    }
  }
  if (!conn || !Array.isArray(conn.edges)) return null
  var ads = []
  for (var e = 0; e < conn.edges.length; e++) {
    var col = (conn.edges[e].node && conn.edges[e].node.collated_results) || []
    for (var r = 0; r < col.length; r++) {
      var a = col[r], s = a.snapshot || {}
      if (!a.page_id) continue
      ads.push({
        ad_archive_id: a.ad_archive_id, collation_count: a.collation_count,
        page_id: a.page_id, page_name: s.page_name || a.page_name || null,
        start_date: a.start_date || null, end_date: a.end_date || null,
        title: s.title || null,
        body: (s.body && (s.body.text || s.body)) || null,
        link_url: s.link_url || null, caption: s.caption || null,
        cta_text: s.cta_text || null,
        page_categories: s.page_categories || null,
        page_like_count: typeof s.page_like_count === 'number' ? s.page_like_count : null,
        page_profile_uri: s.page_profile_uri || null
      })
    }
  }
  return { count: typeof conn.count === 'number' ? conn.count : null, ads: ads }
}`

export interface SsrAd {
  ad_archive_id: string | null
  collation_count: number | null
  page_id: string
  page_name: string | null
  start_date: number | null
  end_date: number | null
  title: string | null
  body: string | null
  link_url: string | null
  caption: string | null
  cta_text: string | null
  page_categories: string[] | null
  page_like_count: number | null
  page_profile_uri: string | null
}

export interface SsrResult {
  count: number | null
  ads: SsrAd[]
}

/**
 * Deja la página en condiciones de hacer fetches same-origin. Se llama UNA vez
 * por page; después todas las lecturas son `readConnection`.
 */
export async function openSsrSession(page: Page, country = 'MX'): Promise<void> {
  await page.goto(searchUrl('skincare', country), { timeout: 60_000, waitUntil: 'domcontentloaded' })
  // Meta reescribe la URL del lado del cliente (le agrega sort_data) y esa
  // navegación destruye el contexto de ejecución: sin esta espera el primer
  // evaluate falla con "Execution context was destroyed".
  await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(2_500)
}

/**
 * Lee una URL de la Ad Library. Devuelve null cuando NO se pudo leer.
 *
 * ⚠️ null es INCONCLUSO, nunca "este anunciante no tiene anuncios". Un fetch
 * bloqueado se ve idéntico a un anunciante chico, y confundirlos fabricaría a la
 * vez un rango bajo y un monoproducto perfecto. Quien llama debe reintentar o
 * dejar la fila pendiente, jamás asumir cero.
 */
export async function readConnection(page: Page, url: string): Promise<SsrResult | null> {
  const js = `(async () => {
    var r = await fetch(${JSON.stringify(url)}, { credentials: 'include' })
    if (!r.ok) return null
    var html = await r.text()
    return (${EXTRACTOR_JS})(html)
  })()`
  const out = await page.evaluate(js).catch(() => null)
  return (out as SsrResult | null) ?? null
}

/**
 * Página del anunciante: `country=ALL` y SIN `sort_data`.
 *
 * Las dos cosas son deliberadas y vienen medidas de verify-product.ts: ordenar
 * por impresiones muestra primero los anuncios más gastados, donde el producto
 * estrella está sobrerrepresentado, y eso sesga la proporción hasta 40 puntos.
 */
export function advertiserUrl(pageId: string): string {
  const p = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: 'ALL',
    is_targeted_country: 'false', media_type: 'all', search_type: 'page',
    view_all_page_id: pageId,
  })
  return `https://www.facebook.com/ads/library/?${p}`
}
