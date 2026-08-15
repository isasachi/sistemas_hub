import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/landing/db', () => ({
  getLandingSession: vi.fn(),
  updateLandingSession: vi.fn(),
}))

vi.mock('@/lib/landing/classify', () => ({
  classifyNiche: vi.fn(),
}))

vi.mock('@/lib/gen-quota', () => ({
  checkGenQuota: vi.fn().mockResolvedValue({ blocked: null, regensLeft: null }),
  recordGenQuota: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/product-hunter/session', () => ({
  readUserId: vi.fn().mockResolvedValue('user-1'),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'
import { getLandingSession, updateLandingSession } from '@/lib/landing/db'
import { classifyNiche } from '@/lib/landing/classify'
import { checkGenQuota, recordGenQuota } from '@/lib/gen-quota'
import type { LandingSessionResponse } from '@/lib/landing/types'

function req(): NextRequest {
  return new NextRequest('http://localhost/api/generador-landing/sessions/s1/classify', { method: 'POST' })
}

function ctx(id = 's1') {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/generador-landing/sessions/[id]/classify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('idempotente: si la sesión ya tiene nicho, demografía Y zona, devuelve el cacheado sin llamar a classifyNiche ni gastar quota', async () => {
    vi.mocked(getLandingSession).mockResolvedValue({
      id: 's1',
      niche_id: 'salud',
      demographic_id: 'female_30_45',
      body_focus: 'rodilla',
    } as unknown as LandingSessionResponse)

    const res = await POST(req(), ctx())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({
      niche_id: 'salud',
      demographic_id: 'female_30_45',
      body_focus: 'rodilla',
      confidence: 1,
      reasoning: 'ya clasificado',
    })
    expect(classifyNiche).not.toHaveBeenCalled()
    expect(updateLandingSession).not.toHaveBeenCalled()
    expect(checkGenQuota).not.toHaveBeenCalled()
    expect(recordGenQuota).not.toHaveBeenCalled()
  })

  it('sin clasificar aún: llama a classifyNiche, persiste y registra la quota', async () => {
    vi.mocked(getLandingSession).mockResolvedValue({
      id: 's1',
      niche_id: null,
      demographic_id: null,
    } as unknown as LandingSessionResponse)
    vi.mocked(classifyNiche).mockResolvedValue({
      niche_id: 'generic',
      demographic_id: 'female_30_45',
      body_focus: 'rostro',
      confidence: 0.9,
      reasoning: 'match por producto',
    })

    const res = await POST(req(), ctx())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({
      niche_id: 'generic',
      demographic_id: 'female_30_45',
      body_focus: 'rostro',
      confidence: 0.9,
      reasoning: 'match por producto',
    })
    expect(classifyNiche).toHaveBeenCalledTimes(1)
    expect(updateLandingSession).toHaveBeenCalledWith('s1', { niche_id: 'generic', demographic_id: 'female_30_45', body_focus: 'rostro' })
    expect(recordGenQuota).toHaveBeenCalledTimes(1)
  })

  it('404 cuando la sesión no existe', async () => {
    vi.mocked(getLandingSession).mockResolvedValue(null)
    const res = await POST(req(), ctx())
    expect(res.status).toBe(404)
    expect(classifyNiche).not.toHaveBeenCalled()
  })
})
