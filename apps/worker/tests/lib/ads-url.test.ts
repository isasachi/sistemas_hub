import { describe, it, expect } from 'vitest'
import { parseAdsLibraryUrl } from '@ph/shared'

const AD_URL = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=MX&id=9876543210'
const PAGE_URL = 'https://www.facebook.com/ads/library/?active_status=active&search_type=page&view_all_page_id=123456789'

describe('parseAdsLibraryUrl', () => {
  it('extrae ad_id + country de una URL de anuncio', () => {
    expect(parseAdsLibraryUrl(AD_URL)).toEqual({ adId: '9876543210', country: 'MX' })
  })

  it('extrae page_id de una URL de página del anunciante', () => {
    expect(parseAdsLibraryUrl(PAGE_URL)).toEqual({ pageId: '123456789' })
  })

  it('acepta ambos ids si vienen juntos', () => {
    const both = 'https://www.facebook.com/ads/library/?id=1111111111&view_all_page_id=222'
    expect(parseAdsLibraryUrl(both)).toEqual({ adId: '1111111111', pageId: '222' })
  })

  it('tolera espacios y subdominios (m./web.)', () => {
    expect(parseAdsLibraryUrl('  https://web.facebook.com/ads/library/?id=1234567890  ')).toEqual({ adId: '1234567890' })
  })

  it('rechaza ad_id de menos de 10 dígitos (regla del scraper)', () => {
    expect(parseAdsLibraryUrl('https://www.facebook.com/ads/library/?id=123')).toBeNull()
  })

  it('rechaza page_id no numérico', () => {
    expect(parseAdsLibraryUrl('https://www.facebook.com/ads/library/?view_all_page_id=abc')).toBeNull()
  })

  it('rechaza URLs que no son de Meta Ads Library', () => {
    expect(parseAdsLibraryUrl('https://example.com/ads/library/?id=9876543210')).toBeNull()
    expect(parseAdsLibraryUrl('https://www.facebook.com/somepage')).toBeNull()
  })

  it('rechaza URLs de la biblioteca sin id ni page_id usable', () => {
    expect(parseAdsLibraryUrl('https://www.facebook.com/ads/library/?q=rodillera')).toBeNull()
  })

  it('devuelve null para basura no-URL', () => {
    expect(parseAdsLibraryUrl('no soy una url')).toBeNull()
    expect(parseAdsLibraryUrl('')).toBeNull()
  })
})
