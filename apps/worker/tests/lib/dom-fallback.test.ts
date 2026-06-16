import { describe, it, expect } from 'vitest'
import {
  parsePageIdsFromHrefs,
  parseAdIdsFromHrefs,
  parseCardText,
} from '@/lib/product-hunter/dom-fallback'

const PAGE_HREF = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=123456789&search_type=page'
const AD_HREF = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&id=9876543210&view_all_page_id=123456789'

describe('parsePageIdsFromHrefs', () => {
  it('extrae page_id de un href con view_all_page_id', () => {
    expect(parsePageIdsFromHrefs([PAGE_HREF])).toEqual(['123456789'])
  })

  it('deduplica page_ids repetidos', () => {
    expect(parsePageIdsFromHrefs([PAGE_HREF, PAGE_HREF])).toEqual(['123456789'])
  })

  it('ignora hrefs sin view_all_page_id', () => {
    const noParamHref = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all'
    expect(parsePageIdsFromHrefs(['https://facebook.com/page', noParamHref])).toEqual([])
  })

  it('ignora page_ids que no sean numéricos', () => {
    const href = 'https://www.facebook.com/ads/library/?view_all_page_id=abc123'
    expect(parsePageIdsFromHrefs([href])).toEqual([])
  })

  it('maneja URLs inválidas sin tirar error', () => {
    expect(parsePageIdsFromHrefs(['not-a-url', PAGE_HREF])).toEqual(['123456789'])
  })
})

describe('parseAdIdsFromHrefs', () => {
  it('extrae ad_id de 10+ dígitos del parámetro id', () => {
    expect(parseAdIdsFromHrefs([AD_HREF])).toEqual(['9876543210'])
  })

  it('ignora ids de menos de 10 dígitos', () => {
    const href = 'https://www.facebook.com/ads/library/?id=12345&view_all_page_id=123'
    expect(parseAdIdsFromHrefs([href])).toEqual([])
  })

  it('deduplica ad_ids repetidos', () => {
    expect(parseAdIdsFromHrefs([AD_HREF, AD_HREF])).toEqual(['9876543210'])
  })
})

describe('parseCardText', () => {
  it('extrae ad count en español (anuncios)', () => {
    const { adCount } = parseCardText('Esta página tiene 47 anuncios activos')
    expect(adCount).toBe(47)
  })

  it('extrae ad count en inglés (ads)', () => {
    const { adCount } = parseCardText('This page has 120 ads running')
    expect(adCount).toBe(120)
  })

  it('extrae ad count con separador de miles', () => {
    const { adCount } = parseCardText('1,234 anuncios')
    expect(adCount).toBe(1234)
  })

  it('extrae días corriendo (español)', () => {
    const { daysRunning } = parseCardText('Empezó a circular hace 30 días')
    expect(daysRunning).toBe(30)
  })

  it('extrae días corriendo (inglés)', () => {
    const { daysRunning } = parseCardText('Started running 15 days ago')
    expect(daysRunning).toBe(15)
  })

  it('devuelve null si no encuentra el patrón', () => {
    const { adCount, daysRunning } = parseCardText('Texto sin datos de anuncios')
    expect(adCount).toBeNull()
    expect(daysRunning).toBeNull()
  })

  it('extrae ambos campos del mismo texto', () => {
    const text = '47 anuncios · Empezó a circular hace 22 días'
    const { adCount, daysRunning } = parseCardText(text)
    expect(adCount).toBe(47)
    expect(daysRunning).toBe(22)
  })
})
