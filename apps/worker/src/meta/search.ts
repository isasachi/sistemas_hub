// El collector (spec §14). Tiene UNA responsabilidad: (query, país) → anuncios
// crudos. No pregunta si es físico, ni si es ecommerce, ni si es relevante, ni
// si es monoproducto. Todo eso son fases posteriores y meterlas acá es lo que
// vuelve imposible re-correr los filtros sin volver a pagarle a Meta.
//
// La primera página sale del HTML SSR (~2s) y las siguientes del replay de la
// query de paginación (spec §16, separado en pagination.ts).
import type { Page } from 'playwright'
import type { SsrAd } from '../../lib/product-hunter/ssr-fetch'
import { searchUrl, noteNavResult } from '../../lib/product-hunter/scraper'
import { SCAN_CONN_JS, MAP_ADS_JS } from './extract'
import { dedupeKey } from '../normalization/ad'
import { normalizeUrl } from '../normalization/url'
import { fetchNextPage } from './pagination'
import type { PaginationToken } from '../browser/session'

// Tope de páginas por búsqueda (spec §33: "no descargues todo infinitamente").
// 1 = solo la SSR. Cada página extra es un fetch, y con ~10 anuncios por página
// llegar al fondo de una búsqueda de 449 serían ~45 requests contra la misma IP.
export const MAX_PAGES_PER_SEARCH = Math.max(1, Number(process.env.DISC_MAX_PAGES ?? 3))

export interface SearchPage {
  ads: SsrAd[]
  /** Total que declara Meta para la búsqueda (no lo que devolvió). */
  count: number | null
  nextCursor: string | null
  hasNext: boolean
}

/**
 * Primera página, desde el HTML del servidor. Devuelve null cuando NO se pudo
 * leer — inconcluso, nunca "no hay resultados": un fetch bloqueado se ve igual
 * que una búsqueda vacía.
 */
export async function collectFirstPage(
  page: Page,
  query: string,
  country: string,
): Promise<SearchPage | null> {
  const js = `(async () => {
    var r = await fetch(${JSON.stringify(searchUrl(query, country))}, { credentials: 'include' })
    if (!r.ok) return null
    var html = await r.text()
    var conn = (${SCAN_CONN_JS})(html)
    if (!conn || !Array.isArray(conn.edges)) return null
    var info = conn.page_info || {}
    return {
      ads: (${MAP_ADS_JS})(conn),
      count: typeof conn.count === 'number' ? conn.count : null,
      nextCursor: info.end_cursor || null,
      hasNext: !!info.has_next_page
    }
  })()`
  const out = await page.evaluate(js).catch(() => null)
  return (out as SearchPage | null) ?? null
}

export interface CollectResult {
  ads: SsrAd[]
  count: number | null
  pagesRead: number
  /** true si quedaron resultados sin leer (por el tope, no por falta de datos). */
  truncated: boolean
  /** true si alguna lectura volvió inconclusa: la cobertura NO está garantizada. */
  inconclusive: boolean
}

/**
 * Recorre la búsqueda hasta `MAX_PAGES_PER_SEARCH` (spec §16: collect → next →
 * repetir). Deduplica por `ad_archive_id` dentro de la búsqueda: Meta repite
 * anuncios entre páginas cuando el ranking se mueve mientras paginás.
 *
 * `token` null (no se cosechó) ⇒ solo la primera página. Degrada, no rompe.
 */
export async function collectSearch(
  page: Page,
  query: string,
  country: string,
  token: PaginationToken | null,
  onPage?: () => Promise<void>,
): Promise<CollectResult> {
  const first = await collectFirstPage(page, query, country)
  // El cool-down global se alimenta con el conteo POST-lectura, igual que hace
  // el motor viejo: sin esto el pipeline nuevo no participa del rate control y
  // termina calentando la IP de la que depende el daemon.
  noteNavResult(first ? first.ads.length : 0)
  if (!first) {
    return { ads: [], count: null, pagesRead: 0, truncated: false, inconclusive: true }
  }

  const seen = new Set<string>()
  const ads: SsrAd[] = []
  // La MISMA clave que usa la persistencia, no una parecida: con dos claves
  // distintas un anuncio pasa como nuevo acá y colapsa al guardarse, y el
  // conteo que se reporta deja de ser el que queda en la base.
  const push = (batch: SsrAd[]) => {
    for (const a of batch) {
      const k = dedupeKey(a, normalizeUrl(a.link_url))
      if (seen.has(k)) continue
      seen.add(k)
      ads.push(a)
    }
  }
  push(first.ads)

  let cursor = first.nextCursor
  let hasNext = first.hasNext
  let pagesRead = 1
  let inconclusive = false

  while (token && hasNext && cursor && pagesRead < MAX_PAGES_PER_SEARCH) {
    if (onPage) await onPage()
    const next = await fetchNextPage(page, token, query, country, cursor)
    noteNavResult(next ? next.ads.length : 0)
    if (!next) { inconclusive = true; break }
    pagesRead++
    push(next.ads)
    cursor = next.nextCursor
    hasNext = next.hasNext
    // Una página sin anuncios nuevos con hasNext en true es un bucle: Meta a
    // veces devuelve el mismo cursor. Cortar acá evita gastar el tope entero.
    if (next.ads.length === 0) break
  }

  return {
    ads,
    count: first.count,
    pagesRead,
    truncated: hasNext && !!cursor,
    inconclusive,
  }
}
