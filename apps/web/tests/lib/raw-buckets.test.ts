import { describe, it, expect } from 'vitest'
import { RAW_BUCKETS, bucketRange, isRawBucket, type RawBucket } from '@ph/shared'

// El agrupado ES la feature de la tool de testeo: los tres rangos tienen que
// cubrir todo ad_count ≥ 0 sin solaparse (un anunciante en un solo grupo).
function bucketOf(adCount: number): RawBucket[] {
  return RAW_BUCKETS.filter((b) => {
    const { min, max } = bucketRange(b)
    return adCount >= min && (max === null || adCount < max)
  })
}

describe('agrupado por rango de anuncios', () => {
  it('cada ad_count cae en exactamente un grupo', () => {
    for (const n of [0, 1, 39, 49, 50, 51, 99, 100, 101, 5000]) {
      expect(bucketOf(n), `ad_count=${n}`).toHaveLength(1)
    }
  })

  it('los bordes 50 y 100 van al grupo superior', () => {
    expect(bucketOf(49)[0]).toBe('0-50')
    expect(bucketOf(50)[0]).toBe('50-100')
    expect(bucketOf(99)[0]).toBe('50-100')
    expect(bucketOf(100)[0]).toBe('100+')
  })

  it('isRawBucket rechaza valores del cliente que no son grupos', () => {
    expect(isRawBucket('0-50')).toBe(true)
    expect(isRawBucket('todos')).toBe(false)
    expect(isRawBucket(50)).toBe(false)
  })
})
