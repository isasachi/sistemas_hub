import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/video-ads/db', () => ({ getVideoSession: vi.fn(), updateVideoSession: vi.fn() }))
vi.mock('@/lib/video-ads/kie', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/video-ads/kie')>()),
  createVideoTask: vi.fn(),
}))
vi.mock('@/lib/gen-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gen-quota')>()),
  checkGlobalBackstop: vi.fn().mockResolvedValue({ blocked: null }),
  recordGenQuota: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/product-hunter/session', () => ({ readUserId: vi.fn().mockResolvedValue('user-1') }))
vi.mock('@/lib/user-settings', () => ({ currentKieKey: vi.fn() }))

import { NextRequest } from 'next/server'
import { POST } from './route'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { createVideoTask } from '@/lib/video-ads/kie'
import { recordGenQuota } from '@/lib/gen-quota'
import { currentKieKey } from '@/lib/user-settings'
import { groupIntoLotes, type Lote } from '@/lib/video-ads/lotes'
import type { VideoSessionResponse } from '@/lib/video-ads/types'

const req = (body: unknown) => new NextRequest('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const ctx = { params: Promise.resolve({ id: 's1' }) }
const VOZ = {
  idioma: 'es', varianteRegional: 'PE', acento: 'peruano', pronunciacion: 'clara', ritmo: 'medio', velocidad: 'media',
  entonacion: 'natural', energia: 'media', pausas: 'breves', tono: 'cálido', timbre: 'medio', edadVocal: '25-30', estilo: 'cercano',
}
const toma = (n: number) => ({ n, tiempoOriginal: `00:0${n}`, duracionSeg: 10, accionVisual: `acción ${n}`, personaje: 'M', producto: 'F', locucion: `línea ${n}` })
const ADAPTED = { guionFinal: 'x', caracteresAdaptado: 1, diferenciaCaracteres: 0, tomas: [toma(1), toma(2)], variablesPendientes: [] as string[] }
// Dos lotes ya renderizados, con su clip y su huella.
const guardados: Lote[] = groupIntoLotes(ADAPTED.tomas).map((l) => ({
  ...l, prompt: 'viejo', taskId: `t${l.n}`, status: 'success', videoUrl: `https://b/lote-${l.n}.mp4`, scriptHash: 'h-vieja',
}))
const session = (over: Partial<VideoSessionResponse> = {}) => ({
  id: 's1', adapted: ADAPTED, voice_profile: VOZ, consistency_block: 'M',
  character_url: 'https://x.supabase.co/c.png', avatar_url: 'https://x.supabase.co/a.png', product_url: 'https://x.supabase.co/p.png',
  product_scan: null, forensic_analysis: null, lotes: guardados, render_done: true, ...over,
}) as unknown as VideoSessionResponse

describe('POST rerender-lote', () => {
  beforeEach(() => {
    vi.mocked(getVideoSession).mockReset(); vi.mocked(updateVideoSession).mockReset(); vi.mocked(createVideoTask).mockReset()
    vi.mocked(currentKieKey).mockResolvedValue('key-usuario')
  })

  it('re-renderiza SOLO el lote pedido, con el prompt actual y la huella actual, y no toca a los hermanos', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())
    vi.mocked(createVideoTask).mockResolvedValue('t-nuevo')
    const res = await POST(req({ n: 2 }), ctx)
    expect(res.status).toBe(200)
    expect(createVideoTask).toHaveBeenCalledTimes(1)
    const { lotes } = (await res.json()) as { lotes: Lote[] }
    expect(lotes[0]).toEqual(guardados[0])
    expect(lotes[1]).toMatchObject({ n: 2, taskId: 't-nuevo', status: 'waiting', videoUrl: null })
    expect(lotes[1].prompt).toContain('línea 2')
    expect(lotes[1].scriptHash).not.toBe('h-vieja')
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ render_done: false }))
    expect(recordGenQuota).toHaveBeenCalledWith('s1', 'video-render', 'user-1')
  })

  it('sin key del usuario: 400 sin llamar a KIE ni escribir', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session())
    vi.mocked(currentKieKey).mockResolvedValue(null)
    const res = await POST(req({ n: 1 }), ctx)
    expect(res.status).toBe(400)
    expect(createVideoTask).not.toHaveBeenCalled()
    expect(updateVideoSession).not.toHaveBeenCalled()
  })

  it('si el guión ya produce otra cantidad de lotes, 409: un clip suelto no tiene a qué pegarse', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({ adapted: { ...ADAPTED, tomas: [toma(1)] } }))
    const res = await POST(req({ n: 1 }), ctx)
    expect(res.status).toBe(409)
    expect(createVideoTask).not.toHaveBeenCalled()
  })

  it('un lote que todavía se renderiza no se duplica (409), y un n inexistente es 400', async () => {
    vi.mocked(getVideoSession).mockResolvedValue(session({ lotes: [guardados[0], { ...guardados[1], status: 'generating', videoUrl: null }] }))
    expect((await POST(req({ n: 2 }), ctx)).status).toBe(409)
    expect((await POST(req({ n: 9 }), ctx)).status).toBe(400)
    expect(createVideoTask).not.toHaveBeenCalled()
  })
})
