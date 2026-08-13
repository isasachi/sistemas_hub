import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/video-ads/db', () => ({
  getVideoSession: vi.fn(),
  updateVideoSession: vi.fn(),
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
import type { ValidationMatrix } from '@/lib/video-ads/validation'

// Fix de la revisión: la ruta solo miraba `forensic_analysis`, no la matriz de la
// FASE 0. Con eso, el botón deshabilitado de Section3Validation era la ÚNICA
// barrera — evitable pegándole directo a la ruta, o navegando el riel (Task 7
// fix round 1). Estos tests cubren el guard real, en el servidor.

function req(): NextRequest {
  return new NextRequest('http://localhost/api/generador-video-ads/sessions/s1/extract-template', {
    method: 'POST',
  })
}

function ctx(id = 's1') {
  return { params: Promise.resolve({ id }) }
}

const FORENSIC = {
  guionOriginal: 'Este serum me cambió la piel.',
  cortes: [{ n: 1, dialogo: 'Este serum me cambió la piel.', duracionSeg: 6, accion: 'Sostiene el frasco.' }],
  sujeto: '', vestuario: '', producto: '', fondo: '',
  edicion: {},
} as unknown as VideoSessionResponse['forensic_analysis']

const OK_MATRIX: ValidationMatrix = {
  rows: [{ variable: 'Acento', valor: 'Español peruano', fuente: 'USUARIO', estado: 'CONFIRMADA', critica: true }],
  pending: [],
}

const PENDING_MATRIX: ValidationMatrix = {
  rows: [{ variable: 'Acento', valor: '[CONFIRMACIÓN REQUERIDA: especificar] Acento', fuente: 'USUARIO', estado: 'PENDIENTE', critica: true }],
  pending: ['Acento'],
}

describe('POST /api/generador-video-ads/sessions/[id]/extract-template', () => {
  beforeEach(() => vi.clearAllMocks())

  it('409 si la sesión nunca completó la FASE 0 (validation null)', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({
      forensic_analysis: FORENSIC,
      validation: null,
    } as unknown as VideoSessionResponse)

    const res = await POST(req(), ctx())
    expect(res.status).toBe(409)
    expect(callStructured).not.toHaveBeenCalled()
    expect(updateVideoSession).not.toHaveBeenCalled()
  })

  it('409 si la matriz tiene una crítica PENDIENTE (editaste y volviste a pedir la plantilla)', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({
      forensic_analysis: FORENSIC,
      validation: PENDING_MATRIX,
    } as unknown as VideoSessionResponse)

    const res = await POST(req(), ctx())
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toMatch(/validación/i)
    expect(callStructured).not.toHaveBeenCalled()
  })

  it('procede cuando la matriz está toda CONFIRMADA', async () => {
    vi.mocked(getVideoSession).mockResolvedValue({
      forensic_analysis: FORENSIC,
      validation: OK_MATRIX,
    } as unknown as VideoSessionResponse)
    vi.mocked(callStructured).mockResolvedValue({
      locuciones: [{ n: 1, texto: 'Este [producto] me cambió la piel.' }],
      escenario: {}, edicion: {}, resumenParaUsuario: 'ok',
    })

    const res = await POST(req(), ctx())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.template.guionFillInBlank).toBe('Este [producto] me cambió la piel.')
    expect(data.template.tomas).toHaveLength(1)
    expect(callStructured).toHaveBeenCalledTimes(1)
    expect(updateVideoSession).toHaveBeenCalledWith('s1', expect.objectContaining({ step: 4 }))
  })
})
