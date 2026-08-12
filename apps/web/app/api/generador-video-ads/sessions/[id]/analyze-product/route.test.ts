import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  uploadToStorage: vi.fn().mockResolvedValue('https://x.supabase.co/product.jpg'),
}))

vi.mock('@/lib/gemini', () => ({
  callStructured: vi.fn(),
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
import { callStructured } from '@/lib/gemini'
import type { VideoSessionResponse } from '@/lib/video-ads/types'

// Fix de la revisión final (Hallazgo 1 + 2):
// 1. `angle` y `problem` los exige Section1Product en el cliente pero antes de este
//    fix nunca viajaban al servidor — se persistían recién en el POST a /inputs del
//    paso siguiente. Recargar entre pasos los perdía, y recuperarlos requería
//    re-subir la foto y pagar de nuevo esta llamada a Gemini. Ahora viajan en el
//    mismo FormData y se persisten acá.
// 2. La ruta escribía `step: 3` (índice de "Producto" en el wizard VIEJO de 3 modos).
//    En el wizard de una sola línea de entrada, "Producto" es el índice 1 y el
//    siguiente paso ("Personaje") es el 2 — no el 3 ("Validación"). Con el bug,
//    reanudar una sesión aterrizaba en Validación sin `validation` y
//    `Section3Validation` devolvía null: pantalla en blanco.

function req(fields: Record<string, string | undefined>, opts: { withFile?: boolean } = { withFile: true }): NextRequest {
  const fd = new FormData()
  if (opts.withFile !== false) fd.append('product', new Blob(['bytes'], { type: 'image/jpeg' }), 'p.jpg')
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v)
  return new NextRequest('http://localhost/api/generador-video-ads/sessions/s1/analyze-product', {
    method: 'POST',
    body: fd,
  })
}

function ctx(id = 's1') {
  return { params: Promise.resolve({ id }) }
}

const FULL_FIELDS = {
  productName: 'Serum Eunoia',
  whatItDoes: 'Suero de niacinamida',
  targetAudience: 'Mujeres 20-35',
  angle: 'Testimonio de resultados en 4 semanas',
  problem: 'Marcas de acné que no se van',
}

const FORENSIC = { guionOriginal: 'x' } as unknown as VideoSessionResponse['forensic_analysis']

function session(overrides: Partial<VideoSessionResponse> = {}) {
  return { id: 's1', forensic_analysis: FORENSIC, character_url: null, ...overrides } as unknown as VideoSessionResponse
}

describe('POST /api/generador-video-ads/sessions/[id]/analyze-product', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persiste angle y problem junto con el resto de los datos del producto', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())
    vi.mocked(callStructured).mockResolvedValue({ shape: 'bottle' })

    const res = await POST(req(FULL_FIELDS), ctx())
    expect(res.status).toBe(200)
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({
      angle: 'Testimonio de resultados en 4 semanas',
      problem: 'Marcas de acné que no se van',
    }))
  })

  it('avanza al índice de "Personaje" (2), no al viejo índice de "Producto" (3)', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())
    vi.mocked(callStructured).mockResolvedValue({ shape: 'bottle' })

    await POST(req(FULL_FIELDS), ctx())
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ step: 2 }))
  })

  it('400 si falta angle o problem, y NO llama a Gemini (no se paga por datos incompletos)', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())

    const res = await POST(req({ ...FULL_FIELDS, angle: undefined }), ctx())
    expect(res.status).toBe(400)
    expect(callStructured).not.toHaveBeenCalled()
    expect(updateVideoSession).not.toHaveBeenCalled()
  })

  it('409 si la sesión no tiene forensic_analysis, aunque tenga character_url', async () => {
    // Regresión: el guard viejo (`!forensic_analysis && !character_url`) es de los
    // modos eliminados (character-ref/character-gen). Con character_url solo, sin
    // haber analizado ninguna referencia, esta llamada pagada NO debe correr —
    // character_url se puede persistir gratis vía POST /inputs sin pasar por acá.
    vi.mocked(getVideoSession).mockResolvedValue(
      session({ forensic_analysis: null, character_url: 'https://x.supabase.co/character.png' }),
    )

    const res = await POST(req(FULL_FIELDS), ctx())
    expect(res.status).toBe(409)
    expect(callStructured).not.toHaveBeenCalled()
  })
})
