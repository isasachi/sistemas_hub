import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(),
}))

vi.mock('@/lib/storage', () => {
  class PayloadTooLargeError extends Error {}
  return { fetchAsBase64: vi.fn(), PayloadTooLargeError }
})

vi.mock('@/lib/gemini', () => ({
  geminiCallStructured: vi.fn(),
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
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { fetchAsBase64, PayloadTooLargeError } from '@/lib/storage'
import { geminiCallStructured } from '@/lib/gemini'
import type { VideoSessionResponse } from '@/lib/video-ads/types'

// Hallazgo 4: el tope de MAX_VIDEO_MB solo se validaba en el browser
// (Section0Reference). Del lado servidor, un request armado a mano se lo saltaba y
// `fetchAsBase64` bufferizaba el video entero en memoria sin mirar su tamaño. Estos
// tests cubren el guard real en la ruta, no el guard de UX del cliente.

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/generador-video-ads/sessions/s1/analyze-reference', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function ctx(id = 's1') {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/generador-video-ads/sessions/[id]/analyze-reference — guard de tamaño', () => {
  beforeEach(() => vi.clearAllMocks())

  it('413 con mensaje en español cuando el video excede el tope, sin llamar a Gemini', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({ id: 's1' } as unknown as VideoSessionResponse)
    vi.mocked(fetchAsBase64).mockRejectedValue(new PayloadTooLargeError('El archivo pesa más de 14 MB.'))

    const res = await POST(req({ videoUrl: 'https://x.supabase.co/reference-video.mp4' }), ctx())
    const data = await res.json()

    expect(res.status).toBe(413)
    expect(data.error).toMatch(/14 MB/)
    expect(geminiCallStructured).not.toHaveBeenCalled()
    expect(updateVideoSession).not.toHaveBeenCalled()
  })

  it('procede normalmente cuando el video está dentro del tope', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({ id: 's1' } as unknown as VideoSessionResponse)
    vi.mocked(fetchAsBase64).mockResolvedValue({ data: 'YWJj', mimeType: 'video/mp4' })
    vi.mocked(geminiCallStructured).mockResolvedValue({ guionOriginal: 'x' })

    const res = await POST(req({ videoUrl: 'https://x.supabase.co/reference-video.mp4' }), ctx())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.analysis).toEqual({ guionOriginal: 'x' })
    expect(updateVideoSession).toHaveBeenCalled()
  })

  it('otros errores de fetchAsBase64 siguen devolviendo el 500 genérico', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({ id: 's1' } as unknown as VideoSessionResponse)
    vi.mocked(fetchAsBase64).mockRejectedValue(new Error('network blew up'))

    const res = await POST(req({ videoUrl: 'https://x.supabase.co/reference-video.mp4' }), ctx())
    expect(res.status).toBe(500)
  })
})
