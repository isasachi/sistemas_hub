import { describe, it, expect } from 'vitest'
import { toEntry } from './entry'
import type { RawProductRow } from '@ph/shared'

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
