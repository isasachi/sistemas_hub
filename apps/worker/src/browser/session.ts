// Sesión del collector: deja la página lista para leer la Ad Library por fetch
// same-origin Y se queda con el token de paginación.
//
// ── Por qué el token se COSECHA y no se hardcodea ────────────────────────────
// Paginar la búsqueda es una llamada a `AdLibrarySearchPaginationQuery`, que
// necesita un `doc_id` y un puñado de tokens de sesión (`fb_dtsg`, `lsd`,
// `jazoest`, `__spin_*`). Los dos rotan: un doc_id pegado en el código funciona
// hasta el día que Meta lo cambia y ahí la paginación muere en silencio,
// devolviendo la primera página como si fuera todo.
//
// Así que se abre la página, se hace UN scroll, y se captura la request que
// Meta manda sola. Se auto-repara solo. Si no se captura nada, `token` queda
// null y el collector lee solo la primera página SSR — degrada, no rompe.
//
// ⚠️ UN TOKEN ALCANZA PARA TODO EL POOL, y compartirlo NO es un atajo: las
// pages salen del MISMO browser context, así que comparten cookies y por tanto
// el mismo `fb_dtsg`/`lsd`; el `doc_id` es global. Medido en vivo: abriendo 3
// sesiones en paralelo solo 1 capturó la request (el scroll no siempre la
// dispara), así que 2 de 3 pages quedaban leyendo solo la primera página y se
// perdía el 60% de la profundidad. Con `harvestToken` el pool entero pagina en
// cuanto UNA página lo consigue.
//
// Medido en vivo (2026-08-21, "dolor de muela"/MX): SSR primera página 30
// anuncios de un `count` de 449; el replay del token devuelve 200 con anuncios
// nuevos y su propio `end_cursor`. `first` lo IGNORA el servidor: pedir 30
// devuelve los mismos ~9-10 que pedir 10.
import type { Page } from 'playwright'
import { searchUrl } from '../../lib/product-hunter/scraper'

export interface PaginationToken {
  /** Campos del form tal como los mandó el browser, `variables` incluido. */
  form: Record<string, string>
}

const FRIENDLY = 'AdLibrarySearchPaginationQuery'

/**
 * Navega una vez y cosecha el token. Devuelve null si Meta no disparó la
 * request de paginación (búsqueda con pocos resultados, o layout cambiado).
 */
export async function openDiscoverySession(
  page: Page,
  seedQuery: string,
  country: string,
): Promise<PaginationToken | null> {
  let form: Record<string, string> | null = null
  const capture = (r: { url(): string; postData(): string | null }) => {
    if (form) return
    if (!r.url().includes('facebook.com/api/graphql')) return
    const pd = r.postData()
    if (!pd) return
    const p = new URLSearchParams(pd)
    if (p.get('fb_api_req_friendly_name') !== FRIENDLY) return
    form = Object.fromEntries(p.entries())
  }

  page.on('request', capture)
  try {
    await page.goto(searchUrl(seedQuery, country), { timeout: 60_000, waitUntil: 'domcontentloaded' })
    // Meta reescribe la URL del lado del cliente y esa navegación destruye el
    // contexto de ejecución: sin esta espera el primer evaluate falla con
    // "Execution context was destroyed". Ya documentado en ssr-fetch.ts.
    await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {})
    await page.waitForTimeout(3_000)
    // Un solo scroll: alcanza para que dispare la paginación y no encarece la
    // apertura más de lo necesario.
    await page.keyboard.press('End').catch(() => {})
    await page.waitForTimeout(3_500)
  } finally {
    page.off('request', capture)
  }

  return form ? { form } : null
}

/**
 * Abre todas las pages del pool y devuelve UN token para todas: el primero que
 * alguna consiga. Las pages se abren igual aunque el token ya esté (cada una
 * necesita su propia sesión same-origin para poder hacer fetch).
 */
export async function openPool(
  pages: Page[],
  seedQuery: string,
  country: string,
): Promise<{ token: PaginationToken | null; harvested: number }> {
  const found = await Promise.all(
    pages.map((p) => openDiscoverySession(p, seedQuery, country).catch(() => null)),
  )
  const ok = found.filter((t): t is PaginationToken => !!t)
  return { token: ok[0] ?? null, harvested: ok.length }
}
