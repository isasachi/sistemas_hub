import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(),
}))

vi.mock('@/lib/video-ads/kie', () => ({
  getTaskDetail: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  uploadToStorage: vi.fn(),
}))

import { NextRequest } from 'next/server'
import { GET } from './route'
import { getVideoSession, updateVideoSession } from '@/lib/video-ads/db'
import { getTaskDetail } from '@/lib/video-ads/kie'
import type { VideoSessionResponse } from '@/lib/video-ads/types'
import type { Lote } from '@/lib/video-ads/lotes'

// Fix round 6 — bug de la re-revisión: `changed` solo se enciende si ALGÚN lote se
// movió EN ESTA pasada. Una fila legada (lote 1 ya mirroreado, lotes 2-4 `idle` sin
// `taskId`) no mueve NINGUNO de los dos en un sondeo: el lote mirroreado toma el
// primer `continue` (ya tiene host propio), los `idle` toman el segundo `continue`
// (sin `taskId`, ni siquiera llegan a pedir `getTaskDetail`) — cero llamadas de red,
// por eso este archivo no necesita mockear `fetch` para cubrir el caso real que
// reportó la revisión. Sin el fix, `render_done` desincronizado (por ejemplo, el
// backfill de la migración) nunca se corregía: el `done` correcto se calculaba, se
// devolvía en el JSON y se descartaba.

const OUR_HOST = 'https://myproj.supabase.co'

function req(): NextRequest {
  return new NextRequest('http://localhost/api/generador-video-ads/sessions/s1/lote-status')
}

function ctx(id = 's1') {
  return { params: Promise.resolve({ id }) }
}

const idleLote = (n: number): Lote => ({
  n, tomas: [], duracionSeg: 10, prompt: '', taskId: null, status: 'idle',
  videoUrl: null, failMsg: null, scriptHash: 'h',
})

const mirroredLote = (n: number): Lote => ({
  n, tomas: [], duracionSeg: 10, prompt: `p${n}`, taskId: `t${n}`, status: 'success',
  videoUrl: `${OUR_HOST}/storage/v1/object/public/videos/s1/lote-${n}.mp4`,
  failMsg: null, scriptHash: 'h',
})

function session(lotes: Lote[], renderDone: boolean): VideoSessionResponse {
  return { id: 's1', lotes, render_done: renderDone } as unknown as VideoSessionResponse
}

describe('GET lote-status — render_done desincronizado sin lotes que se muevan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = OUR_HOST
    process.env.NEXT_PUBLIC_SUPABASE_URL = OUR_HOST
  })

  afterEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
  })

  it('fila legada (1 lote mirroreado, 3 idle): render_done=true en la fila pero el render NO está completo — se corrige', async () => {
    const lotes = [mirroredLote(1), idleLote(2), idleLote(3), idleLote(4)]
    vi.mocked(getVideoSession).mockResolvedValue(session(lotes, true))

    const res = await GET(req(), ctx())
    const body = await res.json()

    // El JSON siempre fue correcto — el bug era que no se persistía.
    expect(body.done).toBe(false)

    // Cero llamadas de red: el lote mirroreado no vuelve a copiarse, los idle sin
    // taskId ni siquiera piden estado a KIE.
    expect(getTaskDetail).not.toHaveBeenCalled()

    // El fix: aunque ningún lote individual cambió, `done !== session.render_done`
    // (false !== true) fuerza la escritura que corrige la columna cacheada.
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ render_done: false }))
  })

  it('render completo y render_done ya en true: no hay nada que corregir, no se escribe', async () => {
    const lotes = [mirroredLote(1), mirroredLote(2)]
    vi.mocked(getVideoSession).mockResolvedValue(session(lotes, true))

    const res = await GET(req(), ctx())
    const body = await res.json()

    expect(body.done).toBe(true)
    expect(updateVideoSession).not.toHaveBeenCalled()
  })

  it('render a medias y render_done ya en false (caso sano, sin backfill de por medio): tampoco escribe de más', async () => {
    const lotes = [mirroredLote(1), idleLote(2)]
    vi.mocked(getVideoSession).mockResolvedValue(session(lotes, false))

    const res = await GET(req(), ctx())
    const body = await res.json()

    expect(body.done).toBe(false)
    expect(updateVideoSession).not.toHaveBeenCalled()
  })

  it('un lote SÍ cambia (KIE reporta éxito): sigue escribiendo por `changed`, con el render_done recalculado', async () => {
    const lotes = [idleLoteConTask(1)]
    vi.mocked(getVideoSession).mockResolvedValue(session(lotes, false))
    vi.mocked(getTaskDetail).mockResolvedValue({ state: 'fail', progress: 0, videoUrl: null, failMsg: 'boom' })

    const res = await GET(req(), ctx())
    const body = await res.json()

    expect(body.done).toBe(true) // único lote, terminó en fail explícito
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ render_done: true }))
  })
})

function idleLoteConTask(n: number): Lote {
  return { ...idleLote(n), taskId: `t${n}`, status: 'waiting' }
}
