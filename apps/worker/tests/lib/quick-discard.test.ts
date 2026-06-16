import { describe, it, expect } from 'vitest'
import { quickDiscard, goldenDiscard, isNearWinner, MIN_ADS, MIN_DAYS, NEAR_ADS, NEAR_DAYS, MIN_PRODUCT_RATIO } from '@/lib/product-hunter/quick-discard'
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

describe('goldenDiscard (reglas de oro post-enrich — estrictas)', () => {
  it('pasa solo con ≥40 ads y ≥10 días', () => {
    expect(goldenDiscard(MIN_ADS, MIN_DAYS)).toBeNull()
    expect(goldenDiscard(100, 30)).toBeNull()
  })

  it(`descarta con menos de ${MIN_ADS} ads (caso real: SupleCaps con 13)`, () => {
    expect(goldenDiscard(13, 632)).toBe('pocos_anuncios')
    expect(goldenDiscard(MIN_ADS - 1, 100)).toBe('pocos_anuncios')
  })

  it(`descarta con menos de ${MIN_DAYS} días`, () => {
    expect(goldenDiscard(100, MIN_DAYS - 1)).toBe('muy_reciente')
  })

  it('descarta antigüedad DESCONOCIDA (estricto, sin excepción conservadora)', () => {
    expect(goldenDiscard(100, null)).toBe('muy_reciente')
  })

  it('pasa cuando mainProductAdCount domina la página (ratio ≥ 0.6)', () => {
    // 60 de 100 ads son del producto → exactamente el umbral
    expect(goldenDiscard(100, 30, 60)).toBeNull()
    expect(goldenDiscard(100, 30, 80)).toBeNull()
    expect(goldenDiscard(100, 30, 100)).toBeNull()
  })

  it(`descarta catálogo cuando mainProductAdCount / adCount < ${MIN_PRODUCT_RATIO}`, () => {
    // 50 de 200 = 0.25 < 0.6 → catálogo
    expect(goldenDiscard(200, 30, 50)).toBe('catalogo')
    expect(goldenDiscard(100, 30, 30)).toBe('catalogo')
  })

  it('no aplica filtro anti-catálogo si mainProductAdCount es null (dato ausente)', () => {
    expect(goldenDiscard(100, 30, null)).toBeNull()
    expect(goldenDiscard(100, 30, undefined)).toBeNull()
  })
})

describe('isNearWinner (watchlist — casi-ganadores)', () => {
  it('con tracción (≥20 ads y ≥5 días) → vigilar', () => {
    expect(isNearWinner(NEAR_ADS, NEAR_DAYS)).toBe(true)
    expect(isNearWinner(35, 8)).toBe(true)   // subiendo hacia 40
    expect(isNearWinner(60, 7)).toBe(true)   // volumen ok, días subiendo
  })

  it('sin tracción → no vigilar (no inflar la watchlist con ruido)', () => {
    expect(isNearWinner(10, 30)).toBe(false) // muy pocos ads
    expect(isNearWinner(50, 2)).toBe(false)  // demasiado reciente
    expect(isNearWinner(NEAR_ADS - 1, 30)).toBe(false)
  })

  it('antigüedad desconocida → no vigilar', () => {
    expect(isNearWinner(100, null)).toBe(false)
  })
})
