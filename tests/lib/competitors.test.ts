import { describe, it, expect } from 'vitest'
import { isLikelyService, matchPeCompetitors, productTokens } from '@/lib/product-hunter/competitors'
import type { ProductRow } from '@/lib/product-hunter/types'

function row(overrides: {
  name: string
  keyword?: string
  country?: string
  categories?: string[]
  creatives?: { body?: string; title?: string }[]
  adCount?: number
}): ProductRow {
  return {
    id: Math.random().toString(36).slice(2),
    niche: 'rodilla',
    page_id: '123',
    name: overrides.name,
    raw_data: {
      page_id: '123',
      ad_id: '456',
      advertiser_name: overrides.name,
      ad_count: overrides.adCount ?? 10,
      days_running: 30,
      oldest_date: '2026-05-01',
      found_keyword: overrides.keyword ?? 'rodillera',
      found_country: overrides.country ?? 'PE',
      page_categories: overrides.categories,
      creatives: overrides.creatives?.map((c) => ({
        body: c.body ?? null,
        title: c.title ?? null,
        cta: null,
        link: null,
      })),
    },
    score: null,
    analysis: null,
    scraped_at: '2026-06-10',
    analyzed_at: null,
  }
}

describe('isLikelyService', () => {
  it('detecta servicios por categoría de Meta', () => {
    expect(isLikelyService('Bienestar Total', ['Medical Service'])).toBe(true)
    expect(isLikelyService('Algo', ['Physical Therapist'])).toBe(true)
    expect(isLikelyService('Algo', ['Servicio de salud'])).toBe(true)
  })

  it('NO marca categorías genéricas que usan tiendas', () => {
    expect(isLikelyService('NaturalFlex', ['Health & wellness website'])).toBe(false)
    expect(isLikelyService('Ortopedia ORTIZ', ['Compras'])).toBe(false)
  })

  it('detecta servicios por nombre', () => {
    expect(isLikelyService('Dr. José Navarro')).toBe(true)
    expect(isLikelyService('Clínica San Rafael Saltillo')).toBe(true)
    expect(isLikelyService('FisioUnidos - Fisioterapia y Rehabilitación')).toBe(true)
    expect(isLikelyService('Menny Valles Ajustes Quiroprácticos - Sobador Huesero')).toBe(true)
    expect(isLikelyService('Centro de Regeneración Articular Guadalajara')).toBe(true)
  })

  it('NO marca vendedores de producto', () => {
    expect(isLikelyService('NaturalFlex Perú')).toBe(false)
    expect(isLikelyService('Buen Pie')).toBe(false)
    expect(isLikelyService('Mundoo Tecno')).toBe(false)
    // "Ortopedia ORTIZ" es tienda; "ortopedista" (la profesión) sí es servicio
    expect(isLikelyService('Ortopedia ORTIZ')).toBe(false)
    expect(isLikelyService('Dr Marcotulio Ortopedista y Traumatólogo')).toBe(true)
  })
})

describe('productTokens', () => {
  it('extrae tokens del nombre, keyword y creativos, sin stopwords', () => {
    const tokens = productTokens(
      row({
        name: 'Tienda Flexi',
        keyword: 'rodillera',
        creatives: [{ title: 'Rodillera ortopédica premium', body: 'Alivia el dolor para siempre' }],
      })
    )
    expect(tokens).toContain('rodillera')
    expect(tokens).toContain('flexi')
    expect(tokens).toContain('ortopedica')
    expect(tokens).not.toContain('para') // stopword
    expect(tokens).not.toContain('el')   // corto
  })
})

describe('matchPeCompetitors', () => {
  const candidate = row({
    name: 'KneePro MX',
    keyword: 'rodillera',
    country: 'MX',
    creatives: [{ title: 'Rodillera estabilizadora KneePro', body: 'Soporte de rodilla con compresión' }],
  })

  it('excluye servicios del pool PE', () => {
    const pool = [
      row({ name: 'Dr. José Navarro', keyword: 'rodillera' }),
      row({ name: 'Clínica San Gabriel', keyword: 'rodillera' }),
      row({ name: 'OrtoStore Perú', keyword: 'rodillera', creatives: [{ title: 'Rodillera deportiva' }] }),
    ]
    const res = matchPeCompetitors(candidate, pool)
    expect(res.servicesExcluded).toBe(2)
    expect(res.competitors.map((c) => c.name)).toEqual(['OrtoStore Perú'])
  })

  it('matchea por tokens de producto compartidos, no por nicho completo', () => {
    const pool = [
      // Vende rodilleras → matchea
      row({ name: 'OrtoStore Perú', keyword: 'dolor rodilla', creatives: [{ title: 'Rodillera con soporte' }] }),
      // Vende colágeno (otro producto del mismo nicho) → NO matchea
      row({ name: 'VitaPlus', keyword: 'dolor rodilla', creatives: [{ title: 'Colágeno hidrolizado premium' }] }),
    ]
    const res = matchPeCompetitors(candidate, pool)
    expect(res.competitors.map((c) => c.name)).toEqual(['OrtoStore Perú'])
  })

  it('fallback por keyword idéntica cuando faltan creativos (filas viejas)', () => {
    const oldCandidate = row({ name: 'KneeShop', keyword: 'rodillera', country: 'MX' })
    const pool = [
      row({ name: 'Importadora Lima', keyword: 'rodillera' }),       // misma keyword → matchea
      row({ name: 'VitaPlus', keyword: 'dolor articulaciones' }),    // otra keyword → no
    ]
    const res = matchPeCompetitors(oldCandidate, pool)
    expect(res.competitors.map((c) => c.name)).toEqual(['Importadora Lima'])
  })

  it('ordena por adCount desc y reporta el tamaño del pool', () => {
    const pool = [
      row({ name: 'Chico', keyword: 'rodillera', adCount: 3, creatives: [{ title: 'Rodillera básica' }] }),
      row({ name: 'Grande', keyword: 'rodillera', adCount: 50, creatives: [{ title: 'Rodillera pro' }] }),
    ]
    const res = matchPeCompetitors(candidate, pool)
    expect(res.competitors[0].name).toBe('Grande')
    expect(res.poolSize).toBe(2)
  })
})
