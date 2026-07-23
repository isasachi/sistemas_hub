import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/gemini', () => ({
  callStructured: vi.fn().mockRejectedValue(new Error('gemini down')),
}))

import { classifyNiche } from './classify'
import type { LandingSessionResponse } from './types'

function baseSession(): LandingSessionResponse {
  return {
    product_photo_urls: null,
    product_labels: null,
    benefits: null,
    audience: null,
  } as unknown as LandingSessionResponse
}

describe('classifyNiche', () => {
  it('devuelve el fallback duro generic/default-demo cuando callStructured falla', async () => {
    const result = await classifyNiche(baseSession())
    expect(result).toEqual({
      niche_id: 'generic',
      demographic_id: 'female_30_45',
      confidence: 0,
      reasoning: 'fallback',
    })
  })
})
