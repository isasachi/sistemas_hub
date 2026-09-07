import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(),
}))

vi.mock('@/lib/storage', () => {
  class PayloadTooLargeError extends Error {}
  return { fetchAsBase64: vi.fn(), headStorageFile: vi.fn(), PayloadTooLargeError }
})

vi.mock('@/lib/gemini', () => ({
  geminiCallStructured: vi.fn(),
  geminiEsDirecto: vi.fn().mockReturnValue(false),
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
import { fetchAsBase64, headStorageFile, PayloadTooLargeError } from '@/lib/storage'
import { geminiCallStructured, geminiEsDirecto } from '@/lib/gemini'
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
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(geminiEsDirecto).mockReturnValue(false)
    vi.mocked(headStorageFile).mockResolvedValue({ mimeType: 'video/mp4' })
  })

  it('413 con mensaje en español cuando el video excede el tope, sin llamar a Gemini', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({ id: 's1' } as unknown as VideoSessionResponse)
    vi.mocked(headStorageFile).mockRejectedValue(new PayloadTooLargeError('El archivo pesa más de 14 MB.'))

    const res = await POST(req({ videoUrl: 'https://x.supabase.co/reference-video.mp4' }), ctx())
    const data = await res.json()

    expect(res.status).toBe(413)
    expect(data.error).toMatch(/14 MB/)
    expect(geminiCallStructured).not.toHaveBeenCalled()
    expect(updateVideoSession).not.toHaveBeenCalled()
  })

  it('procede normalmente cuando el video está dentro del tope', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({ id: 's1' } as unknown as VideoSessionResponse)
    // El modelo devuelve un conteo estimado y lo estima MAL: en una corrida real reportó
    // 562 caracteres sobre un guión de 776. Ese número es la referencia contra la que se
    // mide si el guión adaptado se fue de largo, así que el servidor lo recalcula.
    vi.mocked(geminiCallStructured).mockResolvedValue({ guionOriginal: 'hola', caracteresGuion: 999 })

    const res = await POST(req({ videoUrl: 'https://x.supabase.co/reference-video.mp4' }), ctx())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.analysis.caracteresGuion).toBe(4)
    expect(updateVideoSession).toHaveBeenCalled()
    expect(vi.mocked(updateVideoSession).mock.calls[0][1].forensic_analysis)
      .toMatchObject({ caracteresGuion: 4 })
  })

  it('otros errores al mirar el archivo siguen devolviendo el 500 genérico', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({ id: 's1' } as unknown as VideoSessionResponse)
    vi.mocked(headStorageFile).mockRejectedValue(new Error('network blew up'))

    const res = await POST(req({ videoUrl: 'https://x.supabase.co/reference-video.mp4' }), ctx())
    expect(res.status).toBe(500)
  })

  // Falló en producción con este mismo video: el texto y la visión de Gemini salen hoy
  // por KIE, y ahí un data URI de video es un 400 duro ("Inline data URL is too large.
  // Upload the file and pass an HTTP(S) URL instead") tras 60 s de espera. El video ya
  // vive en el bucket: se manda su URL y KIE se lo baja.
  it('el video viaja como URL, NUNCA en base64', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({ id: 's1' } as unknown as VideoSessionResponse)
    vi.mocked(geminiCallStructured).mockResolvedValue({ guionOriginal: 'hola', caracteresGuion: 1 })

    await POST(req({ videoUrl: 'https://x.supabase.co/reference-video.mp4' }), ctx())

    expect(fetchAsBase64).not.toHaveBeenCalled()
    const parts = vi.mocked(geminiCallStructured).mock.calls[0][2]
    expect(parts[0]).toEqual({
      fileData: { fileUri: 'https://x.supabase.co/reference-video.mp4', mimeType: 'video/mp4' },
    })
  })

  // El escape `GEMINI_VIA=direct` devuelve el recurso al SDK de Google, que solo acepta
  // un `fileUri` de su propia Files API — ahí sí hay que mandar los bytes.
  it('con GEMINI_VIA=direct vuelve a mandarlo inline', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({ id: 's1' } as unknown as VideoSessionResponse)
    vi.mocked(geminiEsDirecto).mockReturnValue(true)
    vi.mocked(fetchAsBase64).mockResolvedValue({ data: 'YWJj', mimeType: 'video/mp4' })
    vi.mocked(geminiCallStructured).mockResolvedValue({ guionOriginal: 'hola', caracteresGuion: 1 })

    await POST(req({ videoUrl: 'https://x.supabase.co/reference-video.mp4' }), ctx())

    const parts = vi.mocked(geminiCallStructured).mock.calls[0][2]
    expect(parts[0]).toEqual({ inlineData: { data: 'YWJj', mimeType: 'video/mp4' } })
  })

  // El default de `lib/gemini` es el motor de anuncios ESTÁTICOS, que manda declarar la
  // posición física del producto "ending with the negative: No está flotando." — dentro
  // del análisis de un VIDEO eso contamina los campos de coreografía.
  it('analiza bajo el system prompt del video, no el de anuncios estáticos', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({ id: 's1' } as unknown as VideoSessionResponse)
    vi.mocked(geminiCallStructured).mockResolvedValue({ guionOriginal: 'hola', caracteresGuion: 1 })

    await POST(req({ videoUrl: 'https://x.supabase.co/reference-video.mp4' }), ctx())

    const system = vi.mocked(geminiCallStructured).mock.calls[0][4] as string
    expect(system).toContain('video ad replication engine')
    expect(system).not.toContain('No está flotando')
  })
})
