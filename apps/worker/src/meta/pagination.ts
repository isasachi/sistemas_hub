// Paginación de la búsqueda (spec §16), sin scroll.
//
// Replaya `AdLibrarySearchPaginationQuery` con el token cosechado en
// browser/session.ts y el cursor de la página anterior. Es un fetch same-origin,
// así que cuesta lo mismo que leer el HTML (~2s) en vez de los ~15s de una
// navegación con scroll.
//
// ⚠️ Devuelve null ante CUALQUIER duda (HTTP no-200, JSON ilegible, forma
// inesperada). null es INCONCLUSO, nunca "se acabaron los resultados": un fetch
// bloqueado se ve igual que una última página, y confundirlos haría que un
// bloqueo se reporte como cobertura completa.
import type { Page } from 'playwright'
import type { SsrAd } from '../../lib/product-hunter/ssr-fetch'
import type { PaginationToken } from '../browser/session'
import { MAP_ADS_JS } from './extract'

export interface PageResult {
  ads: SsrAd[]
  nextCursor: string | null
  hasNext: boolean
}

/**
 * Arma el body del replay: el token tal cual vino, con `variables` pisado para
 * ESTA búsqueda. Se sobrescriben queryString/countries/cursor porque el token
 * se cosechó con otra keyword y otro país — reusarlos sin pisar devolvería los
 * resultados de la búsqueda de apertura.
 */
export function buildPaginationBody(
  token: PaginationToken,
  query: string,
  country: string,
  cursor: string,
): string {
  let vars: Record<string, unknown> = {}
  try {
    vars = JSON.parse(token.form.variables ?? '{}') as Record<string, unknown>
  } catch {
    vars = {}
  }
  vars.queryString = query
  vars.countries = [country]
  vars.cursor = cursor
  vars.viewAllPageID = '0'
  vars.searchType = 'keyword_unordered'
  // `first` lo ignora el servidor (medido: 10 y 30 devuelven lo mismo). Se deja
  // en lo que mandó el browser para no diferenciarse de una request real.
  return new URLSearchParams({ ...token.form, variables: JSON.stringify(vars) }).toString()
}

export async function fetchNextPage(
  page: Page,
  token: PaginationToken,
  query: string,
  country: string,
  cursor: string,
): Promise<PageResult | null> {
  const body = buildPaginationBody(token, query, country, cursor)
  const js = `(async () => {
    var r = await fetch('https://www.facebook.com/api/graphql/', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: ${JSON.stringify(body)}
    })
    if (!r.ok) return null
    var t = await r.text()
    // Facebook prefija con "for(;;);" y puede mandar varios JSON por línea.
    var clean = t.replace(/^for\\s*\\(\\s*;;\\s*\\)\\s*;/, '').trim().split('\\n')[0]
    var j = null
    try { j = JSON.parse(clean) } catch (e) { return null }
    var main = j && j.data && j.data.ad_library_main
    var conn = main && main.search_results_connection
    if (!conn || !Array.isArray(conn.edges)) return null
    var info = conn.page_info || {}
    return {
      ads: (${MAP_ADS_JS})(conn),
      nextCursor: info.end_cursor || null,
      hasNext: !!info.has_next_page
    }
  })()`
  const out = await page.evaluate(js).catch(() => null)
  return (out as PageResult | null) ?? null
}
