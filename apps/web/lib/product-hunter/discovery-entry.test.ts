import { describe, it, expect } from 'vitest'
import { DISC_BUCKET, RAW_BUCKETS, bucketRange, type DiscoveryRow } from '@ph/shared'
import { toDiscoveryEntry } from './discovery-entry'

// El corte del motor nuevo, replicado acá a propósito: si `getBucket` del worker
// cambia, este test tiene que fallar en vez de que la traducción mienta en
// silencio.
const DISC_RANGE: Record<string, { min: number; max: number | null }> = {
  '0_49': { min: 0, max: 50 },
  '50_99': { min: 50, max: 100 },
  '100_plus': { min: 100, max: null },
}

describe('traducción de rangos entre los dos motores', () => {
  // Es lo único no trivial del adaptador: dos vocabularios (`0_49` vs `0-50`)
  // sobre los MISMOS cortes. Si alguien mueve uno de los dos, un anunciante
  // aparece en el rango equivocado y nada más lo nota.
  it('cada rango de la UI cubre exactamente el mismo tramo que el del motor nuevo', () => {
    for (const b of RAW_BUCKETS) {
      expect(DISC_RANGE[DISC_BUCKET[b]]).toEqual(bucketRange(b))
    }
  })
})

const fila = (o: Partial<DiscoveryRow> = {}): DiscoveryRow => ({
  dedupe_key: '123|rodillera', seed_query: 'rodilla', page_id: '123',
  advertiser: 'Tienda', product_name: 'Rodillera', headline: 'Titular', body: 'Cuerpo',
  landing: 'https://x.co/p', countries: ['CO', 'MX'], bucket: '0_49',
  advertiser_ads: 30, product_ads: 25, product_share: 0.83, monoproduct: true,
  days_active: 96, score: 88, ...o,
})

describe('toDiscoveryEntry', () => {
  it('el número de anuncios es el del ANUNCIANTE, que es lo que define el rango', () => {
    expect(toDiscoveryEntry(fila()).adCount).toBe(30)
  })

  it('conserva TODOS los países del descubrimiento', () => {
    expect(toDiscoveryEntry(fila()).country).toBe('CO, MX')
  })

  it('el share llega medido y la señal del verificador viejo queda en null', () => {
    const e = toDiscoveryEntry(fila())
    expect(e.verificado).toBe(true)
    expect(e.share).toBe(0.83)
    expect(e.senal).toBeNull()
  })

  it('el enlace apunta a la biblioteca del anunciante', () => {
    expect(toDiscoveryEntry(fila()).adsUrl).toContain('view_all_page_id=123')
  })

  it('sin anuncios del anunciante no inventa un número', () => {
    expect(toDiscoveryEntry(fila({ advertiser_ads: null, product_ads: null })).adCount).toBe(0)
  })
})
