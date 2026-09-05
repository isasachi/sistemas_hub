import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import type { VideoSessionResponse } from '@/lib/video-ads/types'

// Fix de la revisión: `Section2Character` sube la foto directo al bucket
// (uploadDirect) y nunca había una ruta que persistiera esa URL en la sesión —
// `session.character_url` se quedaba en null para siempre y "Personaje" nunca
// podía confirmarse por imagen. Ahora esta ruta recibe `characterUrl` (si llega,
// foto recién subida en este mismo submit) y hace merge con lo que ya tenía la
// fila antes de construir la matriz.

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/generador-video-ads/sessions/s1/inputs', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function ctx(id = 's1') {
  return { params: Promise.resolve({ id }) }
}

const FULL_BODY = {
  productName: 'Serum Eunoia',
  productDescription: 'Suero de niacinamida',
  angle: 'Testimonio',
  targetAudience: 'Mujeres 20-35',
  problem: 'Marcas de acné',
  characterDesc: '',
  characterEthnicity: 'Latina peruana',
  accent: 'Español peruano de Lima',
  voice: '',
  constraints: '',
}

function session(overrides: Partial<VideoSessionResponse> = {}) {
  return { id: 's1', step: 2, character_url: null, ...overrides } as unknown as VideoSessionResponse
}

describe('POST /api/generador-video-ads/sessions/[id]/inputs — persistencia de character_url', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persiste la characterUrl del body cuando llega (foto recién subida en este paso)', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({ character_url: null }))

    const res = await POST(req({ ...FULL_BODY, characterUrl: 'https://x.supabase.co/character.png' }), ctx())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ character_url: 'https://x.supabase.co/character.png' }))
    // Sin descripción de personaje, pero CON imagen: "Personaje" confirma por REFERENCIA.
    const personaje = data.validation.rows.find((r: { variable: string }) => r.variable === 'Personaje')
    expect(personaje.estado).toBe('CONFIRMADA')
    expect(personaje.fuente).toBe('REFERENCIA')
  })

  it('conserva la character_url que ya tenía la sesión si el body no manda una nueva', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({ character_url: 'https://x.supabase.co/ya-subida.png' }))

    const res = await POST(req(FULL_BODY), ctx())
    await res.json()

    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ character_url: 'https://x.supabase.co/ya-subida.png' }))
  })

  it('sin foto en el body ni en la sesión, "Personaje" depende de characterDesc', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({ character_url: null }))

    const res = await POST(req(FULL_BODY), ctx()) // characterDesc: '' en FULL_BODY
    const data = await res.json()

    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ character_url: null }))
    const personaje = data.validation.rows.find((r: { variable: string }) => r.variable === 'Personaje')
    expect(personaje.estado).toBe('PENDIENTE')
  })

  it('404 cuando la sesión no existe', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(null)
    const res = await POST(req(FULL_BODY), ctx())
    expect(res.status).toBe(404)
    expect(updateVideoSession).not.toHaveBeenCalled()
  })
})
