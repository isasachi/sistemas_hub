import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/product-hunter/session', () => ({
  readUserId: vi.fn().mockResolvedValue('user-1'),
}))

vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  deleteVideoSession: vi.fn(),
}))

import { GET, DELETE } from './route'
import { getVideoSession, deleteVideoSession } from '@/lib/video-ads/db'
import { readUserId } from '@/lib/product-hunter/session'

const params = Promise.resolve({ id: 'sess-1' })
const req = () => new NextRequest('http://localhost/api/generador-video-ads/sessions/sess-1')

describe('GET/DELETE de una sesión de video — pertenencia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readUserId).mockResolvedValue('user-1')
  })

  it('el GET consulta con el dueño resuelto, no solo con el id', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({ id: 'sess-1' } as never)
    await GET(req(), { params })
    expect(getVideoSession).toHaveBeenCalledWith('sess-1', 'user-1')
  })

  it('una sesión ajena es indistinguible de una que no existe: 404', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(null)
    const res = await GET(req(), { params })
    expect(res.status).toBe(404)
  })

  // El guard que importa: PostgREST no falla si el DELETE no matchea nada, así que
  // sin mirar el resultado responderíamos `ok` sobre una sesión ajena que sigue viva.
  it('un DELETE que no borró nada responde 404, nunca ok', async () => {
    vi.mocked(deleteVideoSession).mockResolvedValue(false)
    const res = await DELETE(req(), { params })
    expect(res.status).toBe(404)
    expect(deleteVideoSession).toHaveBeenCalledWith('sess-1', 'user-1')
  })

  it('un DELETE que sí borró responde ok', async () => {
    vi.mocked(deleteVideoSession).mockResolvedValue(true)
    const res = await DELETE(req(), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
