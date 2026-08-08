import { describe, it, expect } from 'vitest'
import { stripAdVars, toEntry } from '@/lib/product-hunter/entry'
import type { RawProductRow } from '@ph/shared'

describe('stripAdVars', () => {
  it('descarta el texto que es solo plantilla de catálogo', () => {
    expect(stripAdVars('{{product.name}}')).toBeNull()
    expect(stripAdVars('{{product.brand}}')).toBeNull()
  })

  it('conserva el texto real y limpia el separador que queda', () => {
    expect(stripAdVars('{{product.name}} — 50% de descuento')).toBe('50% de descuento')
    expect(stripAdVars('Faja Body Postura')).toBe('Faja Body Postura')
    expect(stripAdVars(null)).toBeNull()
  })
})

it('toEntry no deja llegar plantillas a la card', () => {
  const row = {
    niche: 'espalda', page_id: '1', name: 'Uber', product_name: null,
    country: 'AR', ad_count: 10,
    raw_data: { title: '{{product.name}}', body: '{{product.brand}}' },
  } as unknown as RawProductRow
  const e = toEntry(row)
  expect(e.productName ?? e.title ?? e.advertiser).toBe('Uber')
  expect(e.body).toBeNull()
})
