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
 * Abre la sesión de TODAS las pages y devuelve las que quedaron vivas.
 *
 * ⚠️ ABRIR N SESIONES ES LA RÁFAGA MÁS AGRESIVA DE TODA LA CORRIDA, y con
 * `Promise.all` una sola que se pase de los 60 s mata el run entero. Medido el
 * 2026-08-28 a conc 6 con proxy: `page.goto: Timeout 60000ms exceeded` en
 * `openSsrSession` y **0 filas procesadas en 3,8 min**, con la cola intacta.
 * A más concurrencia, más probable — que es justo lo contrario de lo que se
 * busca al subirla.
 *
 * Con una sola sesión viva el barrido avanza igual, más lento. Sin ninguna, ahí
 * sí no hay nada que hacer y se lanza.
 */
export async function abrirSesiones(pages: Page[], country = 'MX'): Promise<Page[]> {
  const vivas: Page[] = []
  for (const p of pages) {
    try {
      await openSsrSession(p, country)
      vivas.push(p)
    } catch (e) {
      console.log(`  ⚠ sesión descartada: ${(e as Error).message.split('\n')[0].slice(0, 80)}`)
    }
  }
  if (!vivas.length) throw new Error('ninguna sesión pudo abrirse — la IP o el proxy están bloqueados')
  if (vivas.length < pages.length) console.log(`  sesiones vivas: ${vivas.length}/${pages.length}`)
  return vivas
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
  // ── Camino rápido: fetch same-origin (2,3 s contra ~15 s de navegar) ──
  //
  // ⚠️ EL BODY SE PARSEA AUNQUE EL STATUS NO SEA OK. Medido el 2026-08-28 desde
  // una IP que Meta estaba limitando: la respuesta viene con **HTTP 403 y el
  // contenido completo adentro** (`count: 50`, 30 anuncios). El `if (!r.ok)
  // return null` que había acá tiraba esa lectura buena y la reportaba como
  // inconclusa — o sea el pipeline se auto-bloqueaba con datos en la mano.
  const js = `(async () => {
    try {
      var r = await fetch(${JSON.stringify(url)}, { credentials: 'include' })
      var html = await r.text()
      return (${EXTRACTOR_JS})(html)
    } catch (e) { return null }
  })()`
  const rapido = (await page.evaluate(js).catch(() => null)) as SsrResult | null
  if (rapido) return rapido

  // ── Fallback: leer NAVEGANDO ──
  //
  // ⚠️ NO ES REDUNDANTE CON EL DE ARRIBA: son dos barreras distintas. Medido en
  // la misma sesión y repetido dos veces, el fetch same-origin moría con
  // `TypeError: Failed to fetch` (falla de RED, no de status) mientras la
  // navegación al MISMO url devolvía los 30 anuncios. Sin esto, el barrido se
  // detiene entero por bloqueo persistente teniendo el contenido disponible.
  //
  // Cuesta ~5 s en vez de 2,3 s, así que solo corre cuando el rápido falló.
  try {
    await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' })
    // Meta reescribe la URL del lado del cliente y esa navegación destruye el
    // contexto de ejecución: sin la espera el evaluate falla. Mismo motivo que
    // documenta `openSsrSession`.
    await page.waitForTimeout(2_500)
    const out = await page.evaluate(`(${EXTRACTOR_JS})(document.documentElement.outerHTML)`)
    return (out as SsrResult | null) ?? null
  } catch {
    return null
  }
}

/**
 * Página del anunciante. SIN `sort_data` siempre: ordenar por impresiones
 * muestra primero los anuncios más gastados, donde el producto estrella está
 * sobrerrepresentado, y eso sesga la proporción hasta 40 puntos (medido en
 * verify-product.ts).
 *
 * ⚠️ EL PAÍS CAMBIA LO QUE SE MIDE, y hay que elegirlo según la pregunta:
 * - `ALL` (default) → todos los mercados. Es lo correcto para el SHARE, que
 *   necesita muestra.
 * - un país → solo ese mercado. Es lo correcto para el RANGO, que es la promesa
 *   que lee el usuario ("100 a más anuncios del anunciante").
 *
 * Confundirlos infla el rango con volumen mundial: medido, InvigorFate tiene
 * 685 anuncios en el mundo y **47 en México**, así que con `ALL` figuraba en
 * "100+" cuando en el mercado donde se lo encontró es un "0-50".
 */
export function advertiserUrl(pageId: string, country = 'ALL'): string {
  const p = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country,
    is_targeted_country: 'false', media_type: 'all', search_type: 'page',
    view_all_page_id: pageId,
  })
  return `https://www.facebook.com/ads/library/?${p}`
}
