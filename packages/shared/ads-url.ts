// Parser de una URL de Meta Ads Library pegada por el usuario. Puro (sin browser
// ni deps): lo usan la ruta web (para encolar la request) y el worker.
//
// Dos formas soportadas:
//   - anuncio específico:  .../ads/library/?id=<ad_archive_id>
//   - página del anunciante: .../ads/library/?view_all_page_id=<page_id>
// Mismos regex que dom-fallback.ts (id ≥10 dígitos, page_id solo dígitos).

export interface ParsedAdsLibraryUrl {
  pageId?: string
  adId?: string
  country?: string  // ISO-2 si venía en la URL (p.ej. country=MX)
}

// Devuelve el target extraíble, o null si no es una URL de la biblioteca de Meta
// o no trae ni page_id ni ad_id usable.
export function parseAdsLibraryUrl(input: string): ParsedAdsLibraryUrl | null {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  // facebook.com y subdominios (www., web., m., business.)
  if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null
  if (!u.pathname.toLowerCase().includes('/ads/library')) return null

  const pageId = u.searchParams.get('view_all_page_id')
  const adId = u.searchParams.get('id')
  const country = u.searchParams.get('country')

  const out: ParsedAdsLibraryUrl = {}
  if (pageId && /^\d+$/.test(pageId)) out.pageId = pageId
  if (adId && /^\d{10,}$/.test(adId)) out.adId = adId
  if (country && /^[A-Z]{2}$/.test(country)) out.country = country

  if (!out.pageId && !out.adId) return null
  return out
}
