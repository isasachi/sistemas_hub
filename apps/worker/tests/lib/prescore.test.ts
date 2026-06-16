import { describe, it, expect } from 'vitest'
import { prescore, PRESCORE_DAYS_CAP, PRESCORE_ADS_CAP } from '@ph/shared'

describe('prescore', () => {
  it('devuelve 0 sin datos', () => {
    expect(prescore({ days_running: null, ad_count: 0 })).toBe(0)
  })

  it('devuelve 1 con ambas señales saturadas', () => {
    expect(prescore({ days_running: PRESCORE_DAYS_CAP, ad_count: PRESCORE_ADS_CAP })).toBe(1)
  })

  it('los caps acotan valores extremos (no premia outliers)', () => {
    const atCap = prescore({ days_running: PRESCORE_DAYS_CAP, ad_count: PRESCORE_ADS_CAP })
    const beyond = prescore({ days_running: 10_000, ad_count: 99_999 })
    expect(beyond).toBe(atCap)
  })

  it('pondera longevidad (0.6) sobre volumen (0.4)', () => {
    const soloLongevo = prescore({ days_running: PRESCORE_DAYS_CAP, ad_count: 0 })
    const soloVolumen = prescore({ days_running: 0, ad_count: PRESCORE_ADS_CAP })
    expect(soloLongevo).toBeCloseTo(0.6)
    expect(soloVolumen).toBeCloseTo(0.4)
    expect(soloLongevo).toBeGreaterThan(soloVolumen)
  })

  it('ordena candidatos: validado > reciente con mismo volumen', () => {
    const validado = prescore({ days_running: 60, ad_count: 80 })
    const reciente = prescore({ days_running: 12, ad_count: 80 })
    expect(validado).toBeGreaterThan(reciente)
  })

  it('days_running negativo o null no rompe (cuenta como 0)', () => {
    expect(prescore({ days_running: -5, ad_count: 100 })).toBeCloseTo(0.4 * 0.5)
    expect(prescore({ days_running: null, ad_count: 100 })).toBeCloseTo(0.4 * 0.5)
  })
})
