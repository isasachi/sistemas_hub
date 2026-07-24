import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/gemini', () => ({
  callStructured: vi.fn().mockRejectedValue(new Error('gemini down')),
}))

vi.mock('@/lib/storage', () => ({
  fetchAsBase64: vi.fn(),
}))

import { classifyNiche } from './classify'
import { fetchAsBase64 } from '@/lib/storage'
import type { LandingSessionResponse } from './types'

function baseSession(overrides?: Partial<LandingSessionResponse>): LandingSessionResponse {
  return {
    product_photo_urls: null,
    product_labels: null,
    benefits: null,
    audience: null,
    ...overrides,
  } as unknown as LandingSessionResponse
}

describe('classifyNiche', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve el fallback duro generic/default-demo cuando callStructured falla', async () => {
    const result = await classifyNiche(baseSession())
    expect(result).toEqual({
      niche_id: 'generic',
      demographic_id: 'female_30_45',
      confidence: 0,
      reasoning: 'fallback',
    })
  })

  it('devuelve el fallback duro cuando fetchAsBase64 falla', async () => {
    vi.mocked(fetchAsBase64).mockRejectedValue(new Error('photo not found'))
    const result = await classifyNiche(
      baseSession({
        product_photo_urls: ['https://example.com/photo.png'],
      })
    )
    expect(result).toEqual({
      niche_id: 'generic',
      demographic_id: 'female_30_45',
      confidence: 0,
      reasoning: 'fallback',
    })
    expect(fetchAsBase64).toHaveBeenCalledWith('https://example.com/photo.png')
  })
})
