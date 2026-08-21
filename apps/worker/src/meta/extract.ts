// Extractores que corren DENTRO del browser (spec §48, meta/extract.ts).
//
// ⚠️ SON STRINGS, no funciones, y no es estilo: tsx/esbuild inyecta `__name` en
// las funciones que compila, y al pasarlas a page.evaluate el browser revienta
// con "__name is not defined". Ya está documentado en ssr-fetch.ts; acá se
// repite el patrón por el mismo motivo.
//
// Fuente ÚNICA del mapeo de anuncios: lo comparten la primera página (HTML SSR)
// y las siguientes (respuesta GraphQL). Dos copias se desincronizan y ahí el
// anuncio de la página 2 pierde campos que el de la página 1 sí tiene.

/** `conn` (search_results_connection) → array de SsrAd. */
export const MAP_ADS_JS = `function (conn) {
  var ads = []
  var edges = conn.edges || []
  for (var e = 0; e < edges.length; e++) {
    var col = (edges[e].node && edges[e].node.collated_results) || []
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
  return ads
}`

/**
 * HTML del SSR → el objeto `search_results_connection` completo, page_info
 * incluido. Escanea llaves balanceadas respetando strings y escapes: un
 * `indexOf('}')` corta en la primera llave que aparezca dentro de un texto de
 * anuncio.
 */
export const SCAN_CONN_JS = `function (html) {
  var key = '"search_results_connection":'
  var k = html.indexOf(key)
  if (k < 0) return null
  var i = html.indexOf('{', k), depth = 0, inStr = false, esc = false
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
        try { return JSON.parse(html.slice(i, j + 1)) } catch (e) { return null }
      }
    }
  }
  return null
}`
