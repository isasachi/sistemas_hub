import { describe, it, expect } from 'vitest'
import { toCard } from '@/lib/product-hunter/to-card'
import type { ProductRow } from '@ph/shared'

// Fila válida base que pasa las tres reglas de oro; cada test la perturba en un eje.
function row(over: { raw?: Partial<ProductRow['raw_data']>; analysis?: Partial<NonNullable<ProductRow['analysis']>> | null; score?: number | null } = {}): ProductRow {
  return {
    id: 'p1',
    niche: 'rodilla',
    name: 'AdvX',
    score: over.score === undefined ? 80 : over.score,
    scraped_at: '2026-06-20T00:00:00Z',
    analysis: over.analysis === null ? null : {
      score: 80, productName: 'Rodillera X', whatItIs: 'soporte', problemSolved: 'dolor',
      attributes: [], peScenario: 'A', peCompetitors: [], priority: 'alta',
      reasoning: 'r', peSearchTerms: [], ...over.analysis,
    },
    raw_data: {
      page_id: 'pg', ad_id: 'ad', advertiser_name: 'AdvX', ad_count: 50,
      days_running: 20, oldest_date: '2026-05-01', found_keyword: 'rodilla',
      found_country: 'MX', ...over.raw,
    },
  } as ProductRow
}

describe('toCard — reglas de oro (serving)', () => {
  it('acepta una fila que cumple las tres reglas', () => {
    expect(toCard(row())).not.toBeNull()
  })

  it('rechaza < 40 ads (39 fuera, 40 dentro)', () => {
    expect(toCard(row({ raw: { ad_count: 39 } }))).toBeNull()
    expect(toCard(row({ raw: { ad_count: 40 } }))).not.toBeNull()
  })

  it('rechaza < 10 días (9 fuera, 10 dentro)', () => {
    expect(toCard(row({ raw: { days_running: 9 } }))).toBeNull()
    expect(toCard(row({ raw: { days_running: 10 } }))).not.toBeNull()
  })

  it('rechaza días desconocidos (null)', () => {
    expect(toCard(row({ raw: { days_running: null } }))).toBeNull()
  })

  it('rechaza pautado en Perú (found_country PE)', () => {
    expect(toCard(row({ raw: { found_country: 'PE' } }))).toBeNull()
  })

  it('rechaza offTopic (el bug que la copia divergida de quota.ts dejaba pasar)', () => {
    expect(toCard(row({ analysis: { offTopic: true } }))).toBeNull()
  })

  it('rechaza sin analizar (analysis null o score null)', () => {
    expect(toCard(row({ analysis: null }))).toBeNull()
    expect(toCard(row({ score: null }))).toBeNull()
  })
})
