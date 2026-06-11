import { describe, it, expect } from 'vitest'
import { quickDiscard, MIN_ADS, MIN_DAYS } from '@/lib/product-hunter/quick-discard'
import type { QuickDiscardCandidate } from '@/lib/product-hunter/quick-discard'

const NOW_SECONDS = Math.floor(Date.now() / 1000)

function makeCandidate(overrides: Partial<QuickDiscardCandidate> = {}): QuickDiscardCandidate {
  return {
    pageName: 'Rodillera Pro Shop',
    pageCategories: [],
    collationCount: 80,
    startDate: NOW_SECONDS - 30 * 86_400,  // 30 días atrás
    foundCountry: 'MX',
    ...overrides,
  }
}

describe('quickDiscard', () => {
  it('no descarta un candidato válido', () => {
    expect(quickDiscard(makeCandidate())).toBeNull()
  })

  it('descarta servicios por nombre', () => {
    const reason = quickDiscard(makeCandidate({ pageName: 'Dr. García Traumatólogo' }))
    expect(reason).toBe('servicio')
  })

  it('descarta servicios por categoría de página', () => {
    const reason = quickDiscard(makeCandidate({ pageCategories: ['Physical Therapist'] }))
    expect(reason).toBe('servicio')
  })

  it('no descarta candidatos PE aunque tengan pocos ads o sean muy recientes', () => {
    // PE exception: omite checks de card/días (son el pool de competidores locales).
    const reason = quickDiscard(makeCandidate({
      pageName: 'Rodillera Perú Shop',
      collationCount: 5,                        // descartar si no-PE
      startDate: NOW_SECONDS - 2 * 86_400,      // descartar si no-PE
      foundCountry: 'PE',
    }))
    expect(reason).toBeNull()
  })

  it(`descarta cuando collationCount < ${MIN_ADS}`, () => {
    const reason = quickDiscard(makeCandidate({ collationCount: MIN_ADS - 1 }))
    expect(reason).toBe('pocos_anuncios')
  })

  it(`no descarta cuando collationCount === ${MIN_ADS}`, () => {
    expect(quickDiscard(makeCandidate({ collationCount: MIN_ADS }))).toBeNull()
  })

  it('no descarta cuando collationCount es null (campo ausente en payload)', () => {
    expect(quickDiscard(makeCandidate({ collationCount: null }))).toBeNull()
  })

  it(`descarta cuando startDate indica menos de ${MIN_DAYS} días`, () => {
    const recentDate = NOW_SECONDS - (MIN_DAYS - 1) * 86_400
    const reason = quickDiscard(makeCandidate({ startDate: recentDate }))
    expect(reason).toBe('muy_reciente')
  })

  it(`no descarta cuando startDate indica exactamente ${MIN_DAYS} días`, () => {
    const exactDate = NOW_SECONDS - MIN_DAYS * 86_400
    expect(quickDiscard(makeCandidate({ startDate: exactDate }))).toBeNull()
  })

  it('no descarta cuando startDate es null (campo ausente)', () => {
    expect(quickDiscard(makeCandidate({ startDate: null }))).toBeNull()
  })

  it('servicio tiene precedencia sobre PE (servicios PE sí se descartan)', () => {
    const reason = quickDiscard(makeCandidate({
      pageName: 'Dr. García Fisioterapeuta',
      foundCountry: 'PE',
    }))
    expect(reason).toBe('servicio')
  })
})
