import { describe, it, expect } from 'vitest'
import { toEntry } from './entry'
import type { RawProductRow, RawClusterRow } from '@ph/shared'

const fila = (extra: Partial<RawProductRow> = {}): RawProductRow => ({
  niche: 'acne', page_id: '123', ad_id: '1', name: 'Asarai', ad_count: 136,
  country: 'MX', raw_data: { title: 'Earth Tones Mask' }, scraped_at: '2026-08-16T00:00:00Z',
  ...extra,
})

describe('toEntry — sello de verificación', () => {
  it('marca verificado solo lo aprobado por el pipeline', () => {
    const e = toEntry(fila({ status: 'monoproducto', share: 0.9, senal_nicho: 'path' }))
    expect(e.verificado).toBe(true)
    expect(e.share).toBe(0.9)
    expect(e.senal).toBe('path')
  })

  // El 95% del inventario está 'pendiente' y se sirve igual: se muestra, pero
  // sin sello. Prometerlo verificado sería falso.
  it('no marca verificado lo que solo está scrapeado', () => {
    expect(toEntry(fila({ status: 'pendiente' })).verificado).toBe(false)
  })

  it('sin veredicto deja los campos en null, no en 0', () => {
    const e = toEntry(fila())
    expect(e.verificado).toBe(false)
    expect(e.share).toBeNull()
    expect(e.senal).toBeNull()
  })

  it('sin_verificar tampoco lleva sello', () => {
    expect(toEntry(fila({ status: 'sin_verificar', share: 0.8 })).verificado).toBe(false)
  })
})

describe('toEntry — fila de CLUSTER: la card identifica el producto, no la página', () => {
  const cluster = (extra: Partial<RawClusterRow> = {}): RawClusterRow => ({
    niche: 'rodilla', page_id: '123', cluster_key: 'tienda.com/products/rodillera',
    ad_count: 63, muestra_n: 15, muestra_tot: 30,
    titulo: 'Rodillera de compresión', cuerpo: 'alivia el dolor',
    url: 'https://tienda.com/products/rodillera', name: 'Tienda ABC', country: 'MX',
    status: 'monoproducto', ...extra,
  })

  it('cuenta los anuncios del PRODUCTO y el id lo distingue de sus hermanos', () => {
    const e = toEntry(cluster())
    expect(e.id).toBe('rodilla:123:tienda.com/products/rodillera')
    expect(e.adCount).toBe(63)          // el producto, no los 137 de la página
    expect(e.advertiser).toBe('Tienda ABC')
    expect(e.verificado).toBe(true)
  })

  // El 42% de los clusters no trae texto de producto en el título: plantillas
  // sin renderizar, el canvas de Facebook, "+5.500 VENDIDOS". El slug SÍ lo
  // identifica — es la misma señal con la que productKey agrupa.
  it('cuando el título es una plantilla sin renderizar, cae al slug de la landing', () => {
    const e = toEntry(cluster({ titulo: '{{product.name}}', url: 'https://t.com/products/faja-lumbar' }))
    expect(e.productName).toBe('faja lumbar')
  })

  it('el share del cluster sale de su parte de la muestra', () => {
    expect(toEntry(cluster()).share).toBe(0.5)
  })

  it('sin título ni url usable no inventa un nombre', () => {
    expect(toEntry(cluster({ titulo: null, url: null, product_name: null })).productName).toBeNull()
  })
})
