// Normalización de URLs (spec §19).
//
// ⚠️ NUNCA LANZA. El snippet del spec hace `new URL(input)` pelado, y el
// `link_url` que devuelve Meta viene con frecuencia null, relativo o envuelto en
// el redirect `l.facebook.com/l.php?u=…`. Una excepción acá tira el anuncio
// entero por un parámetro de tracking, así que lo ilegible se devuelve tal cual
// y quien llama decide.
const DROP_EXACT = new Set([
  'fbclid', 'gclid', 'ttclid', 'msclkid', 'igshid',
  'ref', 'ref_src', 'referrer',
  'mc_cid', 'mc_eid', '_ga', '_gl', 'yclid', 'wbraid', 'gbraid',
])

const isTracking = (key: string): boolean => {
  const k = key.toLowerCase()
  return k.startsWith('utm_') || DROP_EXACT.has(k)
}

/**
 * Quita parámetros de tracking y conserva los funcionales (`?id=123` identifica
 * el producto y por eso no se toca). Desenvuelve el redirect de Facebook.
 * Devuelve el input sin cambios si no es una URL parseable.
 */
export function normalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }

  // l.facebook.com/l.php?u=<url real>: sin esto todos los anuncios que pasan
  // por el redirect comparten dominio y se leen como el mismo destino.
  if (/(^|\.)facebook\.com$/i.test(url.hostname) && url.pathname === '/l.php') {
    const inner = url.searchParams.get('u')
    if (inner) return normalizeUrl(inner)
  }

  for (const key of [...url.searchParams.keys()]) {
    if (isTracking(key)) url.searchParams.delete(key)
  }
  url.hash = ''
  url.hostname = url.hostname.replace(/^www\./i, '')
  // Barra final: /producto y /producto/ son la misma página y separarlas
  // duplicaría el anuncio.
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

/** Dominio registrable-ish del destino, o null si la URL no es parseable. */
export function domainOf(input: string | null | undefined): string | null {
  if (!input) return null
  try {
    return new URL(input).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}
