import { describe, it, expect } from 'vitest'
import { productKey, shareOf, senalNicho } from './product-key'

describe('productKey', () => {
  it('usa el path del link como identidad del producto', () => {
    expect(productKey({ link_url: 'https://www.asarai.com/products/earth-tones-mask' }))
      .toBe('asarai.com/products/earth-tones-mask')
  })

  it('ignora la query y la barra final (el mismo producto no se cuenta dos veces)', () => {
    const a = productKey({ link_url: 'https://ecodermiscol.com/producto/kit-piel-sana/?empty-cart=yes' })
    const b = productKey({ link_url: 'https://ecodermiscol.com/producto/kit-piel-sana' })
    expect(a).toBe(b)
  })

  it('NO usa el link cuando es un chat: cae al título', () => {
    const ad = { link_url: 'https://api.whatsapp.com/send', title: 'Piel sin imperfecciones' }
    expect(productKey(ad)).toBe('piel sin imperfecciones')
  })

  it('trata la home pelada como no identificatoria', () => {
    expect(productKey({ link_url: 'https://tienda.com/', title: 'Serum de niacinamida' }))
      .toBe('serum de niacinamida')
  })
})

describe('shareOf', () => {
  it('mide la parte dominante de la pauta', () => {
    const r = shareOf([
      { link_url: 'https://x.com/products/a' },
      { link_url: 'https://x.com/products/a' },
      { link_url: 'https://x.com/products/a' },
      { link_url: 'https://x.com/products/b' },
    ])
    expect(r.dominante).toBe('x.com/products/a')
    expect(r.share).toBe(0.75)
    expect(r.distintos).toBe(2)
  })

  // El fallo que motivó la corrección: 4 productos distintos, todos a WhatsApp.
  // Con el link como clave daban share 1.00 y entraban como monoproducto.
  it('no fabrica monoproducto cuando todo apunta al mismo WhatsApp', () => {
    const ads = [
      { link_url: 'https://api.whatsapp.com/send', title: 'Crema para manchas' },
      { link_url: 'https://api.whatsapp.com/send', title: 'Faja reductora' },
      { link_url: 'https://api.whatsapp.com/send', title: 'Serum facial' },
      { link_url: 'https://api.whatsapp.com/send', title: 'Gomitas de colageno' },
    ]
    expect(shareOf(ads).share).toBe(0.25)
  })

  it('devuelve share 0 sin anuncios, no NaN', () => {
    expect(shareOf([]).share).toBe(0)
  })
})

describe('senalNicho', () => {
  const T = ['acne', 'espinilla', 'bacne']

  it('path gana cuando el término está en la URL del producto', () => {
    expect(senalNicho(T, 'dermixachile.com/products/bacne-outbar', [])).toBe('path')
  })

  it('cae a cuerpo cuando solo el copy lo menciona', () => {
    expect(senalNicho(T, 'numaskin.com.ar/products/cabezal-de-ducha', [
      { title: 'Elimina el sarro', body: 'Evita caida de pelo, irritacion de piel, acne y mas' },
    ])).toBe('cuerpo')
  })

  it('ninguna cuando el producto no toca el nicho', () => {
    expect(senalNicho(T, 'tienda.com/products/jabon-kojico', [
      { title: 'Aclara tus axilas', body: 'Manchas oscuras en cuello y entrepierna' },
    ])).toBe('ninguna')
  })
})
