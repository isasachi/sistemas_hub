import { describe, it, expect } from 'vitest'
import { advertiserUrl } from './ssr-fetch'

// El país de esta URL decide QUÉ se mide, y confundirlo fue un defecto real:
// InvigorFate tiene 685 anuncios en el mundo y 47 en México, así que medir el
// rango en 'ALL' lo ponía en "100+" cuando en su mercado es un "0-50".
describe('advertiserUrl', () => {
  it('sin país mide todos los mercados (para el share, que necesita muestra)', () => {
    expect(advertiserUrl('123')).toContain('country=ALL')
  })

  it('con país mide solo ese mercado (para el rango, que es la promesa al usuario)', () => {
    const u = advertiserUrl('123', 'MX')
    expect(u).toContain('country=MX')
    expect(u).not.toContain('country=ALL')
  })

  // sort_data sesga la proporción hasta 40 puntos (medido en verify-product.ts):
  // el orden por impresiones sobrerrepresenta al producto estrella.
  it('nunca ordena por impresiones, con o sin país', () => {
    expect(advertiserUrl('123')).not.toContain('sort_data')
    expect(advertiserUrl('123', 'CL')).not.toContain('sort_data')
  })

  it('apunta siempre a la página del anunciante', () => {
    const u = advertiserUrl('999', 'AR')
    expect(u).toContain('view_all_page_id=999')
    expect(u).toContain('search_type=page')
  })
})
